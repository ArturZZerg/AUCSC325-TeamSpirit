import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { composeToday, localDateAt } from '@campusflow/domain';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { snapshotToDomainInput } from '../src/today';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('goal-local occurrence identity across persisted reads', () => {
  let app: INestApplication, db: PrismaService, token: string, other: string;
  const now = '2026-10-04T18:00:00.000Z';
  const marker = `goal-zone-${Date.now()}`;
  const client = () => request(app.getHttpServer());
  beforeAll(async () => {
    jest.useFakeTimers({ doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate',
      'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    jest.setSystemTime(new Date(now));
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const name of ['owner', 'other']) {
      const result = await client().post('/auth/register').send({ email: `${marker}-${name}@example.test`, displayName: name,
        password: 'goal-timezone-test-password', timeZone: 'America/Edmonton' }).expect(201);
      if (name === 'owner') token = `Bearer ${result.body.accessToken}`; else other = `Bearer ${result.body.accessToken}`;
    }
  });
  afterAll(async () => {
    jest.useRealTimers();
    if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } });
    if (app) await app.close();
  });
  it.each([{ kind: 'daily' }, { kind: 'weekly', weekdays: [1] }])('shares completion and skip identity for %j across Today, history and snapshot', async schedule => {
    const created = await client().post('/goals').set('Authorization', token)
      .send({ title: 'Tokyo routine', schedule, timeZone: 'Asia/Tokyo' }).expect(201);
    const id = created.body.id;
    const read = async () => (await client().get('/today?date=2026-10-04').set('Authorization', token).expect(200)).body;
    const first = (await read()).items.find((item: { entityId: string }) => item.entityId === id);
    const wellnessKey = localDateAt(now, created.body.timeZone);
    expect(first).toMatchObject({ occurrenceKey: '2026-10-05', key: `goal:${id}:${wellnessKey}`, state: 'today' });
    const complete = (state: string, auth = token) => client().post(`/goals/${id}/complete`).set('Authorization', auth)
      .send({ occurrenceKey: first.occurrenceKey, state });
    await complete('completed').expect(201); await complete('completed').expect(201);
    await complete('skipped', other).expect(404);
    const history = await client().get(`/goals/${id}/history`).set('Authorization', token).expect(200);
    expect(history.body).toEqual([expect.objectContaining({ occurrenceKey: wellnessKey, state: 'completed' })]);
    expect((await read()).items.find((item: { entityId: string }) => item.entityId === id).state).toBe('completed');
    await client().post(`/goals/${id}/pause`).set('Authorization', token).send({ paused: true }).expect(201);
    expect((await read()).items.some((item: { entityId: string }) => item.entityId === id)).toBe(false);
    await client().post(`/goals/${id}/pause`).set('Authorization', token).send({ paused: false }).expect(201);
    expect((await read()).items.find((item: { entityId: string }) => item.entityId === id).state).toBe('completed');
    await complete('skipped').expect(201);
    const snapshot = (await client().get('/snapshot?date=2026-10-04').set('Authorization', token).expect(200)).body;
    const offline = composeToday(snapshotToDomainInput(snapshot, '2026-10-04', now));
    expect(offline.items.find(item => item.entityId === id)).toMatchObject({ occurrenceKey: wellnessKey, state: 'skipped' });
    expect((await read()).items.find((item: { entityId: string }) => item.entityId === id)).toMatchObject({ occurrenceKey: wellnessKey, state: 'skipped' });
    expect(await db.goalCompletion.count({ where: { goalId: id } })).toBe(1);
    // Goal undo is not in the existing contract; do not invent a new write mode.
    await complete('uncompleted').expect(400);
    await client().get(`/goals/${id}/history`).set('Authorization', other).expect(404);
  });
  it('preserves old date keys and weekly-target history without inventing mandatory Today items', async () => {
    const created = await client().post('/goals').set('Authorization', token)
      .send({ title: 'Target', schedule: { kind: 'weeklyTarget', target: 3 }, timeZone: 'Asia/Tokyo' }).expect(201);
    for (const occurrenceKey of ['2026-10-04', '2026-10-05'])
      await client().post(`/goals/${created.body.id}/complete`).set('Authorization', token).send({ occurrenceKey, state: 'completed' }).expect(201);
    const history = (await client().get(`/goals/${created.body.id}/history`).set('Authorization', token).expect(200)).body;
    expect(history.map((row: { occurrenceKey: string }) => row.occurrenceKey)).toEqual(['2026-10-05', '2026-10-04']);
    const today = (await client().get('/today').set('Authorization', token).expect(200)).body;
    expect(today.items.some((item: { entityId: string }) => item.entityId === created.body.id)).toBe(false);
  });
});
