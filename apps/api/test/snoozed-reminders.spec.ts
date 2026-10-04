import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ReminderService } from '../src/data';
import { PrismaService } from '../src/prisma.service';
const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
type Resource = 'tasks' | 'goals';
const resources: Resource[] = ['tasks', 'goals'];
databaseSuite('explicit reminder snooze lifecycle with PostgreSQL (ToR 7, 13, 19)', () => {
  let app: INestApplication; let db: PrismaService; let token: string; let otherToken: string; let userId: string;
  const marker = `snooze-reminders-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const reminder = { kind: 'instant', at: '2030-03-08T18:00:00Z' }; const until = '2030-03-09T18:00:00Z';
  const client = () => request(app.getHttpServer()); const kind = (resource: Resource) => resource === 'tasks' ? 'personalTask' : 'goal';
  const create = async (resource: Resource, configuration: unknown = reminder, auth = token) => (await client().post(`/${resource}`).set('Authorization', auth)
    .send({ title: 'Snooze target', reminder: configuration, ...(resource === 'goals' ? { schedule: { kind: 'daily' }, timeZone: 'America/Edmonton' } : {}) }).expect(201)).body.id as string;
  const snooze = (resource: Resource, id: string, value = until, auth = token) => client().post(`/${resource}/${id}/snooze`).set('Authorization', auth).send({ until: value });
  const patch = (resource: Resource, id: string, configuration: unknown) => client().patch(`/${resource}/${id}`).set('Authorization', token).send({ reminder: configuration });
  const state = (resource: Resource, id: string, inactive: boolean) => client().post(`/${resource}/${id}/${resource === 'tasks' ? 'complete' : 'pause'}`).set('Authorization', token).send(resource === 'tasks' ? { completed: inactive } : { paused: inactive });
  const rows = async (resource: Resource, id: string, auth = token) => (await client().get('/reminders').set('Authorization', auth).expect(200)).body.filter((row: { targetKind: string; targetId: string }) => row.targetKind === kind(resource) && row.targetId === id);
  const record = (resource: Resource, id: string) => resource === 'tasks' ? db.personalTask.findUniqueOrThrow({ where: { id } }) : db.goal.findUniqueOrThrow({ where: { id } });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    const register = (name: string) => client().post('/auth/register').send({ email: `${marker}-${name}@example.test`, displayName: name, password: 'a-long-test-password-123', timeZone: 'America/Edmonton' }).expect(201);
    const own = await register('own'); const other = await register('other'); token = `Bearer ${own.body.accessToken}`; userId = own.body.user.id; otherToken = `Bearer ${other.body.accessToken}`;
  });
  afterAll(async () => { jest.restoreAllMocks(); if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it.each(resources)('postpones %s intent without changing configuration/ID or advancing later delivery', async resource => {
    const id = await create(resource); const original = await rows(resource, id); const response = await snooze(resource, id).expect(201);
    expect(response.body.reminder).toEqual(reminder); expect(response.body.snoozedUntil).toBe('2030-03-09T18:00:00.000Z');
    const delayed = await rows(resource, id); expect(delayed).toHaveLength(1); expect(delayed[0].id).toBe(original[0].id); expect(delayed[0].fireAt).toBe('2030-03-09T18:00:00.000Z');
    await snooze(resource, id).expect(201); await snooze(resource, id, '2030-03-08T20:00:00Z').expect(201); expect(await rows(resource, id)).toEqual(delayed);
    const later = await create(resource, { kind: 'instant', at: '2030-03-10T18:00:00Z' }); const retained = await rows(resource, later);
    await snooze(resource, later).expect(201); expect(await rows(resource, later)).toEqual(retained);
  });
  it.each(resources)('honors snooze during %s reminder edits while preserving selected configuration', async resource => {
    const id = await create(resource); await snooze(resource, id).expect(201); const next = { kind: 'instant', at: '2030-03-08T20:00:00Z' };
    const changed = await patch(resource, id, next).expect(200); expect(changed.body.reminder).toEqual(next); expect((await rows(resource, id))[0].fireAt).toBe('2030-03-09T18:00:00.000Z');
    const later = { kind: 'instant', at: '2030-03-10T18:00:00Z' }; await patch(resource, id, later).expect(200); expect((await rows(resource, id))[0].fireAt).toBe('2030-03-10T18:00:00.000Z');
  });
  it.each(resources)('keeps inactive %s intent absent and restores the snooze bound on undo/resume', async resource => {
    const id = await create(resource); await state(resource, id, true).expect(201);
    await db.reminder.create({ data: { userId, targetKind: kind(resource), targetId: id, ...(resource === 'tasks' ? { personalTaskId: id } : { goalId: id }), fireAt: new Date(reminder.at) } });
    await snooze(resource, id).expect(201); expect(await rows(resource, id)).toEqual([]);
    await state(resource, id, false).expect(201); expect((await rows(resource, id))[0].fireAt).toBe('2030-03-09T18:00:00.000Z'); expect((await record(resource, id)).reminder).toEqual(reminder);
  });
  it.each(resources)('does not invent %s delivery for absent/date-only configuration and cleans legacy stale intent', async resource => {
    for (const configuration of [null, { kind: 'date', date: '2030-03-08' }]) {
      const id = await create(resource, configuration);
      await db.reminder.create({ data: { userId, targetKind: kind(resource), targetId: id, fireAt: new Date(reminder.at) } });
      await snooze(resource, id).expect(201); expect(await rows(resource, id)).toEqual([]); expect((await record(resource, id)).reminder).toEqual(configuration);
    }
  });
  it.each(resources)('does not reactivate disabled or missing %s intent', async resource => {
    const id = await create(resource); const original = await rows(resource, id); await db.reminder.update({ where: { id: original[0].id }, data: { enabled: false } });
    await snooze(resource, id).expect(201); const disabled = await db.reminder.findUniqueOrThrow({ where: { id: original[0].id } }); expect(disabled.enabled).toBe(false); expect(disabled.fireAt).toEqual(new Date(reminder.at));
    await db.reminder.deleteMany({ where: { userId, targetKind: kind(resource), targetId: id } }); await snooze(resource, id).expect(201); expect(await rows(resource, id)).toEqual([]);
  });
  it.each(resources)('rolls back %s snooze and delivery changes on reminder failure', async resource => {
    const id = await create(resource); const original = await rows(resource, id);
    const failure = jest.spyOn(app.get(ReminderService), 'postpone').mockImplementation(async (owner, targetKind, targetId, _configuration, delayedUntil, tx) => {
      await tx.reminder.updateMany({ where: { userId: owner, targetKind, targetId }, data: { fireAt: delayedUntil } }); throw new Error('Injected snooze failure');
    });
    try { await snooze(resource, id).expect(500); } finally { failure.mockRestore(); }
    expect((await record(resource, id)).snoozedUntil).toBeNull(); expect(await rows(resource, id)).toEqual(original);
  });
  it.each(resources)('isolates %s snooze and rejects malformed instants', async resource => {
    const id = await create(resource, reminder, otherToken); const original = await rows(resource, id, otherToken);
    await snooze(resource, id).expect(404); expect(await rows(resource, id, otherToken)).toEqual(original);
    const own = await create(resource); const retained = await rows(resource, own); await snooze(resource, own, 'invalid-time').expect(400); expect(await rows(resource, own)).toEqual(retained);
  });
  it.each(resources)('serializes %s snooze with reminder edits and inactive-state changes', async resource => {
    const id = await create(resource);
    await Promise.all([snooze(resource, id).expect(201), patch(resource, id, { kind: 'instant', at: '2030-03-08T20:00:00Z' }).expect(200)]);
    expect((await rows(resource, id))[0].fireAt).toBe('2030-03-09T18:00:00.000Z');
    await Promise.all([snooze(resource, id).expect(201), state(resource, id, true).expect(201), patch(resource, id, reminder).expect(200)]);
    expect(await rows(resource, id)).toEqual([]);
  });
});
