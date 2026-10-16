import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ReminderService } from '../src/data';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('manual course academic reminder lifecycle with PostgreSQL (ToR 10, 13, 19)', () => {
  let app: INestApplication, db: PrismaService, reminders: ReminderService;
  let userId: string, token: string, otherId: string, otherToken: string;
  const marker = `course-reminders-${randomUUID()}`, client = () => request(app.getHttpServer());
  const due = { kind: 'instant', at: '2030-10-12T18:00:42.123Z' };
  const changedDue = { kind: 'instant', at: '2030-10-13T19:00:12.345Z' };
  const configure = (id: string, leadMinutes: number | null, auth = token) => client()
    .put(`/academic-items/${id}/reminder`).set('Authorization', auth).send({ leadMinutes });
  const activity = (id: string, active: boolean, auth = token) => client().patch(`/courses/${id}`).set('Authorization', auth).send({ active });
  const remove = (id: string, auth = token) => client().delete(`/courses/${id}`).set('Authorization', auth);
  const intent = (id: string) => db.reminder.findMany({ where: { academicItemId: id }, orderBy: { id: 'asc' } });
  async function course(auth = token) {
    const id = randomUUID();
    await client().post('/courses').set('Authorization', auth).send({ id, name: 'Statistics' }).expect(201);
    return id;
  }
  async function item(courseId: string, auth = token, timing: unknown = due) {
    const response = await client().post('/academic-items').set('Authorization', auth)
      .send({ title: 'Midterm', kind: 'exam', courseId, due: timing }).expect(201);
    return response.body.id as string;
  }
  async function archivedWithIntent() {
    const courseId = await course(), id = await item(courseId);
    await configure(id, 60).expect(200);
    const original = (await intent(id))[0];
    await activity(courseId, false).expect(200);
    // Existing academic configuration already suppresses intent while inactive;
    // establish a valid archived fixture independently of the course PATCH bug.
    await configure(id, 60).expect(200);
    expect(await intent(id)).toEqual([{ ...original, enabled: false }]);
    return { courseId, id, original };
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); reminders = app.get(ReminderService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'course-reminder-regression-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; }
      else { otherId = response.body.user.id; otherToken = `Bearer ${response.body.accessToken}`; }
    }
  });
  beforeEach(async () => {
    await db.academicItem.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await db.course.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await db.notificationPreference.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } });
    if (app) await app.close();
  });

  it('archives active coursework atomically, retaining configuration and identities without duplicates on retry', async () => {
    const courseId = await course(), first = await item(courseId), second = await item(courseId);
    await configure(first, 60).expect(200); await configure(second, 0).expect(200);
    const before = [...await intent(first), ...await intent(second)];
    await activity(courseId, false).expect(200); await activity(courseId, false).expect(200);
    expect([...await intent(first), ...await intent(second)]).toEqual(before.map(row => ({ ...row, enabled: false })));
    expect((await db.academicItem.findUniqueOrThrow({ where: { id: first } })).reminderLeadMinutes).toBe(60);
    await client().get('/reminders').set('Authorization', token).expect(200, []);
  });

  it('restores retained intent using the latest deadline and lead without duplicates on retry', async () => {
    const { courseId, id, original } = await archivedWithIntent();
    await client().patch(`/academic-items/${id}`).set('Authorization', token).send({ due: changedDue }).expect(200);
    await configure(id, 120).expect(200);
    await activity(courseId, true).expect(200); await activity(courseId, true).expect(200);
    expect(await intent(id)).toEqual([{ ...original, fireAt: new Date('2030-10-13T17:00:12.345Z'), enabled: true }]);
    const available = await client().get('/reminders').set('Authorization', token).expect(200);
    expect(available.body.map((row: { id: string }) => row.id)).toEqual([original.id]);
  });

  it('creates missing eligible intent once on restore without inventing configuration or changing category preferences', async () => {
    const courseId = await course(); await activity(courseId, false).expect(200);
    const configured = await item(courseId), unconfigured = await item(courseId);
    await configure(configured, 60).expect(200); expect(await intent(configured)).toEqual([]);
    await client().patch('/notification-preferences').set('Authorization', token).send({ academicEnabled: false }).expect(200);
    await activity(courseId, true).expect(200);
    const first = await intent(configured); expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ enabled: true, fireAt: new Date('2030-10-12T17:00:42.123Z') });
    await activity(courseId, true).expect(200); expect(await intent(configured)).toEqual(first);
    expect(await intent(unconfigured)).toEqual([]);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id: unconfigured } })).reminderLeadMinutes).toBeNull();
    const preferences = await client().get('/notification-preferences').set('Authorization', token).expect(200);
    expect(preferences.body.academicEnabled).toBe(false);
  });

  it.each(['submitted', 'graded', 'date-only', 'no deadline'] as const)('keeps %s coursework ineligible after restore and archived course deletion', async reason => {
    const { courseId, id, original } = await archivedWithIntent();
    if (reason === 'submitted' || reason === 'graded') await db.academicItem.update({ where: { id }, data: { submissionState: reason } });
    else await client().patch(`/academic-items/${id}`).set('Authorization', token).send({ due: reason === 'date-only' ? { kind: 'date', date: '2030-10-12' } : null }).expect(200);
    await activity(courseId, true).expect(200); expect(await intent(id)).toEqual([{ ...original, enabled: false }]);
    await activity(courseId, false).expect(200); await remove(courseId).expect(200);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id } })).courseId).toBeNull();
    expect(await intent(id)).toEqual([{ ...original, enabled: false }]);
  });

  it.each(['before archive', 'while archived'] as const)('preserves explicit No reminder chosen %s through restore and deletion', async when => {
    const courseId = await course(), id = await item(courseId); await configure(id, 60).expect(200);
    if (when === 'before archive') await configure(id, null).expect(200);
    await activity(courseId, false).expect(200);
    if (when === 'while archived') await configure(id, null).expect(200);
    await activity(courseId, true).expect(200); await activity(courseId, false).expect(200); await remove(courseId).expect(200);
    expect(await intent(id)).toEqual([]);
    expect(await db.academicItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ courseId: null, reminderLeadMinutes: null });
  });

  it.each(['retained', 'missing'] as const)('reconciles %s intent after archived course deletion sets the relation to null', async state => {
    const { courseId, id, original } = await archivedWithIntent();
    if (state === 'missing') await db.reminder.deleteMany({ where: { academicItemId: id } });
    const before = await db.academicItem.findUniqueOrThrow({ where: { id } });
    await remove(courseId).expect(200); await remove(courseId).expect(200);
    expect(await db.course.findUnique({ where: { id: courseId } })).toBeNull();
    expect(await db.academicItem.findUniqueOrThrow({ where: { id } })).toEqual({ ...before, courseId: null });
    const rows = await intent(id); expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ enabled: true, fireAt: original.fireAt, academicItemId: id, targetId: id });
    if (state === 'retained') expect(rows[0].id).toBe(original.id);
    await configure(id, 60).expect(200); expect(await intent(id)).toEqual(rows);
  });

  it.each(['archive', 'restore', 'delete'] as const)('rolls back the course, foreign keys and all reminder writes if %s reconciliation fails', async operation => {
    const courseId = await course(), first = await item(courseId), second = await item(courseId);
    await configure(first, 60).expect(200); await configure(second, 120).expect(200);
    if (operation !== 'archive') {
      await activity(courseId, false).expect(200); await configure(first, 60).expect(200); await configure(second, 120).expect(200);
    }
    const snapshot = async () => ({ course: await db.course.findUnique({ where: { id: courseId } }),
      items: await db.academicItem.findMany({ where: { courseId }, orderBy: { id: 'asc' } }),
      reminders: await db.reminder.findMany({ where: { userId }, orderBy: { id: 'asc' } }) });
    const before = await snapshot();
    const reconcile = reminders.reconcileAcademicItem.bind(reminders); let reached = 0;
    const spy = jest.spyOn(reminders, 'reconcileAcademicItem').mockImplementation(async (...args) => {
      await reconcile(...args); if (++reached === 2) throw new Error('Injected reconciliation failure after real writes');
    });
    try {
      await (operation === 'delete' ? remove(courseId) : activity(courseId, operation === 'restore')).expect(500);
      expect(reached).toBe(2); expect(await snapshot()).toEqual(before);
    } finally { spy.mockRestore(); }
    await (operation === 'delete' ? remove(courseId) : activity(courseId, operation === 'restore')).expect(200);
  });

  it('isolates foreign and unrelated courses, academic items and reminder configuration', async () => {
    const ownCourse = await course(), ownItem = await item(ownCourse); await configure(ownItem, 60).expect(200);
    const unrelatedCourse = await course(), unrelated = await item(unrelatedCourse); await configure(unrelated, 0).expect(200);
    const foreignCourse = await course(otherToken), foreign = await item(foreignCourse, otherToken); await configure(foreign, 120, otherToken).expect(200);
    const untouched = [...await intent(unrelated), ...await intent(foreign)];
    await activity(ownCourse, false, otherToken).expect(404); await remove(ownCourse, otherToken).expect(200);
    expect((await intent(ownItem))[0].enabled).toBe(true);
    await activity(ownCourse, false).expect(200); await remove(ownCourse).expect(200);
    expect([...await intent(unrelated), ...await intent(foreign)]).toEqual(untouched);
    expect(await db.academicItem.findUniqueOrThrow({ where: { id: foreign } })).toMatchObject({ courseId: foreignCourse, reminderLeadMinutes: 120 });
  });

  it('does not reconcile reminders for colour-only or grade edits and still protects imported course activity', async () => {
    const { courseId } = await archivedWithIntent();
    const imported = await db.course.create({ data: { userId, source: 'canvas:fixture', externalId: randomUUID(), name: 'Imported' } });
    const spy = jest.spyOn(reminders, 'reconcileAcademicItem');
    try {
      await client().patch(`/courses/${courseId}`).set('Authorization', token).send({ color: 'plum', targetGrade: 80 }).expect(200);
      await activity(imported.id, false).expect(400); await remove(imported.id).expect(400);
      await client().patch(`/courses/${imported.id}`).set('Authorization', token).send({ color: 'teal' }).expect(200);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it.each(['archive', 'restore', 'delete'] as const)('serializes %s before a concurrent coursework deadline/reassignment edit, without blocking another account', async operation => {
    const { courseId, id, original } = await archivedWithIntent();
    if (operation === 'archive') await activity(courseId, true).expect(200);
    const destination = await course(), otherCourse = await course(otherToken);
    await race(
      () => operation === 'delete' ? remove(courseId).expect(200) : activity(courseId, operation === 'restore').expect(200),
      () => client().patch(`/academic-items/${id}`).set('Authorization', token).send({ due: changedDue, courseId: destination }).expect(200),
      async () => { await activity(otherCourse, false, otherToken).expect(200); },
    );
    expect(await db.academicItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ courseId: destination, due: changedDue, reminderLeadMinutes: 60 });
    expect(await intent(id)).toEqual([{ ...original, enabled: true, fireAt: new Date('2030-10-13T18:00:12.345Z') }]);
  }, 15000);

  it.each(['archive', 'restore', 'delete'] as const)('serializes a coursework edit before concurrent course %s and uses its latest deadline', async operation => {
    const { courseId, id, original } = await archivedWithIntent();
    if (operation === 'archive') await activity(courseId, true).expect(200);
    await race(
      () => client().patch(`/academic-items/${id}`).set('Authorization', token).send({ due: changedDue }).expect(200),
      () => operation === 'delete' ? remove(courseId).expect(200) : activity(courseId, operation === 'restore').expect(200),
    );
    expect(await db.academicItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ due: changedDue, courseId: operation === 'delete' ? null : courseId });
    expect(await intent(id)).toEqual([{ ...original, enabled: operation !== 'archive',
      fireAt: new Date('2030-10-13T18:00:12.345Z') }]);
  }, 15000);

  it.each(['restore', 'delete'] as const)('preserves concurrent explicit No reminder after course %s', async operation => {
    const { courseId, id } = await archivedWithIntent();
    await race(
      () => operation === 'delete' ? remove(courseId).expect(200) : activity(courseId, true).expect(200),
      () => configure(id, null).expect(200),
    );
    expect(await intent(id)).toEqual([]);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id } })).reminderLeadMinutes).toBeNull();
  }, 15000);

  it.each(['restore', 'delete'] as const)('preserves explicit No reminder committed before concurrent course %s', async operation => {
    const { courseId, id } = await archivedWithIntent();
    await race(
      () => configure(id, null).expect(200),
      () => operation === 'delete' ? remove(courseId).expect(200) : activity(courseId, true).expect(200),
    );
    expect(await intent(id)).toEqual([]);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id } })).reminderLeadMinutes).toBeNull();
  }, 15000);

  async function race(first: () => PromiseLike<request.Response>, second: () => PromiseLike<request.Response>, whileBlocked?: () => Promise<void>) {
    let entered!: (pid: number) => void, release!: () => void, paused = false;
    const reached = new Promise<number>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const reconcile = reminders.reconcileAcademicItem.bind(reminders);
    const spy = jest.spyOn(reminders, 'reconcileAcademicItem').mockImplementation(async (owner, id, tx) => {
      if (owner === userId && !paused) {
        paused = true;
        const [connection] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        entered(connection.pid); await gate;
      }
      return reconcile(owner, id, tx);
    });
    const running = Promise.resolve(first()); void running.catch(() => undefined);
    let competing: Promise<request.Response> | undefined;
    try {
      const pid = await Promise.race([reached, running.then(() => { throw new Error('First writer did not reach reconciliation'); })]);
      competing = Promise.resolve(second()); void competing.catch(() => undefined);
      const deadline = Date.now() + 2500; let blockedQuery: string | undefined;
      while (Date.now() < deadline) {
        const blocked = await db.$queryRaw<Array<{ query: string }>>`
          SELECT query FROM pg_stat_activity WHERE ${pid}::integer = ANY(pg_blocking_pids(pid))
            AND datname = current_database() AND wait_event_type = 'Lock' AND query NOT ILIKE 'SET %'`;
        if (blocked.length) { blockedQuery = blocked[0].query; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(blockedQuery).toContain('"User"'); expect(blockedQuery).toContain('FOR NO KEY UPDATE');
      await whileBlocked?.();
      release(); await Promise.all([running, competing]);
    } finally { release(); await Promise.allSettled(competing ? [running, competing] : [running]); spy.mockRestore(); }
  }
});
