import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { composeToday } from '@campusflow/domain';
import { offlineSnapshotSchema } from '@campusflow/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { ReminderService } from '../src/data';
import { snapshotToDomainInput } from '../src/today';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;

databaseSuite('core planning correctness with PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let token: string;
  let otherToken: string;
  let userId: string;
  let otherId: string;
  const marker = `core-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const date = '2026-03-08';
  const user = (label: string) => ({ email: `${marker}-${label}@example.test`, displayName: label,
    password: 'a-long-test-password-123', timeZone: 'America/Edmonton' });
  const client = () => request(app.getHttpServer());
  const createTask = async (body: Record<string, unknown> = {}) => {
    const response = await client().post('/tasks').set('Authorization', token).send({ title: 'Task', ...body }).expect(201);
    return response.body.id as string;
  };
  const academic = () => db.academicItem.create({ data: { userId, source: 'test', externalId: `${marker}-${Math.random()}`, title: 'Academic', kind: 'assignment' } });
  const selectTask = (id: string, selectedDate: string | null = date, auth = token) => client().post(`/tasks/${id}/main-goal`).set('Authorization', auth).send({ date: selectedDate });
  const selectAcademic = (id: string, selectedDate: string | null = date) => client().patch(`/academic-items/${id}/main-goal`).set('Authorization', token).send({ date: selectedDate });
  const selections = async (owner = userId) => (await db.personalTask.count({ where: { userId: owner, mainGoalDate: date } }))
    + (await db.academicItem.count({ where: { userId: owner, mainGoalDate: date } }));
  const complete = (id: string, completed: boolean, occurrenceKey?: string, auth = token) => client().post(`/tasks/${id}/complete`)
    .set('Authorization', auth).send({ completed, ...(occurrenceKey === undefined ? {} : { occurrenceKey }) });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    db = app.get(PrismaService);
    const first = await client().post('/auth/register').send(user('first')).expect(201);
    const second = await client().post('/auth/register').send(user('second')).expect(201);
    token = `Bearer ${first.body.accessToken}`; userId = first.body.user.id;
    otherToken = `Bearer ${second.body.accessToken}`; otherId = second.body.user.id;
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (db) {
      await db.event.deleteMany({ where: { source: marker } });
      await db.user.deleteMany({ where: { email: { startsWith: marker } } });
    }
    if (app) await app.close();
  });

  it('distinguishes an empty covered plan from dates outside the snapshot window', async () => {
    const response = await client().get(`/snapshot?date=${date}`).set('Authorization', token).expect(200);
    const snapshot = offlineSnapshotSchema.parse(response.body);
    expect(snapshot.personalTasks).toEqual([]);
    expect(snapshot.academicItems).toEqual([]);
    expect(composeToday(snapshotToDomainInput(snapshot, date, snapshot.capturedAt)).items).toEqual([]);
    expect(snapshot.coverage.from <= date && date <= snapshot.coverage.through).toBe(true);
    expect('2026-03-16' <= snapshot.coverage.through).toBe(false);
    expect(snapshot.sourceStatus).toEqual({ availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null });
  });

  it('replaces Main Goal in both directions across kinds and preserves other accounts', async () => {
    const task = await createTask(); const item = await academic();
    const other = await db.personalTask.create({ data: { userId: otherId, title: 'Other', mainGoalDate: date } });
    await selectTask(task).expect(201);
    await selectAcademic(item.id).expect(200);
    expect((await db.personalTask.findUniqueOrThrow({ where: { id: task } })).mainGoalDate).toBeNull();
    await selectTask(task).expect(201);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id: item.id } })).mainGoalDate).toBeNull();
    expect(await selections()).toBe(1);
    expect(await selections(otherId)).toBe(1);
    await selectTask(other.id).expect(404);
    await selectTask(task, date, otherToken).expect(404);
    await client().patch(`/academic-items/${item.id}/main-goal`).set('Authorization', otherToken).send({ date }).expect(404);
    expect(await selections()).toBe(1);
    await selectTask(task, null).expect(201);
    expect(await selections()).toBe(0);
  });

  it('serializes concurrent same-kind and cross-kind Main Goal requests', async () => {
    const tasks = await Promise.all([createTask(), createTask()]); const item = await academic();
    for (let round = 0; round < 4; round++) {
      const responses = await Promise.all([selectTask(tasks[0]), selectAcademic(item.id), selectTask(tasks[1])]);
      expect(responses.map(response => response.status)).toEqual([201, 200, 201]);
      expect(await selections()).toBe(1);
    }
    await selectAcademic(item.id, null).expect(200);
    await selectTask(tasks[0], null).expect(201);
    await selectTask(tasks[1], null).expect(201);
    const concurrent = await Promise.all([selectTask(tasks[0]), complete(tasks[0], true)]);
    expect(concurrent.map(response => response.status)).toEqual([201, 201]);
    expect(await selections()).toBe(1);
  });

  it('completes, retries and undoes only the requested recurring occurrence', async () => {
    const id = await createTask({ scheduled: { kind: 'date', date: '2026-03-02' }, due: { kind: 'date', date: '2026-03-02' }, recurrence: { frequency: 'weekly', weekdays: [1] } });
    await complete(id, true, '2026-03-02').expect(201);
    const original = await db.taskCompletion.findFirstOrThrow({ where: { taskId: id } });
    await Promise.all([complete(id, true, '2026-03-02').expect(201), complete(id, true, '2026-03-02').expect(201)]);
    expect(await db.taskCompletion.count({ where: { taskId: id } })).toBe(1);
    expect((await db.taskCompletion.findFirstOrThrow({ where: { taskId: id } })).completedAt).toEqual(original.completedAt);
    const completed = await client().get('/today?date=2026-03-02').set('Authorization', token).expect(200);
    expect(completed.body.items.find((item: { entityId: string }) => item.entityId === id).state).toBe('completed');
    const next = await client().get('/today?date=2026-03-09').set('Authorization', token).expect(200);
    expect(next.body.items.find((item: { entityId: string }) => item.entityId === id).state).not.toBe('completed');
    const offDay = await client().get(`/today?date=${date}`).set('Authorization', token).expect(200);
    expect(offDay.body.items.some((item: { entityId: string }) => item.entityId === id)).toBe(false);
    await complete(id, true, '2026-03-09').expect(201);
    await complete(id, false, '2026-03-02').expect(201);
    await complete(id, false, '2026-03-02').expect(201);
    expect((await db.taskCompletion.findMany({ where: { taskId: id } })).map(row => row.occurrenceKey)).toEqual(['2026-03-09']);
    await complete(id, true, '2026-03-16', otherToken).expect(404);
    await complete(id, false, '2026-03-09', otherToken).expect(404);
    expect(await db.taskCompletion.count({ where: { taskId: id } })).toBe(1);
    for (const occurrence of [undefined, '2026-03-08', '2026-02-30', '2026-02-23', 'bad']) await complete(id, true, occurrence).expect(400);
    const once = await createTask();
    await complete(once, true, date).expect(400);
    await selectTask(id, date).expect(400);
  });

  it('validates task queries, recurrence anchors, nullable updates and goal pause', async () => {
    const id = await createTask({ title: 'Unique search target', due: { kind: 'date', date }, description: 'Keep until cleared' });
    const found = await client().get('/tasks?search=Unique%20search&category=personal&completed=false').set('Authorization', token).expect(200);
    expect(found.body.map((task: { id: string }) => task.id)).toEqual([id]);
    for (const query of ['completed=wrong', 'category=invalid', 'search=a&search=b', 'owner=other']) await client().get(`/tasks?${query}`).set('Authorization', token).expect(400);
    await client().post('/tasks').set('Authorization', token).send({ title: 'No anchor', recurrence: { frequency: 'daily' } }).expect(400);
    await client().patch(`/tasks/${id}`).set('Authorization', token).send({ title: 'Renamed' }).expect(200);
    expect((await db.personalTask.findUniqueOrThrow({ where: { id } })).due).toEqual({ kind: 'date', date });
    const cleared = await client().patch(`/tasks/${id}`).set('Authorization', token).send({ due: null, description: null }).expect(200);
    expect(cleared.body.due).toBeNull(); expect(cleared.body.description).toBeNull();
    await client().patch(`/tasks/${id}`).set('Authorization', token).send({ title: null }).expect(400);
    const recurring = await createTask({ due: { kind: 'date', date }, recurrence: { frequency: 'daily' } });
    await client().patch(`/tasks/${recurring}`).set('Authorization', token).send({ due: null }).expect(400);
    await client().patch(`/tasks/${recurring}`).set('Authorization', token).send({ due: null, recurrence: null }).expect(200);
    const goal = await client().post('/goals').set('Authorization', token).send({ title: 'Monday goal', schedule: { kind: 'weekly', weekdays: [1] }, timeZone: 'America/Edmonton' }).expect(201);
    for (const body of [{}, { paused: 'false' }, { paused: null }]) await client().post(`/goals/${goal.body.id}/pause`).set('Authorization', token).send(body).expect(400);
    const paused = await client().post(`/goals/${goal.body.id}/pause`).set('Authorization', token).send({ paused: true }).expect(201);
    expect(paused.body.pausedAt).not.toBeNull();
    const resumed = await client().post(`/goals/${goal.body.id}/pause`).set('Authorization', token).send({ paused: false }).expect(201);
    expect(resumed.body.pausedAt).toBeNull();
    await client().post(`/goals/${goal.body.id}/pause`).set('Authorization', otherToken).send({ paused: true }).expect(404);
    await client().post(`/goals/${goal.body.id}/complete`).set('Authorization', token).send({ occurrenceKey: date, state: 'completed' }).expect(400);
    await client().post(`/goals/${goal.body.id}/complete`).set('Authorization', token).send({ occurrenceKey: '2026-03-09', state: 'completed' }).expect(201);
    await client().get('/today?date=2026-02-30').set('Authorization', token).expect(400);
    await client().get('/snapshot?date=invalid').set('Authorization', token).expect(400);
  });

  it('rolls back task creation and edits if related reminder persistence fails', async () => {
    const reminder = { kind: 'instant', at: '2026-10-01T18:00:00Z' };
    const id = await createTask({ title: 'Atomic original', reminder });
    const before = await db.reminder.findMany({ where: { targetId: id } });
    const service = app.get(ReminderService);
    const failure = jest.spyOn(service, 'replace').mockImplementation(async (owner, kind, target, _reminder, tx) => {
      await tx!.reminder.deleteMany({ where: { userId: owner, targetKind: kind, targetId: target } });
      throw new Error('Injected related-write failure');
    });
    try {
      await client().patch(`/tasks/${id}`).set('Authorization', token).send({ title: 'Must roll back', reminder: null }).expect(500);
      expect((await db.personalTask.findUniqueOrThrow({ where: { id } })).title).toBe('Atomic original');
      expect(await db.reminder.findMany({ where: { targetId: id } })).toEqual(before);
      await client().post('/tasks').set('Authorization', token).send({ title: 'Failed atomic create', reminder }).expect(500);
      expect(await db.personalTask.count({ where: { userId, title: 'Failed atomic create' } })).toBe(0);
    } finally { failure.mockRestore(); }
  });

  it('filters Today events, preserves visibility/order, and supplies complete scoped snapshots', async () => {
    const event = (externalId: string, timing: Prisma.InputJsonValue, sourceScope = 'public') => db.event.create({ data: {
      source: marker, sourceScope, externalId, title: externalId, timing, sortAt: new Date('2026-03-08T00:00:00Z'),
    } });
    const ended = await event('ended', { kind: 'timed', startsAt: '2026-03-08T06:00:00Z', endsAt: '2026-03-08T07:00:00Z' });
    const tomorrow = await event('tomorrow', { kind: 'timed', startsAt: '2026-03-09T06:00:00Z', endsAt: null });
    const late = await event('late', { kind: 'timed', startsAt: '2026-03-08T20:00:00Z', endsAt: null });
    const overnight = await event('overnight', { kind: 'timed', startsAt: '2026-03-08T06:00:00Z', endsAt: '2026-03-08T08:00:00Z' });
    const privateEvent = await event('private', { kind: 'timed', startsAt: '2026-03-08T19:00:00Z', endsAt: null }, `user:${userId}`);
    const hidden = await event('hidden', { kind: 'allDay', startDate: date, endDateExclusive: '2026-03-09' }, `user:${otherId}`);
    const allDay = await event('saved', { kind: 'allDay', startDate: date, endDateExclusive: '2026-03-09' });
    await client().put(`/events/${allDay.id}/saved`).set('Authorization', token).send({ includedInPlan: true }).expect(200);
    const goal = await db.goal.create({ data: { userId, title: 'Snapshot goal', schedule: { kind: 'daily' }, timeZone: 'America/Edmonton' } });
    await db.goalCompletion.create({ data: { userId, goalId: goal.id, occurrenceKey: date, state: 'completed', completedAt: new Date() } });
    const course = await db.course.create({ data: { userId, source: 'test', externalId: marker, name: 'Course' } });
    const item = await db.academicItem.create({ data: { userId, courseId: course.id, source: 'test', externalId: marker, kind: 'assignment', title: 'Due', due: { kind: 'date', date } } });
    const task = await createTask({ scheduled: { kind: 'date', date }, recurrence: { frequency: 'daily' } });
    await complete(task, true, date).expect(201);
    const far = await createTask({ due: { kind: 'date', date: '2026-03-22' } });
    const overdue = await createTask({ due: { kind: 'date', date: '2020-01-01' } });
    await selectTask(task).expect(201);
    const today = await client().get(`/today?date=${date}`).set('Authorization', token).expect(200);
    const ownEvents = today.body.campusEvents.filter((row: { source: string }) => row.source === marker);
    expect(ownEvents.map((row: { id: string }) => row.id)).toEqual([overnight.id, privateEvent.id, late.id]);
    expect(today.body.items[0].entityId).toBe(task);
    expect(today.body.items.filter((row: { entityId: string }) => row.entityId === allDay.id)).toHaveLength(1);
    const next = await client().get('/today?date=2026-03-09').set('Authorization', token).expect(200);
    expect(next.body.campusEvents.map((row: { id: string }) => row.id)).toContain(tomorrow.id);
    expect(next.body.campusEvents.map((row: { id: string }) => row.id)).not.toContain(ended.id);
    await db.canvasConnection.create({ data: { userId, baseUrl: 'https://example.test', encryptedAccessToken: 'test-only-not-a-token',
      lastSuccessfulSyncAt: new Date('2026-03-07T12:00:00Z'), lastError: 'Test source unavailable', coveredFrom: '2026-03-01', coveredThrough: '2026-03-10' } });
    const response = await client().get(`/snapshot?date=${date}`).set('Authorization', token).expect(200);
    const snapshot = offlineSnapshotSchema.parse(response.body);
    expect(snapshot.accountId).toBe(userId);
    expect(snapshot.timeZone).toBe('America/Edmonton');
    expect(snapshot.coverage).toEqual({ from: date, through: '2026-03-15', includesOverdue: true, basis: 'persisted' });
    expect(snapshot.sourceStatus).toEqual({ availability: 'unavailable', lastSuccessfulSyncAt: '2026-03-07T12:00:00.000Z', coveredFrom: '2026-03-01', coveredThrough: '2026-03-10' });
    expect(JSON.stringify(response.body)).not.toContain('test-only-not-a-token');
    expect(snapshot.taskCompletions).toContainEqual(expect.objectContaining({ taskId: task, occurrenceKey: date }));
    expect(snapshot.goalCompletions).toContainEqual(expect.objectContaining({ goalId: goal.id, occurrenceKey: date }));
    expect(snapshot.courses.map(row => row.id)).toContain(course.id);
    expect(snapshot.academicItems.map(row => row.id)).toContain(item.id);
    expect(snapshot.personalTasks.map(row => row.id)).toEqual(expect.arrayContaining([overdue, far]));
    const lastCoveredDay = composeToday(snapshotToDomainInput(snapshot, snapshot.coverage.through, '2026-03-15T12:00:00Z'));
    expect(lastCoveredDay.upcoming.map(row => row.entityId)).toContain(far);
    expect(snapshot.events.map(row => row.id)).toContain(privateEvent.id);
    expect(snapshot.events.map(row => row.id)).not.toContain(hidden.id);
    expect(response.body.personalTasks.every((row: Record<string, unknown>) => row.userId === undefined)).toBe(true);
    const offline = composeToday(snapshotToDomainInput(snapshot, date, today.body.generatedAt));
    expect(offline.items.map(row => [row.key, row.state])).toEqual(today.body.items.map((row: { key: string; state: string }) => [row.key, row.state]));
    expect(offline.campusEvents.map(row => row.id)).toEqual(today.body.campusEvents.map((row: { id: string }) => row.id));
    const other = offlineSnapshotSchema.parse((await client().get(`/snapshot?date=${date}`).set('Authorization', otherToken).expect(200)).body);
    expect(other.sourceStatus.availability).toBe('notConnected');
    expect(other.personalTasks.map(row => row.id)).not.toContain(task);
    expect(other.taskCompletions).toEqual([]);
    expect(other.goalCompletions).toEqual([]);
    expect(other.academicItems.map(row => row.id)).not.toContain(item.id);
    expect(other.events.map(row => row.id)).not.toContain(privateEvent.id);
    expect(other.savedEvents).toEqual([]);
  });
  it('does not turn a database read failure into an empty successful plan', async () => {
    const failure = jest.spyOn(db, '$transaction').mockRejectedValueOnce(new Error('Injected database failure'));
    try { await client().get(`/today?date=${date}`).set('Authorization', token).expect(500); }
    finally { failure.mockRestore(); }
  });

  const reminderConfig = { kind: 'instant', at: '2030-03-08T18:00:00Z' };
  const reminderRows = async (id: string, auth = token) => {
    const response = await client().get('/reminders').set('Authorization', auth).expect(200);
    return (response.body as { id: string; targetId: string; fireAt: string }[]).filter(row => row.targetId === id);
  };
  it('removes one-time delivery intent on completion, preserves configuration and restores it once on undo', async () => {
    const id = await createTask({ reminder: reminderConfig }); expect(await reminderRows(id)).toHaveLength(1);
    await Promise.all([complete(id, true).expect(201), complete(id, true).expect(201)]);
    expect(await reminderRows(id)).toEqual([]);
    const task = await client().get(`/tasks/${id}`).set('Authorization', token).expect(200);
    expect(task.body.reminder).toEqual(reminderConfig); expect(task.body.completedAt).not.toBeNull();
    await complete(id, false).expect(201); const restored = await reminderRows(id); expect(restored).toHaveLength(1);
    expect(restored[0].fireAt).toBe('2030-03-08T18:00:00.000Z');
    await Promise.all([complete(id, false).expect(201), complete(id, false).expect(201)]);
    expect(await reminderRows(id)).toEqual(restored);
  });
  it('keeps updated reminder configuration inactive while completed and restores the latest value', async () => {
    const id = await createTask({ reminder: reminderConfig }); await complete(id, true).expect(201);
    const next = { kind: 'instant', at: '2030-03-09T18:00:00Z' };
    const updated = await client().patch(`/tasks/${id}`).set('Authorization', token).send({ reminder: next, title: 'Closed task' }).expect(200);
    expect(updated.body.reminder).toEqual(next); expect(updated.body.completedAt).not.toBeNull(); expect(await reminderRows(id)).toEqual([]);
    await complete(id, false).expect(201); expect((await reminderRows(id))[0].fireAt).toBe('2030-03-09T18:00:00.000Z');
  });
  it('cleans up legacy completed-task intent during retry or a later edit', async () => {
    const id = await createTask({ reminder: reminderConfig }); await complete(id, true).expect(201);
    const stale = () => db.reminder.create({ data: { userId, targetKind: 'personalTask', targetId: id, personalTaskId: id, fireAt: new Date(reminderConfig.at) } });
    await stale(); await complete(id, true).expect(201); expect(await reminderRows(id)).toEqual([]);
    await stale(); await client().patch(`/tasks/${id}`).set('Authorization', token).send({ title: 'Still closed' }).expect(200);
    expect(await reminderRows(id)).toEqual([]);
  });
  it('does not change another account’s reminder intent', async () => {
    const own = await createTask({ reminder: reminderConfig });
    const other = await client().post('/tasks').set('Authorization', otherToken).send({ title: 'Other reminder', reminder: reminderConfig }).expect(201);
    const original = await reminderRows(other.body.id, otherToken);
    await complete(other.body.id, true, undefined, token).expect(404); await complete(own, true).expect(201);
    expect(await reminderRows(other.body.id, otherToken)).toEqual(original);
    expect(await reminderRows(other.body.id)).toEqual([]);
  });
  it('rolls back completion when reminder cleanup fails', async () => {
    const id = await createTask({ reminder: reminderConfig }); const original = await reminderRows(id);
    const failure = jest.spyOn(app.get(ReminderService), 'replace').mockRejectedValueOnce(new Error('Injected reminder failure'));
    try { await complete(id, true).expect(500); } finally { failure.mockRestore(); }
    const task = await client().get(`/tasks/${id}`).set('Authorization', token).expect(200);
    expect(task.body.completedAt).toBeNull(); expect(await reminderRows(id)).toEqual(original);
  });
  it('rolls back undo when reminder restoration fails', async () => {
    const id = await createTask({ reminder: reminderConfig }); const closed = await complete(id, true).expect(201);
    const failure = jest.spyOn(app.get(ReminderService), 'replace').mockRejectedValueOnce(new Error('Injected reminder failure'));
    try { await complete(id, false).expect(500); } finally { failure.mockRestore(); }
    const task = await client().get(`/tasks/${id}`).set('Authorization', token).expect(200);
    expect(task.body.completedAt).toBe(closed.body.completedAt); expect(await reminderRows(id)).toEqual([]);
  });
  it('preserves future reminder intent when completing or undoing a recurring occurrence', async () => {
    const id = await createTask({ reminder: reminderConfig, scheduled: { kind: 'date', date }, recurrence: { frequency: 'daily' } });
    const original = await reminderRows(id);
    await complete(id, true, date).expect(201); await complete(id, false, date).expect(201);
    expect(await reminderRows(id)).toEqual(original);
  });

  it('uses the full historical 25-hour fall day in the API event response', async () => {
    const make = (externalId: string, startsAt: string) => db.event.create({ data: {
      source: marker, externalId, title: externalId, sortAt: new Date(startsAt),
      timing: { kind: 'timed', startsAt, endsAt: null },
    } });
    const early = await make('fall-early', '2025-11-02T07:30:00Z');
    const repeated = await make('fall-repeated', '2025-11-02T08:30:00Z');
    const lastHour = await make('fall-last', '2025-11-03T06:30:00Z');
    const next = await make('fall-next', '2025-11-03T07:00:00Z');
    const response = await client().get('/today?date=2025-11-02').set('Authorization', token).expect(200);
    expect(response.body.campusEvents.map((row: { id: string }) => row.id)).toEqual([early.id, repeated.id, lastHour.id]);
    expect(response.body.campusEvents.map((row: { id: string }) => row.id)).not.toContain(next.id);
  });

});
