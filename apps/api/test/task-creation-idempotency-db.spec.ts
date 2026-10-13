import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { ReminderService } from '../src/data';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('PersonalTask creation retries', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string, userId: string;
  const marker = `task-retry-${randomUUID()}`, client = () => request(app.getHttpServer());
  const body = () => ({ requestKey: randomUUID(), title: `Study ${randomUUID()}`, description: 'Coursework: Essay\nCourse: AUCSC 325\nDeadline when planned: 2030-03-09\n\nKeep these notes.',
    category: 'university', priority: 'medium', scheduled: { kind: 'date', date: '2030-03-08' }, due: null, estimatedMinutes: 25 });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false);
    // Drop only this test request's response after the controller has committed.
    app.use((req: { headers: Record<string, string | undefined>; socket: { destroy(): void } },
      res: { json: (value: unknown) => unknown }, next: () => void) => {
      if (req.headers['x-test-drop-response'] === marker) res.json = () => { req.socket.destroy(); return res; };
      next();
    });
    await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'task-creation-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; }
      else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });
  it('commits before a lost response and retries without a second persisted task', async () => {
    const input = body();
    await expect(client().post('/tasks').set('Authorization', token).set('x-test-drop-response', marker).send(input)).rejects.toThrow();
    const persisted = await db.personalTask.findMany({ where: { userId, title: input.title } });
    expect(persisted).toHaveLength(1);
    const retry = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    expect(await db.personalTask.count({ where: { userId, title: input.title } })).toBe(1);
    expect(retry.body).toMatchObject({ id: persisted[0].id, description: input.description, scheduled: input.scheduled,
      studyPlanId: null, due: null, recurrence: null, estimatedMinutes: 25 });
    expect(retry.body.requestKey).toBeUndefined(); expect(retry.body.requestHash).toBeUndefined();
  });
  it('serializes concurrent duplicates, preserves reminders and rejects changed payloads', async () => {
    const input = { ...body(), reminder: { kind: 'instant', at: '2030-03-08T18:00:00Z' } };
    const results = await Promise.all(Array.from({ length: 3 }, () => client().post('/tasks').set('Authorization', token).send(input).expect(201)));
    expect(new Set(results.map(result => result.body.id)).size).toBe(1);
    const id = results[0].body.id;
    expect(await db.reminder.count({ where: { userId, targetId: id } })).toBe(1);
    const reordered = { ...input, scheduled: { date: input.scheduled.date, kind: input.scheduled.kind } };
    await client().post('/tasks').set('Authorization', token).send(reordered).expect(201);
    for (const changed of [{ title: 'Different' }, { description: 'Changed notes' }, { estimatedMinutes: 50 }]) {
      await client().post('/tasks').set('Authorization', token).send({ ...input, ...changed }).expect(409);
    }
    expect(await db.personalTask.count({ where: { userId, title: input.title } })).toBe(1);
  });
  it('scopes keys to accounts and permits genuinely new creations with a new key', async () => {
    const input = body();
    const first = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    const other = await client().post('/tasks').set('Authorization', otherToken).send(input).expect(201);
    const fresh = await client().post('/tasks').set('Authorization', token).send({ ...input, requestKey: randomUUID() }).expect(201);
    expect(new Set([first.body.id, other.body.id, fresh.body.id]).size).toBe(3);
    await client().get(`/tasks/${first.body.id}`).set('Authorization', otherToken).expect(404);
    await client().post('/tasks').send(input).expect(401);
  });
  it('replays equivalent UTC instant spellings while rejecting changed instants', async () => {
    const input = { ...body(), due: { kind: 'instant', at: '2030-03-09T18:00:00Z' },
      scheduled: { kind: 'instant', at: '2030-03-08T18:00:00Z' }, reminder: { kind: 'instant', at: '2030-03-08T17:00:00Z' } };
    const first = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    const canonical = { ...input, due: { ...input.due, at: '2030-03-09T18:00:00.000Z' },
      scheduled: { ...input.scheduled, at: '2030-03-08T18:00:00.000Z' }, reminder: { ...input.reminder, at: '2030-03-08T17:00:00.000Z' } };
    const replay = await client().post('/tasks').set('Authorization', token).send(canonical).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body).toMatchObject({ due: input.due, scheduled: input.scheduled, reminder: input.reminder });
    for (const field of ['due', 'scheduled', 'reminder'] as const) {
      await client().post('/tasks').set('Authorization', token).send({ ...canonical,
        [field]: { ...canonical[field], at: canonical[field].at.replace('.000Z', '.001Z') } }).expect(409);
    }
    expect(await db.personalTask.count({ where: { userId, title: input.title } })).toBe(1);
    expect(await db.reminder.count({ where: { userId, targetId: first.body.id } })).toBe(1);
    // The existing UTC-only boundary still rejects numeric timezone offsets.
    await client().post('/tasks').set('Authorization', token).send({ ...canonical,
      scheduled: { kind: 'instant', at: '2030-03-08T18:00:00+00:00' } }).expect(400);
  });
  it('does not recreate deleted tasks or overwrite later edits on retry', async () => {
    const input = body(), first = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    await client().patch(`/tasks/${first.body.id}`).set('Authorization', token).send({ title: 'Edited after creation' }).expect(200);
    const replay = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    expect(replay.body).toMatchObject({ id: first.body.id, title: 'Edited after creation' });
    await client().delete(`/tasks/${first.body.id}`).set('Authorization', token).expect(200);
    await client().post('/tasks').set('Authorization', token).send(input).expect(409);
    expect(await db.personalTask.findUnique({ where: { id: first.body.id } })).toBeNull();
  });
  it('normalizes omitted seconds and fractional zeros without losing instant precision', async () => {
    for (const [original, equivalent, changed] of [
      ['2030-03-08T18:00Z', '2030-03-08T18:00:00.000Z', '2030-03-08T18:00:01Z'],
      ['2030-03-08T18:00:00.123400Z', '2030-03-08T18:00:00.1234Z', '2030-03-08T18:00:00.123400001Z'],
    ]) {
      const input = { ...body(), scheduled: { kind: 'instant', at: original } };
      const first = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
      const replay = await client().post('/tasks').set('Authorization', token).send({ ...input,
        scheduled: { kind: 'instant', at: equivalent } }).expect(201);
      expect(replay.body.id).toBe(first.body.id);
      expect(replay.body.scheduled).toEqual(input.scheduled);
      await client().post('/tasks').set('Authorization', token).send({ ...input,
        scheduled: { kind: 'instant', at: changed } }).expect(409);
      expect(await db.personalTask.count({ where: { userId, title: input.title } })).toBe(1);
    }
  });
  it('validates keys, forbids changing them through task edits and preserves unkeyed creation', async () => {
    for (const requestKey of ['', 'short', 'a'.repeat(121), 'invalid key with spaces']) {
      await client().post('/tasks').set('Authorization', token).send({ ...body(), requestKey }).expect(400);
    }
    const { requestKey: _key, ...input } = body();
    const first = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    const second = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    expect(first.body.id).not.toBe(second.body.id);
    await client().patch(`/tasks/${first.body.id}`).set('Authorization', token).send({ requestKey: randomUUID() }).expect(400);
  });
  it('rolls back task and creation identity together when a dependent write fails', async () => {
    const input = body();
    const failure = jest.spyOn(app.get(ReminderService), 'replace').mockRejectedValueOnce(new Error('Injected reminder failure'));
    try { await client().post('/tasks').set('Authorization', token).send(input).expect(500); }
    finally { failure.mockRestore(); }
    expect(await db.personalTask.count({ where: { userId, title: input.title } })).toBe(0);
    expect(await db.taskCreationRequest.count({ where: { userId, requestKey: input.requestKey } })).toBe(0);
    await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    expect(await db.taskCreationRequest.count({ where: { userId, requestKey: input.requestKey } })).toBe(1);
  });
  it('rolls back task, reminder and metadata when PostgreSQL rejects metadata insertion, then safely retries', async () => {
    const input = { ...body(), reminder: { kind: 'instant', at: '2030-03-08T17:39:22Z' } };
    const beforeReminders = await db.reminder.count({ where: { userId } });
    const name = `task_creation_failure_${randomUUID().replace(/-/g, '')}`;
    // The identifier and request key are generated UUID-derived test values.
    // Reject only after both preceding writes are visible in this transaction.
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger AS $$ BEGIN
      IF NEW."requestKey" = '${input.requestKey}'
        AND EXISTS (SELECT 1 FROM "PersonalTask" WHERE "id" = NEW."taskId" AND "userId" = NEW."userId")
        AND EXISTS (SELECT 1 FROM "Reminder" WHERE "targetId" = NEW."taskId" AND "userId" = NEW."userId")
      THEN RAISE EXCEPTION 'Injected task creation metadata failure'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "TaskCreationRequest" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      await client().post('/tasks').set('Authorization', token).send(input).expect(500);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "TaskCreationRequest"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`);
    }
    expect(await db.personalTask.count({ where: { userId, title: input.title } })).toBe(0);
    expect(await db.reminder.count({ where: { userId } })).toBe(beforeReminders);
    expect(await db.taskCreationRequest.count({ where: { userId, requestKey: input.requestKey } })).toBe(0);
    const retry = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    expect(await db.personalTask.count({ where: { userId, title: input.title } })).toBe(1);
    expect(await db.reminder.count({ where: { userId, targetId: retry.body.id } })).toBe(1);
    expect(await db.taskCreationRequest.findUniqueOrThrow({ where: { userId_requestKey: { userId, requestKey: input.requestKey } } }))
      .toMatchObject({ taskId: retry.body.id });
    const replay = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    expect(replay.body.id).toBe(retry.body.id);
    expect(await db.reminder.count({ where: { userId } })).toBe(beforeReminders + 1);
  });
  it('canonicalizes omitted defaults and removes retry metadata on account deletion', async () => {
    const input = { requestKey: randomUUID(), title: 'Default task' };
    const first = await client().post('/tasks').set('Authorization', token).send(input).expect(201);
    const replay = await client().post('/tasks').set('Authorization', token).send({ ...input, priority: 'medium', category: 'personal',
      description: null, due: null, scheduled: null, recurrence: null, reminder: null, estimatedMinutes: null }).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    await db.user.delete({ where: { id: userId } });
    expect(await db.taskCreationRequest.count({ where: { userId } })).toBe(0);
    expect(await db.personalTask.count({ where: { userId } })).toBe(0);
  });
});
