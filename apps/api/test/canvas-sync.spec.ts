import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CanvasService, fixtureSource } from '../src/canvas';
import { RequestUser } from '../src/common';
import { PrismaService } from '../src/prisma.service';
import { CanvasProvider, FixtureCanvasProvider } from '../src/integrations/canvas/canvas-provider';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('Canvas complete-batch synchronization with PostgreSQL (ToR 9/10/19)', () => {
  let app: INestApplication, db: PrismaService, sync: CanvasService;
  let user: RequestUser, other: RequestUser, token: string;
  const marker = `canvas-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const env = { NODE_ENV: process.env.NODE_ENV, CANVAS_MODE: process.env.CANVAS_MODE };
  const provider = { fetchAcademicSnapshot: jest.fn() };
  const fixture = () => new FixtureCanvasProvider().fetchAcademicSnapshot();
  const client = () => request(app.getHttpServer());
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.CANVAS_MODE = 'fixture';
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CanvasProvider).useValue(provider).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); sync = app.get(CanvasService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'canvas-regression-password-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { user = response.body.user; token = `Bearer ${response.body.accessToken}`; } else other = response.body.user;
    }
  });
  beforeEach(async () => {
    provider.fetchAcademicSnapshot.mockReset().mockImplementation(fixture);
    await db.academicItem.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await db.course.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await db.canvasConnection.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await sync.connectFixture(user);
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } });
    if (app) await app.close();
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  it('imports idempotently, preserves selection/history, and updates a changed deadline in place', async () => {
    await client().post('/canvas/sync').set('Authorization', token).expect(201);
    const first = await db.academicItem.findFirstOrThrow({ where: { userId: user.id, source: fixtureSource, externalId: '92001' } });
    await db.academicItem.update({ where: { id: first.id }, data: { mainGoalDate: '2026-10-10' } });
    const success = (await db.canvasConnection.findUniqueOrThrow({ where: { userId: user.id } })).lastSuccessfulSyncAt;
    await sync.connectFixture(user);
    expect((await db.canvasConnection.findUniqueOrThrow({ where: { userId: user.id } })).lastSuccessfulSyncAt).toEqual(success);
    await sync.sync(user);
    expect(await db.course.count({ where: { userId: user.id } })).toBe(2);
    expect(await db.academicItem.count({ where: { userId: user.id } })).toBe(3);
    const changed = await fixture(); changed.academicItems[0].due = { kind: 'instant', at: '2026-10-11T00:00:00.000Z' };
    changed.academicItems[0].title = 'Updated proposal'; changed.academicItems[0].submissionState = 'submitted';
    provider.fetchAcademicSnapshot.mockResolvedValue(changed);
    await sync.sync(user);
    expect(await db.academicItem.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ title: 'Updated proposal',
      mainGoalDate: '2026-10-10', due: changed.academicItems[0].due, submissionState: 'submitted' });
    const snapshot = await client().get('/snapshot?date=2026-10-10').set('Authorization', token).expect(200);
    expect(snapshot.body).toMatchObject({ accountId: user.id, coverage: { from: '2026-10-10', basis: 'persisted' }, sourceStatus: { availability: 'available' } });
  });
  it.each(['network', 'malformed', 'incomplete'] as const)('preserves cached records and last success after %s failure', async mode => {
    await sync.sync(user);
    const before = await db.academicItem.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
    const success = (await db.canvasConnection.findUniqueOrThrow({ where: { userId: user.id } })).lastSuccessfulSyncAt;
    if (mode === 'network') provider.fetchAcademicSnapshot.mockRejectedValue(new Error('do-not-expose-secret'));
    else {
      const batch = await fixture();
      provider.fetchAcademicSnapshot.mockResolvedValue(mode === 'malformed' ? { ...batch, academicItems: [...batch.academicItems, {}] } : { ...batch, status: 'incomplete' });
    }
    await expect(sync.sync(user)).rejects.toThrow('Canvas source unavailable or invalid');
    expect(await db.academicItem.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } })).toEqual(before);
    expect(await db.canvasConnection.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({ lastSuccessfulSyncAt: success, lastError: 'Canvas source unavailable or invalid' });
    const today = await client().get('/today?date=2026-10-10').set('Authorization', token).expect(200);
    expect(today.body.sourceStatus.availability).toBe('unavailable');
    expect(today.body.items.some((item: { entityId: string }) => item.entityId === before.find(item => item.externalId === '92001')!.id)).toBe(true);
  });
  it('rolls back earlier entity writes and freshness if a later database write fails', async () => {
    // Force a real DB constraint failure in the same transaction after entity/freshness writes.
    const existing = await db.course.create({ data: { userId: other.id, source: 'other', externalId: 'other', name: 'Other' } });
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(async tx => {
      await work(tx);
      await tx.course.create({ data: { id: existing.id, userId: user.id, source: fixtureSource, externalId: 'duplicate', name: 'Fail' } });
    })) as unknown as typeof db.$transaction);
    try { await expect(sync.sync(user)).rejects.toThrow(); } finally { spy.mockRestore(); }
    expect(await db.course.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.academicItem.count({ where: { userId: user.id } })).toBe(0);
    expect((await db.canvasConnection.findUniqueOrThrow({ where: { userId: user.id } })).lastSuccessfulSyncAt).toBeNull();
  });
  it('fetches in serialized order so an older run cannot overwrite a newer run', async () => {
    let entered!: () => void, release!: () => void;
    const firstEntered = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    provider.fetchAcademicSnapshot.mockImplementationOnce(async () => { entered(); await gate; const batch = await fixture(); batch.academicItems[0].title = 'Old'; return batch; })
      .mockImplementationOnce(async () => { const batch = await fixture(); batch.academicItems[0].title = 'New'; return batch; });
    const first = sync.sync(user); await firstEntered;
    const second = sync.sync(user); release(); await Promise.all([first, second]);
    expect(await db.academicItem.findFirstOrThrow({ where: { userId: user.id, externalId: '92001' } })).toMatchObject({ title: 'New' });
    expect(await db.academicItem.count({ where: { userId: user.id } })).toBe(3);
  });
  it('isolates identical external IDs by account and leaves institutional-source data intact', async () => {
    await sync.connectFixture(other); await Promise.all([sync.sync(user), sync.sync(other)]);
    expect(await db.academicItem.count({ where: { userId: user.id } })).toBe(3);
    expect(await db.academicItem.count({ where: { userId: other.id } })).toBe(3);
    const real = await db.academicItem.create({ data: { userId: user.id, source: 'canvas', externalId: '92001', title: 'Institutional record', kind: 'assignment' } });
    await sync.sync(user);
    expect(await db.academicItem.findUniqueOrThrow({ where: { id: real.id } })).toMatchObject({ title: 'Institutional record' });
  });
  it('reads Today and snapshot from cache without invoking Canvas', async () => {
    await sync.sync(user); provider.fetchAcademicSnapshot.mockReset().mockRejectedValue(new Error('offline'));
    await client().get('/today?date=2026-10-10').set('Authorization', token).expect(200);
    await client().get('/snapshot?date=2026-10-10').set('Authorization', token).expect(200);
    expect(provider.fetchAcademicSnapshot).not.toHaveBeenCalled();
  });
});
