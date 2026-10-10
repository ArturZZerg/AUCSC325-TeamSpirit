import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('Study plan persistence, atomicity and ownership', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string, userId: string, itemId: string;
  const marker = `study-${randomUUID()}`;
  const client = () => request(app.getHttpServer());
  const body = (key = randomUUID()) => ({ requestKey: key, academicItemId: itemId, title: 'Prepare midterm', sessions: [
    { title: 'Recall chapters', scheduled: { kind: 'date', date: '2025-03-09' }, estimatedMinutes: 50 },
    { title: 'Practice exam', scheduled: { kind: 'instant', at: '2025-03-10T17:00:00Z' }, estimatedMinutes: 25 },
  ] });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'study-plan-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; } else otherToken = `Bearer ${response.body.accessToken}`;
    }
    const item = await client().post('/academic-items').set('Authorization', token).send({ title: 'Midterm', kind: 'quiz', due: { kind: 'date', date: '2025-03-11' } }).expect(201); itemId = item.body.id;
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });
  it('creates sessions in Tasks/Today and preparation completion does not submit coursework', async () => {
    const response = await client().post('/study-plans').set('Authorization', token).send(body()).expect(201);
    expect(response.body.tasks).toHaveLength(2); const task = response.body.tasks[0];
    expect(task).toMatchObject({ studyPlanId: response.body.id, due: null, recurrence: null, reminder: null, category: 'university' });
    const today = await client().get('/today?date=2025-03-09').set('Authorization', token).expect(200);
    expect(today.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: task.id, kind: 'personalTask' })]));
    await client().post(`/tasks/${task.id}/complete`).set('Authorization', token).send({ completed: true }).expect(201);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id: itemId } })).submissionState).toBe('unsubmitted');
    await client().patch(`/tasks/${task.id}`).set('Authorization', token).send({ recurrence: { frequency: 'daily', interval: 1 } }).expect(400);
  });
  it('serializes concurrent retries and canonical reordered JSON without duplicate sessions', async () => {
    const input = body(); const results = await Promise.all(Array.from({ length: 3 }, () => client().post('/study-plans').set('Authorization', token).send(input).expect(201)));
    expect(new Set(results.map(result => result.body.id)).size).toBe(1);
    const id = results[0].body.id; expect(await db.personalTask.count({ where: { studyPlanId: id } })).toBe(2);
    const reordered = { ...input, sessions: input.sessions.map(session => ({ estimatedMinutes: session.estimatedMinutes, scheduled: session.scheduled, title: session.title })) };
    await client().post('/study-plans').set('Authorization', token).send(reordered).expect(201);
    await client().post('/study-plans').set('Authorization', token).send({ ...input, title: 'Changed request' }).expect(409);
    expect(await db.personalTask.count({ where: { studyPlanId: id } })).toBe(2);
  });
  it('isolates plan/source/task ownership and scopes retry keys to the account', async () => {
    const input = body(); const created = await client().post('/study-plans').set('Authorization', token).send(input).expect(201);
    await client().get('/study-plans').set('Authorization', otherToken).expect(200, []);
    await client().post('/study-plans').set('Authorization', otherToken).send(input).expect(400);
    await client().patch(`/tasks/${created.body.tasks[0].id}`).set('Authorization', otherToken).send({ title: 'Foreign edit' }).expect(404);
    const ownSource = await client().post('/academic-items').set('Authorization', otherToken).send({ title: 'Other source', kind: 'assignment' }).expect(201);
    await client().post('/study-plans').set('Authorization', otherToken).send({ ...input, academicItemId: ownSource.body.id }).expect(201);
  });
  it('rolls back the group and every task if persistence fails during session creation', async () => {
    const input = body(); const rejected = `reject-${marker}`; input.sessions[1].title = rejected;
    // An isolated test trigger injects a database failure into the second nested
    // insert. It only matches this test's unique marker and is removed in finally.
    await db.$executeRawUnsafe(`CREATE FUNCTION study_plan_test_failure() RETURNS trigger AS $$ BEGIN IF NEW.title = '${rejected}' THEN RAISE EXCEPTION 'Injected study failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe('CREATE TRIGGER study_plan_test_failure BEFORE INSERT ON "PersonalTask" FOR EACH ROW EXECUTE FUNCTION study_plan_test_failure()');
    try {
      await client().post('/study-plans').set('Authorization', token).send(input).expect(500);
      expect(await db.studyPlan.count({ where: { userId, requestKey: input.requestKey } })).toBe(0);
      expect(await db.personalTask.count({ where: { userId, title: rejected } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS study_plan_test_failure ON "PersonalTask"');
      await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS study_plan_test_failure()');
    }
    const recovered = await client().post('/study-plans').set('Authorization', token).send(input).expect(201); expect(recovered.body.tasks).toHaveLength(2);
  });
  it('retains preparation and retry identity after the academic source is deleted', async () => {
    const source = await client().post('/academic-items').set('Authorization', token).send({ title: 'Removable source', kind: 'assignment' }).expect(201);
    const input = { ...body(), academicItemId: source.body.id };
    const created = await client().post('/study-plans').set('Authorization', token).send(input).expect(201);
    await client().delete(`/academic-items/${source.body.id}`).set('Authorization', token).expect(200);
    const replay = await client().post('/study-plans').set('Authorization', token).send(input).expect(201);
    expect(replay.body).toMatchObject({ id: created.body.id, academicItemId: null, academicItem: null }); expect(replay.body.tasks).toHaveLength(2);
  });
  it('reads updated member tasks and academic deadlines without rewriting captured context', async () => {
    const created = await client().post('/study-plans').set('Authorization', token).send(body()).expect(201);
    const id = created.body.id;
    await client().patch(`/tasks/${created.body.tasks[0].id}`).set('Authorization', token).send({ title: 'Custom recall' }).expect(200);
    await client().patch(`/academic-items/${itemId}`).set('Authorization', token).send({ due: { kind: 'date', date: '2025-03-15' } }).expect(200);
    const listed = await client().get('/study-plans').set('Authorization', token).expect(200);
    expect(listed.body.find((plan: { id: string }) => plan.id === id)).toMatchObject({ deadlineWhenPlanned: { kind: 'date', date: '2025-03-11' },
      academicItem: { due: { kind: 'date', date: '2025-03-15' } }, tasks: [expect.objectContaining({ title: 'Custom recall' }), expect.anything()] });
    await client().delete(`/tasks/${created.body.tasks[0].id}`).set('Authorization', token).expect(200);
    expect(await db.personalTask.count({ where: { studyPlanId: id } })).toBe(1);
  });
  it('archives/restores an owned plan while retaining its tasks, reminders and retry identity', async () => {
    const input = body(), created = await client().post('/study-plans').set('Authorization', token).send(input).expect(201);
    const id = created.body.id, taskId = created.body.tasks[0].id;
    await client().patch(`/tasks/${taskId}`).set('Authorization', token).send({ reminder: { kind: 'instant', at: '2030-03-09T17:00:00Z' } }).expect(200);
    const reminder = await db.reminder.findFirstOrThrow({ where: { userId, targetId: taskId } });
    await client().patch(`/study-plans/${id}`).set('Authorization', otherToken).send({ archived: true }).expect(404);
    const archived = await client().patch(`/study-plans/${id}`).set('Authorization', token).send({ title: 'My midterm plan', archived: true }).expect(200);
    expect(archived.body.archivedAt).toBeTruthy(); expect(archived.body.tasks).toHaveLength(2);
    expect(await db.reminder.findUnique({ where: { id: reminder.id } })).not.toBeNull();
    await client().post('/study-plans').set('Authorization', token).send(input).expect(409);
    expect(await db.personalTask.count({ where: { studyPlanId: id } })).toBe(2);
    await client().patch(`/study-plans/${id}`).set('Authorization', token).send({ archived: false }).expect(200);
    const replay = await client().post('/study-plans').set('Authorization', token).send(input).expect(201);
    expect(replay.body).toMatchObject({ id, title: 'My midterm plan', archivedAt: null });
  });
  it('cascades plan data when the account is deleted', async () => {
    const created = await client().post('/study-plans').set('Authorization', token).send(body()).expect(201);
    await db.user.delete({ where: { id: userId } });
    expect(await db.studyPlan.findUnique({ where: { id: created.body.id } })).toBeNull();
    expect(await db.personalTask.count({ where: { studyPlanId: created.body.id } })).toBe(0);
  });
});
