import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AuthGuard } from '../src/common';
import { CanvasController, CanvasService, canvasSource } from '../src/canvas';
import { CanvasHttpClient, CanvasRequestError, canvasOrigin } from '../src/integrations/canvas/canvas-http';
import { CanvasProvider } from '../src/integrations/canvas/canvas-provider';
import { canvasTokenKey, openCanvasToken, sealCanvasToken } from '../src/integrations/canvas/canvas-token';
import { ReminderService } from '../src/data';
import { PrismaService } from '../src/prisma.service';
import { runtimeConfig } from '../src/runtime-config';

const token = 'canvas-personal-token-0123456789abcdef';
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
type Route = { status?: number; body: unknown; link?: string };
function fakeFetch(routes: Record<string, Route>) {
  return jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
    const route = routes[url];
    if (!route) return new Response('[]', { status: 404 });
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200, headers: route.link ? { Link: route.link } : {} });
  }) as unknown as typeof fetch;
}
const origin = 'https://school.instructure.com';
const coursesUrl = `${origin}/api/v1/courses?enrollment_state=active&per_page=100`;
const assignmentsUrl = (id: number) => `${origin}/api/v1/courses/${id}/assignments?include[]=submission&per_page=100&order_by=due_at`;

describe('Canvas address and token storage', () => {
  it.each([['school.instructure.com', origin], ['https://School.Instructure.com/courses/12?x=1', origin], ['canvas.ualberta.ca/', 'https://canvas.ualberta.ca']])('normalizes %s to its HTTPS origin', (input, expected) => expect(canvasOrigin(input)).toBe(expected));
  it.each(['http://school.instructure.com', 'https://127.0.0.1', 'localhost', 'https://canvas:8443', 'https://user:pw@school.edu', 'intranet', 'https://canvas.local', 'https://[::1]'])('refuses %s', input => expect(() => canvasOrigin(input)).toThrow(CanvasRequestError));
  it('seals tokens per account and never stores the plain value', () => {
    const key = randomBytes(32), userId = '00000000-0000-4000-8000-000000000001';
    const sealed = sealCanvasToken(key, userId, token);
    expect(sealed).not.toContain(token); expect(openCanvasToken(key, userId, sealed)).toBe(token);
    expect(() => openCanvasToken(key, '00000000-0000-4000-8000-000000000002', sealed)).toThrow('Stored Canvas token is unavailable');
    expect(() => openCanvasToken(randomBytes(32), userId, sealed)).toThrow('Stored Canvas token is unavailable');
  });
  it('requires a canonical 32-byte key, also at production startup', () => {
    expect(() => canvasTokenKey({ CANVAS_TOKEN_KEY: 'short' })).toThrow('CANVAS_TOKEN_KEY');
    const production = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/campusflow', CORS_ORIGIN: 'https://app.example.test', CANVAS_MODE: 'token' };
    expect(() => runtimeConfig(production)).toThrow('CANVAS_TOKEN_KEY');
    expect(() => runtimeConfig({ ...production, CANVAS_TOKEN_KEY: randomBytes(32).toString('base64') })).not.toThrow();
  });
});

describe('Canvas HTTP client', () => {
  const client = (routes: Record<string, Route>, lookup = publicDns) => Object.assign(new CanvasHttpClient(), { deps: { fetch: fakeFetch(routes), lookup } });
  const signal = new AbortController().signal;

  it('follows same-origin pagination and maps the student submission state', async () => {
    const snapshot = await client({
      [coursesUrl]: { body: [{ id: 1, name: 'AUCSC 325', course_code: 'AUCSC325', workflow_state: 'available' }], link: `<${origin}/api/v1/courses?page=2&per_page=100>; rel="next"` },
      [`${origin}/api/v1/courses?page=2&per_page=100`]: { body: [{ id: 2, name: 'History', workflow_state: 'completed' }, { id: 3, access_restricted_by_date: true }] },
      [assignmentsUrl(1)]: { body: [
        { id: 11, name: 'Essay', due_at: '2026-10-24T05:59:00Z', submission_types: ['online_upload'], submission: { workflow_state: 'graded', score: 9 } },
        { id: 12, name: 'Discussion', due_at: null, submission_types: ['discussion_topic'], submission: { workflow_state: 'unsubmitted', missing: true } },
        { id: 13, name: 'Bad date', due_at: 'tomorrow', submission: null },
      ] },
      [assignmentsUrl(2)]: { status: 403, body: { errors: [] } },
    }).fetchAcademicSnapshot(origin, token, signal);
    expect(snapshot.courses).toEqual([{ externalId: '1', name: 'AUCSC 325', code: 'AUCSC325', active: true }, { externalId: '2', name: 'History', code: null, active: false }]);
    expect(snapshot.academicItems).toEqual([
      { externalId: '11', courseExternalId: '1', title: 'Essay', kind: 'assignment', due: { kind: 'instant', at: '2026-10-24T05:59:00.000Z' }, submissionState: 'graded' },
      { externalId: '12', courseExternalId: '1', title: 'Discussion', kind: 'discussion', due: null, submissionState: 'missing' },
      { externalId: '13', courseExternalId: '1', title: 'Bad date', kind: 'assignment', due: null, submissionState: 'unsubmitted' },
    ]);
  });
  it('ignores pagination links to another host', async () => {
    const snapshot = await client({ [coursesUrl]: { body: [{ id: 1, name: 'One' }], link: '<https://attacker.example/api/v1/courses?page=2>; rel="next"' } })
      .fetchAcademicSnapshot(origin, token, signal);
    expect(snapshot.courses).toHaveLength(1);
  });
  it('reports a rejected token and a host that resolves to a private address', async () => {
    await expect(client({ [`${origin}/api/v1/users/self`]: { status: 401, body: {} } }).verify(origin, token, signal)).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(client({}, async () => [{ address: '10.0.0.5', family: 4 }]).verify(origin, token, signal)).rejects.toMatchObject({ kind: 'invalid-url' });
    await expect(client({}, async () => [{ address: '::ffff:127.0.0.1', family: 6 }]).verify(origin, token, signal)).rejects.toMatchObject({ kind: 'invalid-url' });
    await expect(client({ [`${origin}/api/v1/users/self`]: { body: { id: 77, name: 'Student' } } }).verify('school.instructure.com', token, signal))
      .resolves.toEqual({ origin, userId: '77' });
  });
});

describe('Canvas token connection over HTTP', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const env = { CANVAS_MODE: process.env.CANVAS_MODE, CANVAS_TOKEN_KEY: process.env.CANVAS_TOKEN_KEY };
  const key = randomBytes(32);
  let stored: Record<string, unknown> | null;
  const prisma = {
    $transaction: jest.fn(), $queryRaw: jest.fn(), session: { findUnique: jest.fn() },
    canvasConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    course: { upsert: jest.fn() }, academicItem: { upsert: jest.fn(), findMany: jest.fn() },
  };
  const reminders = { lockAcademicReminders: jest.fn(), reconcileAcademicItem: jest.fn() };
  const http = new CanvasHttpClient();
  const auth = (req: request.Test) => req.set('Authorization', 'Bearer campusflow-session');
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [CanvasController], providers: [AuthGuard, CanvasService,
      { provide: ReminderService, useValue: reminders }, { provide: CanvasHttpClient, useValue: http },
      { provide: PrismaService, useValue: prisma }, { provide: CanvasProvider, useValue: { fetchAcademicSnapshot: jest.fn() } }] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks(); stored = null;
    process.env.CANVAS_MODE = 'token'; process.env.CANVAS_TOKEN_KEY = key.toString('base64');
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.session.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date('2099-01-01'),
      user: { id, email: 'student@example.test', displayName: 'Student', timeZone: 'America/Edmonton' } });
    prisma.canvasConnection.findUnique.mockImplementation(async () => stored);
    prisma.canvasConnection.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => { stored = { ...create }; return stored; });
    prisma.canvasConnection.deleteMany.mockImplementation(async () => { stored = null; return { count: 1 }; });
    prisma.course.upsert.mockResolvedValue({ id: 'course-id' }); prisma.academicItem.findMany.mockResolvedValue([]);
    http.deps = { fetch: fakeFetch({
      [`${origin}/api/v1/users/self`]: { body: { id: 77 } },
      [coursesUrl]: { body: [{ id: 1, name: 'AUCSC 325' }] },
      [assignmentsUrl(1)]: { body: [{ id: 11, name: 'Essay', due_at: '2026-10-24T05:59:00Z' }] },
    }), lookup: publicDns };
  });
  afterAll(async () => {
    await app.close();
    for (const [name, value] of Object.entries(env)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });

  it('verifies, seals and reports a connection without exposing the token', async () => {
    const response = await auth(request(app.getHttpServer()).post('/canvas/connect')).send({ baseUrl: 'school.instructure.com', accessToken: token }).expect(201);
    expect(response.body).toMatchObject({ connected: true, connectMode: 'token', baseUrl: origin, externalAccountId: '77' });
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(String(stored?.encryptedAccessToken)).not.toContain(token);
    expect(openCanvasToken(key, id, String(stored?.encryptedAccessToken))).toBe(token);
  });
  it('syncs live records under the canvas source and repeats idempotently', async () => {
    await auth(request(app.getHttpServer()).post('/canvas/connect')).send({ baseUrl: origin, accessToken: token }).expect(201);
    for (let run = 0; run < 2; run += 1) {
      const response = await auth(request(app.getHttpServer()).post('/canvas/sync')).expect(201);
      expect(response.body).toMatchObject({ coursesUpdated: 1, academicItemsUpdated: 1, status: 'succeeded' });
    }
    expect(prisma.course.upsert).toHaveBeenCalledTimes(2);
    for (const [call] of prisma.academicItem.upsert.mock.calls)
      expect(call.where).toEqual({ userId_source_externalId: { userId: id, source: canvasSource, externalId: '11' } });
  });
  it('rejects a bad token with a readable message and without ending the CampusFlow session', async () => {
    http.deps = { fetch: fakeFetch({ [`${origin}/api/v1/users/self`]: { status: 401, body: {} } }), lookup: publicDns };
    const response = await auth(request(app.getHttpServer()).post('/canvas/connect')).send({ baseUrl: origin, accessToken: token }).expect(400);
    expect(response.body.message).toContain('access token'); expect(stored).toBeNull();
    stored = { userId: id, baseUrl: origin, externalAccountId: '77', encryptedAccessToken: sealCanvasToken(key, id, token) };
    http.deps = { fetch: fakeFetch({ [coursesUrl]: { status: 401, body: {} } }), lookup: publicDns };
    await auth(request(app.getHttpServer()).post('/canvas/sync')).expect(409);
    expect(prisma.canvasConnection.updateMany.mock.calls[0][0].data.lastError).toContain('access token');
    expect(prisma.course.upsert).not.toHaveBeenCalled();
  });
  it('validates input shape and disconnects', async () => {
    await auth(request(app.getHttpServer()).post('/canvas/connect')).send({ baseUrl: origin, accessToken: 'short' }).expect(400);
    await auth(request(app.getHttpServer()).post('/canvas/connect')).send({ baseUrl: origin, accessToken: token, userId: 'other' }).expect(400);
    stored = { userId: id, baseUrl: origin, externalAccountId: '77', encryptedAccessToken: sealCanvasToken(key, id, token) };
    const response = await auth(request(app.getHttpServer()).delete('/canvas/connection')).expect(200);
    expect(response.body).toMatchObject({ connected: false, connectMode: 'token' });
  });
  it('reports missing key configuration as unavailable', async () => {
    delete process.env.CANVAS_TOKEN_KEY;
    await auth(request(app.getHttpServer()).post('/canvas/connect')).send({ baseUrl: origin, accessToken: token }).expect(503);
  });
});
