import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('PersonalTask checklist steps', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string;
  const marker = `task-steps-${randomUUID()}`, client = () => request(app.getHttpServer());
  const createTask = async (extra: Record<string, unknown> = {}) => (await client().post('/tasks').set('Authorization', token)
    .send({ title: `Essay ${randomUUID()}`, scheduled: { kind: 'date', date: '2030-03-08' }, ...extra }).expect(201)).body as { id: string };
  const add = (taskId: string, step: { id: string; title: string }, auth = token) => client().post(`/tasks/${taskId}/checklist`).set('Authorization', auth).send(step);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'task-checklist-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') token = `Bearer ${response.body.accessToken}`; else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it('adds, toggles, renames and removes steps in order on new and existing tasks', async () => {
    const task = await createTask();
    expect((await client().get(`/tasks/${task.id}`).set('Authorization', token).expect(200)).body.checklist).toEqual([]);
    const outline = { id: randomUUID(), title: 'Outline' }, draft = { id: randomUUID(), title: 'Draft' };
    await add(task.id, outline).expect(201); const added = await add(task.id, draft).expect(201);
    expect(added.body.checklist).toEqual([{ ...outline, done: false }, { ...draft, done: false }]);
    const toggled = await client().patch(`/tasks/${task.id}/checklist/${outline.id}`).set('Authorization', token).send({ done: true }).expect(200);
    expect(toggled.body.checklist[0]).toEqual({ ...outline, done: true });
    const renamed = await client().patch(`/tasks/${task.id}/checklist/${draft.id}`).set('Authorization', token).send({ title: '  First draft ' }).expect(200);
    expect(renamed.body.checklist[1]).toEqual({ id: draft.id, title: 'First draft', done: false });
    const removed = await client().delete(`/tasks/${task.id}/checklist/${outline.id}`).set('Authorization', token).expect(200);
    expect(removed.body.checklist.map((step: { id: string }) => step.id)).toEqual([draft.id]);
    // A retried delete returns the current task rather than failing.
    await client().delete(`/tasks/${task.id}/checklist/${outline.id}`).set('Authorization', token).expect(200);
    const exported = await client().get('/me/export').set('Authorization', token).expect(200);
    expect(exported.body.personalTasks.find((row: { id: string }) => row.id === task.id).checklist).toEqual([{ id: draft.id, title: 'First draft', done: false }]);
  });

  it('makes retried adds idempotent, rejects a reused ID with different text and serializes concurrent adds', async () => {
    const task = await createTask(), step = { id: randomUUID(), title: 'Read sources' };
    await add(task.id, step).expect(201); await add(task.id, step).expect(201);
    await add(task.id, { id: step.id, title: 'Something else' }).expect(409);
    const steps = Array.from({ length: 8 }, (_, index) => ({ id: randomUUID(), title: `Step ${index}` }));
    await Promise.all(steps.map(row => add(task.id, row).expect(201)));
    const saved = await db.personalTask.findUniqueOrThrow({ where: { id: task.id } });
    expect((saved.checklist as { id: string }[]).map(row => row.id).sort()).toEqual([step.id, ...steps.map(row => row.id)].sort());
  });

  it('keeps steps off repeating tasks and enforces the step limit and validation', async () => {
    const repeating = await createTask({ recurrence: { frequency: 'daily', interval: 1 } });
    await add(repeating.id, { id: randomUUID(), title: 'Step' }).expect(400);
    const task = await createTask(); await add(task.id, { id: randomUUID(), title: 'Step' }).expect(201);
    await client().patch(`/tasks/${task.id}`).set('Authorization', token).send({ recurrence: { frequency: 'daily', interval: 1 } }).expect(400);
    await add(task.id, { id: randomUUID(), title: '   ' }).expect(400);
    await client().patch(`/tasks/${task.id}/checklist/${randomUUID()}`).set('Authorization', token).send({ done: true }).expect(404);
    await client().patch(`/tasks/${task.id}/checklist/${randomUUID()}`).set('Authorization', token).send({}).expect(400);
    const full = await createTask();
    for (let index = 0; index < 30; index++) await add(full.id, { id: randomUUID(), title: `Step ${index}` }).expect(201);
    await add(full.id, { id: randomUUID(), title: 'One too many' }).expect(400);
  });

  it('isolates steps by account', async () => {
    const task = await createTask(), step = { id: randomUUID(), title: 'Private' };
    await add(task.id, step).expect(201);
    await add(task.id, { id: randomUUID(), title: 'Intrusion' }, otherToken).expect(404);
    await client().patch(`/tasks/${task.id}/checklist/${step.id}`).set('Authorization', otherToken).send({ done: true }).expect(404);
    await client().delete(`/tasks/${task.id}/checklist/${step.id}`).set('Authorization', otherToken).expect(404);
    expect((await db.personalTask.findUniqueOrThrow({ where: { id: task.id } })).checklist).toEqual([{ ...step, done: false }]);
  });
});
