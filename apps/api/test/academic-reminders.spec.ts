import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { composeToday } from '@campusflow/domain';
import { snapshotToDomainInput } from '../src/today';
import { reminderSchema } from '@campusflow/contracts';
import { AppModule } from '../src/app.module';
import { CanvasService } from '../src/canvas';
import { ReminderService } from '../src/data';
import { RequestUser } from '../src/common';
import { PrismaService } from '../src/prisma.service';
import { AcademicSnapshot, CanvasProvider, FixtureCanvasProvider } from '../src/integrations/canvas/canvas-provider';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('Explicit academic reminder lifecycle with PostgreSQL (ToR changed deadlines)', () => {
  let app: INestApplication, db: PrismaService, sync: CanvasService, reminders: ReminderService;
  let user: RequestUser, other: RequestUser, token: string, otherToken: string, id: string;
  let batch: AcademicSnapshot;
  const marker = `academic-reminders-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const env = { NODE_ENV: process.env.NODE_ENV, CANVAS_MODE: process.env.CANVAS_MODE };
  const provider = { fetchAcademicSnapshot: jest.fn() };
  const client = () => request(app.getHttpServer());
  const configure = (leadMinutes: number | null, itemId = id, auth = token) => client()
    .put(`/academic-items/${itemId}/reminder`).set('Authorization', auth).send({ leadMinutes });
  const rows = () => db.reminder.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
  const state = async () => ({
    items: await db.academicItem.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }),
    reminders: await rows(),
    success: (await db.canvasConnection.findUniqueOrThrow({ where: { userId: user.id } })).lastSuccessfulSyncAt,
  });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.CANVAS_MODE = 'fixture';
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CanvasProvider).useValue(provider).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); sync = app.get(CanvasService); reminders = app.get(ReminderService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'academic-regression-password-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { user = response.body.user; token = `Bearer ${response.body.accessToken}`; }
      else { other = response.body.user; otherToken = `Bearer ${response.body.accessToken}`; }
    }
  });
  beforeEach(async () => {
    batch = await new FixtureCanvasProvider().fetchAcademicSnapshot();
    provider.fetchAcademicSnapshot.mockReset().mockImplementation(async () => batch);
    await db.academicItem.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await db.course.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await db.canvasConnection.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await sync.connectFixture(user); await sync.sync(user);
    id = (await db.academicItem.findFirstOrThrow({ where: { userId: user.id, externalId: '92001' } })).id;
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } });
    if (app) await app.close();
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  it('requires explicit configuration, persists relative intent and returns a compatible linked reminder', async () => {
    expect(await rows()).toEqual([]);
    await client().get(`/academic-items/${id}/reminder`).set('Authorization', token).expect(200, { academicItemId: id, leadMinutes: null });
    await configure(1440).expect(200, { academicItemId: id, leadMinutes: 1440 });
    expect(await rows()).toEqual([expect.objectContaining({ userId: user.id, academicItemId: id,
      targetKind: 'academicItem', targetId: id, occurrenceKey: null, enabled: true, fireAt: new Date('2026-10-09T23:59:00Z') })]);
    const response = await client().get('/reminders').set('Authorization', token).expect(200);
    expect(response.body).toHaveLength(1); expect(reminderSchema.parse(response.body[0]).targetId).toBe(id);
    await client().get(`/academic-items/${id}/reminder`).set('Authorization', token).expect(200, { academicItemId: id, leadMinutes: 1440 });
  });
  it.each([{}, { leadMinutes: -1 }, { leadMinutes: 0.5 }, { leadMinutes: '60' }, { leadMinutes: 2147483648 }, { leadMinutes: 60, userId: 'other' }])('rejects invalid configuration %j', async body => {
    await client().put(`/academic-items/${id}/reminder`).set('Authorization', token).send(body).expect(400);
    expect(await rows()).toEqual([]);
  });
  it('retains extreme lead intent without emitting an unrepresentable wire timestamp', async () => {
    await configure(60).expect(200); const first = (await rows())[0];
    await configure(2147483647).expect(200);
    await client().get('/reminders').set('Authorization', token).expect(200, []);
    await sync.sync(user); expect(await rows()).toEqual([{ ...first, enabled: false }]);
    await configure(60).expect(200); expect(await rows()).toEqual([first]);
  });
  it('requires authentication and hides other-account and unknown configuration', async () => {
    await client().put(`/academic-items/${id}/reminder`).send({ leadMinutes: 0 }).expect(401);
    await configure(0, id, otherToken).expect(404);
    await client().get(`/academic-items/${id}/reminder`).set('Authorization', otherToken).expect(404);
    await configure(0, '00000000-0000-4000-8000-000000000099').expect(404);
    expect(await rows()).toEqual([]);
  });
  it.each([
    ['earlier', '2026-10-08T00:00:00.000Z', '2026-10-07T00:00:00.000Z'],
    ['later', '2026-10-12T00:00:00.000Z', '2026-10-11T00:00:00.000Z'],
    ['unchanged', '2026-10-10T23:59:00.000Z', '2026-10-09T23:59:00.000Z'],
  ])('updates the same reminder for an %s deadline, without duplicates on repeated sync', async (_, at, fireAt) => {
    await configure(1440).expect(200); const first = (await rows())[0];
    batch.academicItems[0].due = { kind: 'instant', at };
    await sync.sync(user); await sync.sync(user);
    expect(await rows()).toEqual([{ ...first, fireAt: new Date(fireAt) }]);
    expect(await db.academicItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ reminderLeadMinutes: 1440 });
  });
  it.each(['no deadline', 'submitted', 'graded', 'inactive course'] as const)('suppresses %s and restores the same reminder when actionable again', async reason => {
    await configure(60).expect(200); const first = (await rows())[0];
    if (reason === 'no deadline') batch.academicItems[0].due = null;
    else if (reason === 'inactive course') { batch.courses[0].active = false; batch.academicItems = batch.academicItems.filter(item => item.externalId !== '92001'); }
    else batch.academicItems[0].submissionState = reason;
    await sync.sync(user);
    expect(await rows()).toEqual([{ ...first, enabled: false }]);
    await client().get('/reminders').set('Authorization', token).expect(200, []);
    await client().get(`/academic-items/${id}/reminder`).set('Authorization', token).expect(200, { academicItemId: id, leadMinutes: 60 });
    batch = await new FixtureCanvasProvider().fetchAcademicSnapshot(); batch.academicItems[0].submissionState = 'missing';
    await sync.sync(user); expect(await rows()).toEqual([first]);
  });
  it('retains configuration without inventing a date-only or absent delivery time, then generates on restoration', async () => {
    await db.academicItem.update({ where: { id }, data: { due: { kind: 'date', date: '2026-10-10' } } });
    await configure(0).expect(200); expect(await rows()).toEqual([]);
    batch.academicItems[0].due = null; await sync.sync(user); expect(await rows()).toEqual([]);
    batch.academicItems[0].due = { kind: 'instant', at: '2026-10-10T00:00:00.000Z' }; await sync.sync(user);
    expect(await rows()).toEqual([expect.objectContaining({ fireAt: new Date('2026-10-10T00:00:00Z'), enabled: true })]);
  });
  it('clears intent explicitly and never recreates it on sync; item deletion cascades', async () => {
    await configure(60).expect(200); await configure(null).expect(200); await sync.sync(user);
    expect(await rows()).toEqual([]);
    await configure(0).expect(200); await db.academicItem.delete({ where: { id } }); expect(await rows()).toEqual([]);
    await sync.sync(user); expect(await rows()).toEqual([]);
  });
  it('does not infer deletion from omission in an accepted batch', async () => {
    await configure(60).expect(200); const first = await rows();
    batch.academicItems = []; await sync.sync(user);
    expect(await rows()).toEqual(first); expect(await db.academicItem.count({ where: { id } })).toBe(1);
  });
  it.each(['failed', 'malformed', 'incomplete', 'duplicate'] as const)('preserves academic data, intent and successful freshness after %s import', async reason => {
    await configure(60).expect(200); const before = await state();
    if (reason === 'failed') provider.fetchAcademicSnapshot.mockRejectedValue(new Error('source failure'));
    else if (reason === 'malformed') provider.fetchAcademicSnapshot.mockResolvedValue({ ...batch, academicItems: [{}] });
    else if (reason === 'duplicate') provider.fetchAcademicSnapshot.mockResolvedValue({ ...batch, academicItems: [batch.academicItems[0], batch.academicItems[0]] });
    else provider.fetchAcademicSnapshot.mockResolvedValue({ ...batch, status: 'incomplete' });
    await expect(sync.sync(user)).rejects.toThrow('Canvas source unavailable or invalid');
    expect(await state()).toEqual(before);
  });
  it('rolls back academic writes and freshness when reconciliation fails after writing reminder intent', async () => {
    await configure(60).expect(200); const before = await state();
    batch.academicItems[0].due = { kind: 'instant', at: '2026-10-12T00:00:00.000Z' };
    const original = reminders.reconcileAcademicItem.bind(reminders);
    const spy = jest.spyOn(reminders, 'reconcileAcademicItem').mockImplementation(async (...args) => {
      await original(...args); throw new Error('reconciliation failed');
    });
    try { await expect(sync.sync(user)).rejects.toThrow('reconciliation failed'); } finally { spy.mockRestore(); }
    expect(await state()).toEqual(before);
  });
  it('rolls back reminder intent, academic writes and freshness on a subsequent academic persistence failure', async () => {
    await configure(60).expect(200); const before = await state();
    batch.academicItems[0].due = { kind: 'instant', at: '2026-10-12T00:00:00.000Z' };
    let invalidWriteReached = false;
    const original = reminders.reconcileAcademicItem.bind(reminders);
    const spy = jest.spyOn(reminders, 'reconcileAcademicItem').mockImplementation(async (userId, itemId, tx) => {
      await original(userId, itemId, tx);
      // A real PostgreSQL FK violation, after both academic and reminder updates.
      invalidWriteReached = true;
      await tx.academicItem.update({ where: { id: itemId }, data: { courseId: '00000000-0000-4000-8000-000000000099' } });
    });
    try { await expect(sync.sync(user)).rejects.toMatchObject({ code: 'P2003' }); } finally { spy.mockRestore(); }
    expect(invalidWriteReached).toBe(true);
    expect(await state()).toEqual(before);
  });
  it('rolls back configuration and delivery intent together when configuring fails', async () => {
    const original = reminders.reconcileAcademicItem.bind(reminders);
    const spy = jest.spyOn(reminders, 'reconcileAcademicItem').mockImplementation(async (...args) => {
      await original(...args); throw new Error('fail');
    });
    try { await configure(60).expect(500); } finally { spy.mockRestore(); }
    expect(await rows()).toEqual([]);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id } })).reminderLeadMinutes).toBeNull();
  });
  it('serializes simultaneous configuration and sync, retaining one correctly calculated reminder', async () => {
    await Promise.all([configure(60).expect(200), configure(1440).expect(200), sync.sync(user)]);
    const item = await db.academicItem.findUniqueOrThrow({ where: { id } });
    expect(await rows()).toEqual([expect.objectContaining({ academicItemId: id,
      fireAt: new Date(Date.parse('2026-10-10T23:59:00Z') - item.reminderLeadMinutes! * 60000) })]);
    await configure(item.reminderLeadMinutes).expect(200); const before = await rows();
    await configure(item.reminderLeadMinutes).expect(200); expect(await rows()).toEqual(before);
  });
  it('serializes configuration with course inactivation even when the academic item is omitted', async () => {
    batch.courses[0].active = false;
    batch.academicItems = batch.academicItems.filter(item => item.externalId !== '92001');
    await Promise.all([sync.sync(user), configure(60).expect(200)]);
    await client().get('/reminders').set('Authorization', token).expect(200, []);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id } })).reminderLeadMinutes).toBe(60);
    batch.courses[0].active = true; await sync.sync(user);
    expect(await rows()).toEqual([expect.objectContaining({ enabled: true, academicItemId: id })]);
  });
  it('isolates configuration and reconciliation for two accounts with identical source IDs', async () => {
    await sync.connectFixture(other); await sync.sync(other);
    const otherItem = await db.academicItem.findFirstOrThrow({ where: { userId: other.id, externalId: '92001' } });
    await configure(60).expect(200); await configure(120, otherItem.id, otherToken).expect(200);
    const untouched = await db.reminder.findMany({ where: { userId: other.id } });
    batch.academicItems[0].due = null; await sync.sync(user);
    expect(await db.reminder.findMany({ where: { userId: other.id } })).toEqual(untouched);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id: otherItem.id } })).reminderLeadMinutes).toBe(120);
    const response = await client().get('/reminders').set('Authorization', otherToken).expect(200);
    expect(response.body.map((row: { targetId: string }) => row.targetId)).toEqual([otherItem.id]);
    await db.$transaction(async tx => {
      await expect(reminders.reconcileAcademicItem(user.id, otherItem.id, tx)).rejects.toThrow('Academic item not found');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    expect(await db.reminder.findMany({ where: { userId: other.id } })).toEqual(untouched);
  });
  it.each(['B to A', 'A to B'] as const)('prevents the retained-item deadlock when Main Goal moves %s', async direction => {
    // A is imported; configured B is deliberately retained, not in this batch.
    batch.academicItems[1].submissionState = 'unsubmitted';
    await sync.sync(user); await sync.connectFixture(other); await sync.sync(other);
    const b = await db.academicItem.findFirstOrThrow({ where: { userId: user.id, externalId: '92002' } });
    const otherA = await db.academicItem.findFirstOrThrow({ where: { userId: other.id, externalId: '92001' } });
    await configure(1440).expect(200); await configure(60, b.id).expect(200);
    const originalReminders = await rows();
    const date = '2026-10-10';
    const from = direction === 'B to A' ? b.id : id;
    const to = direction === 'B to A' ? id : b.id;
    const select = (itemId: string, auth = token) => client().patch(`/academic-items/${itemId}/main-goal`)
      .set('Authorization', auth).send({ date }).expect(200);
    await select(from);
    const previousSuccess = (await state()).success;
    batch.courses = [batch.courses[0]];
    batch.academicItems = [{ ...batch.academicItems[0], due: { kind: 'instant', at: '2026-10-12T00:00:00.000Z' } }];

    // Pause the real sync after its A upsert has acquired A's row lock, before
    // reconciliation can lock retained B. This hook delegates all persistence
    // to the real service/transaction; it does not simulate PostgreSQL locks.
    const { reached, release, restore } = pauseReconciliation();
    const running = sync.sync(user); void running.catch(() => undefined);
    let moving: Promise<request.Response> | undefined;
    try {
      const pid = await Promise.race([reached, running.then(() => { throw new Error('Sync did not reach the reconciliation barrier'); })]);
      moving = select(to).then(response => response); void moving.catch(() => undefined);
      // Observe the actual blocked backend, not a sleep-based guess about
      // overlap. Old code waits on AcademicItem A after locking B; corrected
      // code must wait on User before either Main Goal item write.
      const blockedQuery = await waitForBlockedQuery(pid);
      expect(blockedQuery).toContain('"User"');
      expect(blockedQuery).toContain('FOR NO KEY UPDATE');

      // Another account must finish sync/configuration/Main Goal while the
      // first account's sync is still held at the barrier.
      await sync.sync(other);
      await configure(30, otherA.id, otherToken).expect(200);
      await select(otherA.id, otherToken);
      const otherBefore = await db.academicItem.findMany({ where: { userId: other.id }, orderBy: { id: 'asc' } });
      const otherReminders = await db.reminder.findMany({ where: { userId: other.id } });
      release();
      const [result] = await Promise.all([running, moving]);
      expect(result.status).toBe('succeeded');
      const items = await db.academicItem.findMany({ where: { userId: user.id } });
      expect(items.filter(item => item.mainGoalDate === date).map(item => item.id)).toEqual([to]);
      expect(items.find(item => item.id === id)).toMatchObject({ due: batch.academicItems[0].due, reminderLeadMinutes: 1440 });
      expect(items.find(item => item.id === b.id)).toMatchObject({ due: b.due, reminderLeadMinutes: 60 });
      expect(await rows()).toEqual(originalReminders.map(reminder => reminder.academicItemId === id
        ? { ...reminder, fireAt: new Date('2026-10-11T00:00:00.000Z') } : reminder));
      const connection = await db.canvasConnection.findUniqueOrThrow({ where: { userId: user.id } });
      expect(connection.lastSuccessfulSyncAt?.toISOString()).toBe(result.finishedAt);
      expect(connection.lastSuccessfulSyncAt!.getTime()).toBeGreaterThan(previousSuccess!.getTime());
      expect(connection.lastError).toBeNull();
      expect(await db.academicItem.findMany({ where: { userId: other.id }, orderBy: { id: 'asc' } })).toEqual(otherBefore);
      expect(await db.reminder.findMany({ where: { userId: other.id } })).toEqual(otherReminders);
    } finally {
      release(); await Promise.allSettled(moving ? [running, moving] : [running]); restore();
    }
  }, 15000);

  it.each([120, null])('serializes a changed deadline with reminder leadMinutes=%s', async leadMinutes => {
    await configure(60).expect(200); const original = (await rows())[0];
    batch.academicItems[0].due = { kind: 'instant', at: '2026-10-12T00:00:00.000Z' };
    const { reached, release, restore } = pauseReconciliation();
    const running = sync.sync(user); void running.catch(() => undefined);
    let configuring: Promise<request.Response> | undefined;
    try {
      const pid = await Promise.race([reached, running.then(() => { throw new Error('Sync did not reach the reconciliation barrier'); })]);
      configuring = configure(leadMinutes).expect(200).then(response => response);
      void configuring.catch(() => undefined);
      expect(await waitForBlockedQuery(pid)).toContain('"User"');
      release(); await Promise.all([running, configuring]);
      const item = await db.academicItem.findUniqueOrThrow({ where: { id } });
      expect(item).toMatchObject({ due: batch.academicItems[0].due, reminderLeadMinutes: leadMinutes });
      expect(await rows()).toEqual(leadMinutes === null ? [] : [{ ...original, fireAt: new Date('2026-10-11T22:00:00.000Z') }]);
    } finally {
      release(); await Promise.allSettled(configuring ? [running, configuring] : [running]); restore();
    }
  });

  function pauseReconciliation() {
    let entered!: (pid: number) => void, release!: () => void;
    const reached = new Promise<number>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const reconcile = reminders.reconcileAcademicItem.bind(reminders);
    let paused = false;
    const hook = jest.spyOn(reminders, 'reconcileAcademicItem').mockImplementation(async (owner, itemId, tx) => {
      if (owner === user.id && !paused) {
        paused = true;
        const [connection] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        entered(connection.pid); await gate;
      }
      return reconcile(owner, itemId, tx);
    });
    return { reached, release, restore: () => hook.mockRestore() };
  }

  async function waitForBlockedQuery(blockerPid: number): Promise<string> {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const blocked = await db.$queryRaw<Array<{ query: string }>>`
        SELECT query FROM pg_stat_activity WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))`;
      if (blocked.length) return blocked[0].query;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected a competing transaction blocked by the paused sync');
  }

  it('preserves Main Goal and Today/snapshot parity after a changed deadline', async () => {
    await configure(60).expect(200);
    await client().patch(`/academic-items/${id}/main-goal`).set('Authorization', token).send({ date: '2026-10-10' }).expect(200);
    batch.academicItems[0].due = { kind: 'instant', at: '2026-10-11T01:00:00.000Z' }; await sync.sync(user);
    const today = await client().get('/today?date=2026-10-10').set('Authorization', token).expect(200);
    const snapshot = await client().get('/snapshot?date=2026-10-10').set('Authorization', token).expect(200);
    expect(today.body.items.find((item: { entityId: string }) => item.entityId === id)).toMatchObject({ isMainGoal: true, due: batch.academicItems[0].due });
    expect(snapshot.body.academicItems.find((item: { id: string }) => item.id === id)).toMatchObject({ mainGoalDate: '2026-10-10', due: batch.academicItems[0].due });
    const cached = composeToday(snapshotToDomainInput(snapshot.body, '2026-10-10', today.body.generatedAt));
    expect(cached.items.map(item => item.entityId)).toEqual(today.body.items.map((item: { entityId: string }) => item.entityId));
    expect(cached.items.find(item => item.entityId === id)).toMatchObject({ isMainGoal: true, due: batch.academicItems[0].due });
  });
});
