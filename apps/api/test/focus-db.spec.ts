import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;

databaseSuite('Recorded focus history and ownership', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string, userId: string, taskId: string;
  const marker = `focus-${randomUUID()}`, client = () => request(app.getHttpServer());
  const body = () => ({ requestKey: randomUUID(), taskId, title: 'Read chapter', startedAt: '2025-03-09T08:00:00.000Z',
    endedAt: '2025-03-09T08:25:00.000Z', plannedMinutes: 25, focusedSeconds: 1500, outcome: 'completed' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'recorded-focus-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; } else otherToken = `Bearer ${response.body.accessToken}`;
    }
    taskId = (await client().post('/tasks').set('Authorization', token).send({ title: 'Read chapter' }).expect(201)).body.id;
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });
  it('saves a block without completing work and safely replays concurrent identical saves', async () => {
    const input = body();
    const results = await Promise.all(Array.from({ length: 3 }, () => client().post('/focus-sessions').set('Authorization', token).send(input).expect(201)));
    expect(new Set(results.map(result => result.body.id)).size).toBe(1);
    expect(results[0].body).toMatchObject({ focusedSeconds: 1500, taskId });
    expect(results[0].body.userId).toBeUndefined(); expect(results[0].body.requestHash).toBeUndefined();
    expect(await db.focusSession.count({ where: { userId, requestKey: input.requestKey } })).toBe(1);
    expect((await db.personalTask.findUniqueOrThrow({ where: { id: taskId } })).completedAt).toBeNull();
    await client().post('/focus-sessions').set('Authorization', token).send({ ...input, title: 'Changed' }).expect(409);
  });
  it('isolates private history, task links and retry keys by account', async () => {
    const input = body(); await client().post('/focus-sessions').set('Authorization', token).send(input).expect(201);
    const other = await client().get('/focus-sessions?from=2025-03-09&through=2025-03-09').set('Authorization', otherToken).expect(200);
    expect(other.body.sessions).toEqual([]);
    await client().post('/focus-sessions').set('Authorization', otherToken).send(input).expect(400);
    await client().post('/focus-sessions').set('Authorization', otherToken).send({ ...input, taskId: null }).expect(201);
  });
  it('uses account-local half-open day boundaries across DST and excludes the next midnight', async () => {
    const first = await client().post('/focus-sessions').set('Authorization', token).send({ ...body(), taskId: null,
      startedAt: '2025-03-09T06:45:00.000Z', endedAt: '2025-03-09T07:10:00.000Z' }).expect(201);
    const next = await client().post('/focus-sessions').set('Authorization', token).send({ ...body(), taskId: null,
      startedAt: '2025-03-10T05:35:00.000Z', endedAt: '2025-03-10T06:00:00.000Z' }).expect(201);
    const response = await client().get('/focus-sessions?from=2025-03-09&through=2025-03-09').set('Authorization', token).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store'); expect(response.body).toMatchObject({ accountId: userId, timeZone: 'America/Edmonton' });
    expect(response.body.sessions.map((row: { id: string }) => row.id)).toContain(first.body.id);
    expect(response.body.sessions.map((row: { id: string }) => row.id)).not.toContain(next.body.id);
  });
  it('retains history and retry identity after the linked task is deleted', async () => {
    const id = (await client().post('/tasks').set('Authorization', token).send({ title: 'Removable' }).expect(201)).body.id;
    const input = { ...body(), taskId: id }; const saved = await client().post('/focus-sessions').set('Authorization', token).send(input).expect(201);
    await client().delete(`/tasks/${id}`).set('Authorization', token).expect(200);
    const replay = await client().post('/focus-sessions').set('Authorization', token).send(input).expect(201);
    expect(replay.body).toMatchObject({ id: saved.body.id, taskId: null, title: 'Read chapter', focusedSeconds: 1500 });
  });
  it('rejects invalid durations, forged ownership, future blocks and unbounded reads', async () => {
    for (const invalid of [{ focusedSeconds: 1501 }, { focusedSeconds: 0 }, { outcome: 'completed', focusedSeconds: 20 },
      { endedAt: '2025-03-09T07:00:00.000Z' }, { userId }, { taskId: randomUUID() },
      { startedAt: '2025-02-30T08:00:00.000Z', endedAt: '2025-03-02T08:25:00.000Z' },
      { startedAt: '2099-01-01T00:00:00.000Z', endedAt: '2099-01-01T00:25:00.000Z' }]) {
      await client().post('/focus-sessions').set('Authorization', token).send({ ...body(), ...invalid }).expect(400);
    }
    for (const query of ['', '?from=2025-03-09&through=2025-03-08', '?from=2025-03-09&through=2025-04-09', '?from=2025-02-30&through=2025-03-09']) {
      await client().get(`/focus-sessions${query}`).set('Authorization', token).expect(400);
    }
    await client().post('/focus-sessions').send(body()).expect(401);
    await client().get('/focus-sessions?from=2025-03-09&through=2025-03-09').expect(401);
    const partial = await client().post('/focus-sessions').set('Authorization', token).send({ ...body(), focusedSeconds: 90, outcome: 'interrupted' }).expect(201);
    expect(partial.body).toMatchObject({ focusedSeconds: 90, outcome: 'interrupted' });
  });
});
