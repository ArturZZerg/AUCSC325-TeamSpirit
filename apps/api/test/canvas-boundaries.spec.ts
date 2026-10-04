import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../src/common';
import { CanvasController, CanvasService, fixtureBaseUrl } from '../src/canvas';
import { CanvasProvider, FixtureCanvasProvider } from '../src/integrations/canvas/canvas-provider';
import { PrismaService } from '../src/prisma.service';

describe('Canvas HTTP connection and sync boundaries', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const env = { NODE_ENV: process.env.NODE_ENV, CANVAS_MODE: process.env.CANVAS_MODE };
  const prisma = {
    $transaction: jest.fn(), $queryRaw: jest.fn(), session: { findUnique: jest.fn() },
    canvasConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    course: { upsert: jest.fn() }, academicItem: { upsert: jest.fn() },
  };
  const provider = { fetchAcademicSnapshot: jest.fn() };
  const post = (path: string) => request(app.getHttpServer()).post(path).set('Authorization', 'Bearer campusflow-session');
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [CanvasController], providers: [AuthGuard, CanvasService,
      { provide: PrismaService, useValue: prisma }, { provide: CanvasProvider, useValue: provider }] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks(); process.env.NODE_ENV = 'test'; process.env.CANVAS_MODE = 'fixture';
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.session.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date('2099-01-01'),
      user: { id, email: 'student@example.test', displayName: 'Student', timeZone: 'America/Edmonton' } });
    prisma.canvasConnection.findUnique.mockResolvedValue({ userId: id, baseUrl: fixtureBaseUrl, externalAccountId: `fixture-${id}`,
      encryptedAccessToken: 'do-not-expose', lastSuccessfulSyncAt: null, lastSyncAttemptAt: null, lastError: null });
    provider.fetchAcademicSnapshot.mockImplementation(() => new FixtureCanvasProvider().fetchAcademicSnapshot());
    prisma.course.upsert.mockResolvedValue({ id: 'course-id' });
  });
  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  it.each(['/canvas/dev/connect', '/canvas/sync', '/canvas/connect'])('requires authentication for %s', async path => {
    await request(app.getHttpServer()).post(path).expect(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('never accepts personal tokens or client-selected URLs', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no network'));
    try {
      await post('/canvas/connect').send({ baseUrl: 'http://127.0.0.1', accessToken: 'private-token' }).expect(503);
      await request(app.getHttpServer()).get('/canvas/connect/start').set('Authorization', 'Bearer campusflow-session').expect(503);
      await post('/canvas/dev/connect').send({ accessToken: 'private-token' }).expect(400);
      expect(fetch).not.toHaveBeenCalled(); expect(prisma.canvasConnection.upsert).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it.each(['production', 'staging', ''])('disables fixture writes for NODE_ENV=%s', async mode => {
    process.env.NODE_ENV = mode;
    await post('/canvas/dev/connect').expect(403); await post('/canvas/sync').expect(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(['token', ''])('requires explicit fixture mode instead of CANVAS_MODE=%s', async mode => {
    process.env.CANVAS_MODE = mode;
    await post('/canvas/dev/connect').expect(403); await post('/canvas/sync').expect(403);
  });
  it('accepts body-less fixture connection and sync and rejects unknown sync input', async () => {
    await post('/canvas/dev/connect').expect(201);
    const response = await post('/canvas/sync').expect(201);
    expect(response.body).toMatchObject({ coursesUpdated: 2, academicItemsUpdated: 3, status: 'succeeded' });
    await post('/canvas/sync').send({ userId: 'other-user' }).expect(400);
  });
  it('reports a missing connection without creating data', async () => {
    prisma.canvasConnection.findUnique.mockResolvedValue(null);
    await post('/canvas/sync').expect(400); expect(prisma.course.upsert).not.toHaveBeenCalled();
  });
  it('refuses to replace or synchronize an institutional connection with fixtures', async () => {
    prisma.canvasConnection.findUnique.mockResolvedValue({ baseUrl: 'https://canvas.ualberta.ca', externalAccountId: 'real-account' });
    await post('/canvas/dev/connect').expect(403); await post('/canvas/sync').expect(503);
    expect(provider.fetchAcademicSnapshot).not.toHaveBeenCalled(); expect(prisma.canvasConnection.upsert).not.toHaveBeenCalled();
  });
  it('returns sanitized failure metadata and performs no entity writes for an invalid source', async () => {
    provider.fetchAcademicSnapshot.mockRejectedValue(new Error('private-token https://secret-source'));
    const response = await post('/canvas/sync').expect(503);
    expect(JSON.stringify(response.body)).not.toContain('private-token');
    expect(prisma.canvasConnection.update.mock.calls[0][0].data.lastError).toBe('Canvas source unavailable or invalid');
    expect(prisma.course.upsert).not.toHaveBeenCalled(); expect(prisma.academicItem.upsert).not.toHaveBeenCalled();
  });
  it('revalidates incomplete normalized batches before persistence', async () => {
    provider.fetchAcademicSnapshot.mockResolvedValue({ status: 'incomplete', courses: [], academicItems: [] });
    await post('/canvas/sync').expect(503); expect(prisma.course.upsert).not.toHaveBeenCalled();
  });
  it('bounds an unresponsive provider, aborts it, and preserves cached entities', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    provider.fetchAcademicSnapshot.mockImplementation((input: AbortSignal) => { signal = input; return new Promise(() => {}); });
    try {
      const service = app.get(CanvasService);
      const pending = expect(service.sync({ id, email: 'student@example.test', displayName: 'Student', timeZone: 'America/Edmonton' }))
        .rejects.toThrow('Canvas source unavailable or invalid');
      await jest.advanceTimersByTimeAsync(5000); await pending;
      expect(signal?.aborted).toBe(true); expect(prisma.course.upsert).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
  it('keeps stored token material out of status DTOs', async () => {
    const response = await request(app.getHttpServer()).get('/canvas/status').set('Authorization', 'Bearer campusflow-session').expect(200);
    expect(JSON.stringify(response.body)).not.toContain('do-not-expose'); expect(response.body.connected).toBe(true);
  });
});
