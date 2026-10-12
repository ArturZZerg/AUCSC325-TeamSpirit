import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { accountExportSchema } from '@campusflow/contracts';
import { AppModule } from '../src/app.module';
import { AccountService } from '../src/account';
import { AuthService } from '../src/auth';
import { createRecoveryCode, recoveryCodeHash, recoveryRecipientHash } from '../src/auth-recovery/recovery-secrets';
import { TasksController, GoalsController, EventsController } from '../src/data';
import { PrismaService } from '../src/prisma.service';
import { EventSyncService } from '../src/integrations/events/event-sync.service';
import { IcsEventProvider } from '../src/integrations/events/ics-event-provider';
import { coverage, calendar, vevent } from './fixtures/campus-calendar';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('Account export and erasure with disposable PostgreSQL accounts', () => {
  let app: INestApplication, db: PrismaService, account: AccountService, auth: AuthService, sync: EventSyncService;
  const marker = `privacy-${randomUUID()}`, password = 'privacy-test-password-123', source = `campus:${marker}`;
  const client = () => request(app.getHttpServer());
  const register = async () => (await client().post('/auth/register').send({ email: `${marker}-${randomUUID()}@example.test`,
    password, displayName: 'Private student', timeZone: 'America/Edmonton' }).expect(201)).body as { accessToken: string; user: { id: string; email: string } };
  const bearer = (user: { accessToken: string }) => `Bearer ${user.accessToken}`;
  const remove = (user: { accessToken: string }, input: object = { currentPassword: password, confirmation: 'DELETE' }) => client().delete('/me').set('Authorization', bearer(user)).send(input);
  const provider = () => new IcsEventProvider(async () => calendar(vevent('DTSTART:20260308T160000Z')));
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); account = app.get(AccountService); auth = app.get(AuthService); sync = app.get(EventSyncService);
  });
  afterAll(async () => { if (db) {
    await db.event.deleteMany({ where: { source } }); await db.user.deleteMany({ where: { email: { startsWith: marker } } });
  } if (app) await app.close(); });

  async function seed(userId: string) {
    const course = await db.course.create({ data: { userId, source: 'canvas', externalId: 'course', name: 'Psychology', code: 'PSYCH' } });
    const academic = await db.academicItem.create({ data: { userId, courseId: course.id, source: 'manual', externalId: randomUUID(),
      title: 'Essay', kind: 'assignment', due: { kind: 'date', date: '2030-03-09' }, reminderLeadMinutes: 60 } });
    const plan = await db.studyPlan.create({ data: { userId, academicItemId: academic.id, title: 'Essay preparation', requestKey: randomUUID(), requestHash: 'hidden-plan-hash' } });
    const task = await db.personalTask.create({ data: { userId, studyPlanId: plan.id, studyPlanOrder: 0, title: 'Private notes' } });
    await db.taskCompletion.create({ data: { userId, taskId: task.id, occurrenceKey: '2025-03-09' } });
    await db.classSchedule.create({ data: { userId, title: 'Psychology seminar', weekdays: [1], termStart: '2025-01-01', termEnd: '2025-04-30', startTime: '09:00', endTime: '10:00', timeZone: 'America/Edmonton' } });
    await db.focusSession.create({ data: { userId, taskId: task.id, title: 'Read', startedAt: new Date('2025-03-09T08:00:00Z'),
      endedAt: new Date('2025-03-09T08:25:00Z'), plannedMinutes: 25, focusedSeconds: 1500, outcome: 'completed', requestKey: randomUUID(), requestHash: 'hidden-focus-hash' } });
    const goal = await db.goal.create({ data: { userId, title: 'Take a walk', schedule: { kind: 'daily' }, timeZone: 'America/Edmonton' } });
    await db.goalCompletion.create({ data: { userId, goalId: goal.id, occurrenceKey: '2025-03-09', state: 'completed', completedAt: new Date() } });
    await db.wellnessEntry.create({ data: { userId, date: '2025-03-09', mood: 4, note: 'Private wellness note' } });
    await db.canvasConnection.create({ data: { userId, baseUrl: 'https://canvas.example.test', encryptedAccessToken: 'hidden-access',
      encryptedRefreshToken: 'hidden-refresh', oauthStateHash: 'hidden-state', syncLeaseUntil: new Date(), lastError: 'hidden-provider-error' } });
    const event = await db.event.create({ data: { source, sourceScope: `user:${userId}`, externalId: randomUUID(), title: 'Private event',
      timing: { kind: 'allDay', startDate: '2025-03-09', endDateExclusive: '2025-03-10' }, sortAt: new Date('2025-03-09') } });
    await db.savedEvent.create({ data: { userId, eventId: event.id, includedInPlan: true } });
    await db.reminder.create({ data: { userId, targetKind: 'personalTask', targetId: task.id, personalTaskId: task.id, fireAt: new Date('2030-03-09') } });
    return { task, event };
  }
  it('exports the complete saved graph with explicit public fields, no credentials and no unrelated events', async () => {
    const user = await register(), other = await register(); await seed(user.user.id); await seed(other.user.id);
    const publicEvent = await db.event.create({ data: { source, externalId: randomUUID(), title: 'Public event', timing: { kind: 'allDay', startDate: '2025-03-09', endDateExclusive: '2025-03-10' }, sortAt: new Date('2025-03-09') } });
    await db.savedEvent.create({ data: { userId: user.user.id, eventId: publicEvent.id } });
    const response = await client().get('/me/export').set('Authorization', bearer(user)).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const data = accountExportSchema.parse(response.body);
    expect(data.profile).toMatchObject({ id: user.user.id, email: user.user.email });
    for (const key of ['personalTasks', 'taskCompletions', 'courses', 'academicItems', 'classes', 'studyPlans', 'focusSessions', 'goals', 'goalCompletions', 'wellnessEntries', 'privateEvents', 'reminders'] as const) expect(data[key]).toHaveLength(1);
    expect(data.savedEvents).toHaveLength(2); expect(data.notificationPreferences?.personalEnabled).toBe(true);
    expect(data.canvasConnection?.baseUrl).toBe('https://canvas.example.test');
    expect(data.privateEvents[0].id).not.toBe(publicEvent.id);
    const text = JSON.stringify(data);
    for (const secret of ['passwordHash', 'tokenHash', 'encryptedAccessToken', 'encryptedRefreshToken', 'oauthState', 'requestHash', 'requestKey', 'syncLease', 'hidden-', other.user.id, other.accessToken, user.accessToken]) expect(text).not.toContain(secret);
  });
  it('exports an empty account without pretending it has device drafts', async () => {
    const user = await register(); const data = await account.export(user.user.id);
    expect(data).toMatchObject({ coverage: 'server-saved', personalTasks: [], privateEvents: [], canvasConnection: null });
    expect(JSON.stringify(data)).not.toContain('focusDraft');
  });
  it('withholds recovery material from export and erases linked and unbound recovery records for only the deleted owner', async () => {
    const user = await register(), other = await register(), code = createRecoveryCode();
    const recipientHash = recoveryRecipientHash(user.user.email), otherHash = recoveryRecipientHash(other.user.email);
    const ids = [randomUUID(), randomUUID(), randomUUID()], keys = [`${marker}:recovery:owner`, `${marker}:recovery:other`, `${marker}:recovery:aggregate`];
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    try {
      await db.passwordResetToken.create({ data: { userId: user.user.id, tokenHash: recoveryCodeHash(code), expiresAt } });
      await db.emailVerificationToken.create({ data: { userId: user.user.id, tokenHash: recoveryCodeHash(code), credentialHash: 'a'.repeat(64), expiresAt } });
      await db.recoveryMail.createMany({ data: [
        { id: ids[0], userId: user.user.id, recipientHash, kind: 'code', sealed: 'hidden-recovery-linked', expiresAt },
        { id: ids[1], recipientHash, kind: 'code', sealed: 'hidden-recovery-unbound', expiresAt },
        { id: ids[2], recipientHash: otherHash, kind: 'code', sealed: 'hidden-recovery-other', expiresAt },
      ] });
      await db.recoveryRateBucket.createMany({ data: [
        { key: keys[0], recipientHash, count: 1, expiresAt }, { key: keys[1], recipientHash: otherHash, count: 1, expiresAt },
        { key: keys[2], count: 1, expiresAt },
      ] });
      const exported = await client().get('/me/export').set('Authorization', bearer(user)).expect(200);
      for (const secret of ['hidden-recovery-', 'passwordResetTokens', 'emailVerificationTokens', 'credentialHash', 'recoveryMail', 'tokenHash', recipientHash, code]) expect(JSON.stringify(exported.body)).not.toContain(secret);
      await remove(user).expect(200);
      expect(await db.passwordResetToken.count({ where: { userId: user.user.id } })).toBe(0);
      expect(await db.emailVerificationToken.count({ where: { userId: user.user.id } })).toBe(0);
      expect(await db.recoveryMail.count({ where: { recipientHash } })).toBe(0);
      expect(await db.recoveryRateBucket.count({ where: { recipientHash } })).toBe(0);
      expect(await db.recoveryMail.findUnique({ where: { id: ids[2] } })).not.toBeNull();
      expect(await db.recoveryRateBucket.count({ where: { key: { in: keys.slice(1) } } })).toBe(2);
      await client().get('/me').set('Authorization', bearer(other)).expect(200);
    } finally {
      await db.recoveryMail.deleteMany({ where: { id: { in: ids } } });
      await db.recoveryRateBucket.deleteMany({ where: { key: { in: keys } } });
    }
  });
  it('requires authentication and rejects forged ownership or missing confirmation', async () => {
    const user = await register(); await client().get('/me/export').expect(401); await client().delete('/me').send({ currentPassword: password, confirmation: 'DELETE' }).expect(401);
    for (const input of [{ currentPassword: password }, { currentPassword: '', confirmation: 'DELETE' }, { currentPassword: password, confirmation: 'delete' }, { currentPassword: password, confirmation: 'DELETE', userId: randomUUID() }]) await remove(user, input).expect(400);
    expect(await db.user.findUnique({ where: { id: user.user.id } })).not.toBeNull();
  });
  it('keeps the current session after a wrong password and bounds concurrent password attempts', async () => {
    const user = await register();
    const responses = await Promise.all(Array.from({ length: 10 }, () => remove(user, { currentPassword: 'incorrect', confirmation: 'DELETE' })));
    expect(responses.map(result => result.status).sort()).toEqual([...Array(8).fill(403), 429, 429].sort());
    await client().get('/me').set('Authorization', bearer(user)).expect(200); await remove(user).expect(429);
  });
  it('atomically erases all owned records and tokens while keeping another account and public events', async () => {
    const user = await register(), other = await register(); await seed(user.user.id); const otherData = await seed(other.user.id);
    const otherBefore = await account.export(other.user.id);
    const publicEvent = await db.event.create({ data: { source, externalId: randomUUID(), title: 'Public event', timing: { kind: 'allDay', startDate: '2025-03-09', endDateExclusive: '2025-03-10' }, sortAt: new Date('2025-03-09') } });
    const login = (await client().post('/auth/login').send({ email: user.user.email, password }).expect(201)).body;
    const result = await remove(user).expect(200); expect(result.body).toEqual({ deleted: true });
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(await db.user.findUnique({ where: { id: user.user.id } })).toBeNull();
    for (const model of [db.session, db.personalTask, db.studyPlan, db.focusSession, db.taskCompletion, db.course, db.classSchedule, db.academicItem, db.goal, db.goalCompletion, db.savedEvent, db.wellnessEntry, db.reminder, db.notificationPreference, db.canvasConnection]) {
      const count = await (model.count as unknown as (args: { where: { userId: string } }) => Promise<number>)({ where: { userId: user.user.id } }); expect(count).toBe(0);
    }
    expect(await db.event.count({ where: { sourceScope: `user:${user.user.id}` } })).toBe(0);
    expect(await db.event.findUnique({ where: { id: otherData.event.id } })).not.toBeNull(); expect(await db.event.findUnique({ where: { id: publicEvent.id } })).not.toBeNull();
    for (const session of [user, login]) await client().get('/me/export').set('Authorization', bearer(session)).expect(401);
    await client().get('/me/export').set('Authorization', bearer(other)).expect(200);
    const otherAfter = await account.export(other.user.id); expect({ ...otherAfter, capturedAt: otherBefore.capturedAt }).toEqual(otherBefore);
  });
  it('rolls back private events, records and sessions when persistence fails after erasure', async () => {
    const user = await register(); await seed(user.user.id); const before = await account.export(user.user.id);
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(async tx => {
      await work(tx); throw new Error('simulated commit failure');
    })) as unknown as typeof db.$transaction);
    try { await expect(account.delete(user.user.id, password)).rejects.toThrow('simulated commit failure'); }
    finally { spy.mockRestore(); }
    const after = await account.export(user.user.id); expect({ ...after, capturedAt: before.capturedAt }).toEqual(before);
    await client().get('/me').set('Authorization', bearer(user)).expect(200);
  });
  it('waits for an in-flight private import and removes its committed events', async () => {
    const user = await register(); let entered!: () => void, release!: () => void;
    const fetched = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const importing = sync.sync({ source, sourceScope: `user:${user.user.id}` }, new IcsEventProvider(async () => { entered(); await gate; return calendar(vevent('DTSTART:20260308T160000Z')); }), coverage);
    await fetched;
    const deleting = account.delete(user.user.id, password); release(); await Promise.all([importing, deleting]);
    expect(await db.event.count({ where: { sourceScope: `user:${user.user.id}` } })).toBe(0);
  });
  it('rejects imports started during deletion or after erasure before fetching their provider', async () => {
    const user = await register(); let entered!: () => void, release!: () => void;
    const verified = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const verify = auth.confirmCurrentPassword.bind(auth);
    const spy = jest.spyOn(auth, 'confirmCurrentPassword').mockImplementation(async (...args) => { await verify(...args); entered(); await gate; });
    const deleting = account.delete(user.user.id, password); await verified;
    const fetchEvents = jest.fn(provider().fetchEvents.bind(provider()));
    const importing = sync.sync({ source, sourceScope: `user:${user.user.id}` }, { fetchEvents }, coverage);
    const rejected = expect(importing).rejects.toThrow('owner is unavailable');
    try { release(); await deleting; await rejected; }
    finally { release(); spy.mockRestore(); }
    await expect(sync.sync({ source, sourceScope: `user:${user.user.id}` }, { fetchEvents }, coverage)).rejects.toThrow('owner is unavailable');
    expect(fetchEvents).not.toHaveBeenCalled();
  });
  it('serializes task, routine and saved-event reminder edits behind a deleting account without deadlocks', async () => {
    const user = await register(); const { task, event } = await seed(user.user.id);
    const goal = await db.goal.findFirstOrThrow({ where: { userId: user.user.id } });
    const owner = { ...user.user, displayName: 'Disposable', timeZone: 'America/Edmonton' };
    let entered!: () => void, release!: () => void;
    const verified = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const verify = auth.confirmCurrentPassword.bind(auth);
    const spy = jest.spyOn(auth, 'confirmCurrentPassword').mockImplementation(async (...args) => { await verify(...args); entered(); await gate; });
    const deleting = account.delete(user.user.id, password); await verified;
    const reminder = { kind: 'instant' as const, at: '2030-03-09T10:00:00Z' };
    const edits = Promise.allSettled([app.get(TasksController).update(owner, task.id, { reminder }),
      app.get(GoalsController).update(owner, goal.id, { reminder }), app.get(EventsController).patch(owner, event.id, { reminder })]);
    try {
      release(); expect(await deleting).toEqual({ deleted: true });
      for (const result of await edits) {
        expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason.message).toMatch(/not found/i);
      }
    } finally { release(); spy.mockRestore(); }
    expect(await db.reminder.count({ where: { userId: user.user.id } })).toBe(0);
  });
});
