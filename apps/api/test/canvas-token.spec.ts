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
import { EventSyncService } from '../src/integrations/events/event-sync.service';
import { runtimeConfig } from '../src/runtime-config';

const token = 'canvas-personal-token-0123456789abcdef';
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
type Route = { status?: number; body: unknown; link?: string };
function fakeFetch(routes: Record<string, Route>) {
  return jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
    // A key ending in * matches any URL it starts, for dated query strings.
    const route = routes[url] ?? Object.entries(routes).find(([key]) => key.endsWith('*') && url.startsWith(key.slice(0, -1)))?.[1];
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
  it('reads assignment groups and points for grades, and knows when a course was read in full', async () => {
    const groupsUrl = (id: number) => `${origin}/api/v1/courses/${id}/assignment_groups?per_page=100`;
    const snapshot = await client({
      [coursesUrl]: { body: [{ id: 1, name: 'Weighted', apply_assignment_group_weights: true }, { id: 2, name: 'Points' }, { id: 3, name: 'Long' }] },
      [assignmentsUrl(1)]: { body: [{ id: 11, name: 'Essay', points_possible: 20, assignment_group_id: 5, submission: { workflow_state: 'graded', score: 15 } }] },
      [groupsUrl(1)]: { body: [{ id: 5, name: 'Writing', group_weight: 60 }, { id: 6, name: 'Exams', group_weight: 40 }] },
      [assignmentsUrl(2)]: { body: [{ id: 21, name: 'Lab', points_possible: 10, assignment_group_id: 7, submission: { score: 9, excused: null } }] },
      [groupsUrl(2)]: { body: [{ id: 7, name: 'Labs', group_weight: 0 }] },
      // A row that can't be read leaves the course incomplete, so nothing is removed from it.
      [assignmentsUrl(3)]: { body: [{ id: 31, name: 'Quiz', points_possible: 5, assignment_group_id: 8 }, { id: 'not-a-number' }] },
      [groupsUrl(3)]: { body: [{ id: 8, name: 'Quizzes', group_weight: 100 }] },
    }).fetchAcademicSnapshot(origin, token, signal);
    expect(snapshot.grades).toEqual([
      { courseExternalId: '1', complete: true, groups: [{ externalId: '5', name: 'Writing', weight: 60 }, { externalId: '6', name: 'Exams', weight: 40 }],
        items: [{ externalId: '11', title: 'Essay', groupExternalId: '5', pointsPossible: 20, score: 75 }] },
      { courseExternalId: '2', complete: true, groups: [{ externalId: '7', name: 'Labs', weight: null }],
        items: [{ externalId: '21', title: 'Lab', groupExternalId: '7', pointsPossible: 10, score: 90 }] },
      { courseExternalId: '3', complete: false, groups: [{ externalId: '8', name: 'Quizzes', weight: null }],
        items: [{ externalId: '31', title: 'Quiz', groupExternalId: '8', pointsPossible: 5, score: null }] },
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
    course: { upsert: jest.fn() }, academicItem: { upsert: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    user: { findUnique: jest.fn() }, reminder: { deleteMany: jest.fn() },
  };
  const reminders = { lockAcademicReminders: jest.fn(), reconcileAcademicItem: jest.fn(), lockAcademicItem: jest.fn() };
  const events = { sync: jest.fn() };
  const http = new CanvasHttpClient();
  const auth = (req: request.Test) => req.set('Authorization', 'Bearer campusflow-session');
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [CanvasController], providers: [AuthGuard, CanvasService,
      { provide: ReminderService, useValue: reminders }, { provide: CanvasHttpClient, useValue: http },
      { provide: PrismaService, useValue: prisma }, { provide: EventSyncService, useValue: events }, { provide: CanvasProvider, useValue: { fetchAcademicSnapshot: jest.fn() } }] }).compile();
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
    prisma.user.findUnique.mockResolvedValue({ timeZone: 'America/Edmonton' });
    events.sync.mockResolvedValue({ status: 'complete', upserted: 0, removed: 0, retainedSaved: 0, issues: [] });
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
  it('imports planner to-dos and calendar events and removes coursework deleted in Canvas (ADR 025)', async () => {
    await auth(request(app.getHttpServer()).post('/canvas/connect')).send({ baseUrl: origin, accessToken: token }).expect(201);
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    http.deps = { fetch: fakeFetch({
      [coursesUrl]: { body: [{ id: 1, name: 'AUCSC 325' }] },
      [assignmentsUrl(1)]: { body: [{ id: 11, name: 'Essay', due_at: '2026-10-24T05:59:00Z' }] },
      [`${origin}/api/v1/planner/items?*`]: { body: [
        { plannable_id: 5, plannable_type: 'wiki_page', course_id: 1, plannable: { title: 'Read chapter 4', todo_date: soon } },
        { plannable_id: 6, plannable_type: 'planner_note', course_id: 1, plannable: { title: 'Ask about lab' }, plannable_date: soon, planner_override: { marked_complete: true } },
        { plannable_id: 7, plannable_type: 'discussion_topic', course_id: 1, plannable: { title: 'Graded talk', assignment_id: 12 } },
        { plannable_id: 8, plannable_type: 'planner_note', course_id: null, plannable: { title: 'No course' } },
        { plannable_id: 11, plannable_type: 'assignment', course_id: 1, plannable: { title: 'Essay' } },
      ] },
      [`${origin}/api/v1/calendar_events?type=event&*`]: { body: [
        { id: 40, title: 'Exam review', start_at: soon, end_at: soon, location_name: 'Room 1', context_code: 'course_1',
          description: '<p>Bring <b>notes</b> &amp; questions</p>', html_url: `${origin}/calendar?event_id=40` },
        { id: 41, title: 'Reading week', all_day: true, all_day_date: '2026-11-09', context_code: 'course_1', html_url: 'https://elsewhere.example/x' },
        { id: 42, title: 'Cancelled', start_at: soon, workflow_state: 'deleted' },
      ] },
    }), lookup: publicDns };
    // Stored: a live assignment, one deleted in Canvas, and a planner to-do outside the window read.
    prisma.academicItem.findMany.mockImplementation(async ({ where }: { where: { source?: string } }) => where.source ? [
      { id: 'live', externalId: '11', courseId: 'course-id', due: null },
      { id: 'gone', externalId: '13', courseId: 'course-id', due: null },
      { id: 'old-todo', externalId: 'planner:wiki_page:3', courseId: 'course-id', due: { kind: 'instant', at: '2020-01-01T00:00:00.000Z' } },
    ] : []);
    events.sync.mockResolvedValue({ status: 'complete', upserted: 2, removed: 0, retainedSaved: 0, issues: [] });
    const response = await auth(request(app.getHttpServer()).post('/canvas/sync')).expect(201);
    expect(response.body).toMatchObject({ academicItemsUpdated: 3, eventsUpdated: 2, status: 'succeeded' });
    const upserted = prisma.academicItem.upsert.mock.calls.map(([call]) => call.create);
    expect(upserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalId: 'planner:wiki_page:5', kind: 'planner', title: 'Read chapter 4', submissionState: 'unsubmitted', due: { kind: 'instant', at: soon } }),
      expect.objectContaining({ externalId: 'planner:planner_note:6', kind: 'planner', submissionState: 'submitted' })]));
    expect(upserted).toHaveLength(3);
    expect(prisma.academicItem.delete.mock.calls).toEqual([[{ where: { id: 'gone' } }]]);
    expect(prisma.reminder.deleteMany).toHaveBeenCalledWith({ where: { userId: id, targetKind: 'academicItem', targetId: 'gone' } });
    const [source, , coverage] = events.sync.mock.calls[0];
    expect(source).toEqual({ source: 'canvas:calendar', sourceScope: `user:${id}` });
    expect(coverage).toMatchObject({ timeZone: 'America/Edmonton' });
    const batch = await events.sync.mock.calls[0][1].fetchEvents(coverage);
    expect(batch).toMatchObject({ status: 'complete', events: [
      { externalId: '40', title: 'Exam review', description: 'Bring notes & questions', category: 'AUCSC 325', location: 'Room 1',
        url: `${origin}/calendar?event_id=40`, timing: { kind: 'timed', startsAt: soon, endsAt: soon } },
      { externalId: '41', url: null, timing: { kind: 'allDay', startDate: '2026-11-09', endDateExclusive: '2026-11-10' } }] });
    expect(batch.events).toHaveLength(2);
  });
  it('keeps coursework when a course could not be read in full, and survives a calendar failure', async () => {
    await auth(request(app.getHttpServer()).post('/canvas/connect')).send({ baseUrl: origin, accessToken: token }).expect(201);
    http.deps = { fetch: fakeFetch({
      [coursesUrl]: { body: [{ id: 1, name: 'AUCSC 325' }] },
      [assignmentsUrl(1)]: { body: [{ id: 11, name: 'Essay' }, { id: 'unreadable' }] },
    }), lookup: publicDns };
    prisma.academicItem.findMany.mockImplementation(async ({ where }: { where: { source?: string } }) => where.source ? [{ id: 'gone', externalId: '13', courseId: 'course-id', due: null }] : []);
    events.sync.mockRejectedValue(new Error('event store down'));
    const response = await auth(request(app.getHttpServer()).post('/canvas/sync')).expect(201);
    expect(response.body).toMatchObject({ status: 'succeeded', eventsUpdated: 0 });
    expect(prisma.academicItem.delete).not.toHaveBeenCalled();
    // The calendar endpoint 404s here, so the calendar read is incomplete and nothing is removed from it.
    const batch = await events.sync.mock.calls[0][1].fetchEvents(events.sync.mock.calls[0][2]);
    expect(batch.status).toBe('incomplete');
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
