import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ReminderService } from '../src/data';
import { PrismaService } from '../src/prisma.service';
const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('saved event reminder lifecycle with PostgreSQL (ToR 11, 13, 19)', () => {
  let app: INestApplication; let db: PrismaService; let token: string; let otherToken: string; let userId: string; let otherId: string;
  const marker = `event-reminders-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const reminder = { kind: 'instant', at: '2030-03-08T18:00:00Z' }; const next = { kind: 'instant', at: '2030-03-09T18:00:00Z' };
  const client = () => request(app.getHttpServer());
  const event = async (scope = 'public') => (await db.event.create({ data: { title: 'Event', source: marker, sourceScope: scope, externalId: Math.random().toString(16), timing: { kind: 'allDay', startDate: '2030-03-08', endDateExclusive: '2030-03-09' }, sortAt: new Date('2030-03-08') } })).id;
  const save = (id: string, body: Record<string, unknown> = { includedInPlan: true, reminder }, auth = token) => client().put(`/events/${id}/saved`).set('Authorization', auth).send(body);
  const patch = (id: string, body: Record<string, unknown>, auth = token) => client().patch(`/events/${id}/saved`).set('Authorization', auth).send(body);
  const unsave = (id: string, auth = token) => client().delete(`/events/${id}/saved`).set('Authorization', auth);
  const rows = async (id: string, auth = token) => (await client().get('/reminders').set('Authorization', auth).expect(200)).body.filter((row: { targetKind: string; targetId: string }) => row.targetKind === 'savedEvent' && row.targetId === id);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    const register = (name: string) => client().post('/auth/register').send({ email: `${marker}-${name}@example.test`, displayName: name, password: 'a-long-test-password-123', timeZone: 'America/Edmonton' }).expect(201);
    const own = await register('own'); const other = await register('other'); token = `Bearer ${own.body.accessToken}`; userId = own.body.user.id; otherToken = `Bearer ${other.body.accessToken}`; otherId = other.body.user.id;
  });
  afterAll(async () => { jest.restoreAllMocks(); if (db) { await db.event.deleteMany({ where: { source: marker } }); await db.user.deleteMany({ where: { email: { startsWith: marker } } }); } if (app) await app.close(); });
  it('creates, replaces and removes intent without changing event or plan selection', async () => {
    const id = await event(); const originalEvent = await db.event.findUniqueOrThrow({ where: { id } });
    await save(id).expect(200); const initial = await rows(id); expect(initial).toHaveLength(1); expect(initial[0].fireAt).toBe('2030-03-08T18:00:00.000Z');
    const relation = await db.reminder.findUniqueOrThrow({ where: { id: initial[0].id } }); expect(relation.savedEventUserId).toBe(userId); expect(relation.savedEventEventId).toBe(id);
    await patch(id, { reminder: next }).expect(200); expect((await rows(id))[0].fireAt).toBe('2030-03-09T18:00:00.000Z');
    const retained = await db.savedEvent.findUniqueOrThrow({ where: { userId_eventId: { userId, eventId: id } } }); expect(retained.includedInPlan).toBe(true);
    await patch(id, { reminder: null }).expect(200); expect(await rows(id)).toEqual([]); expect(await db.event.findUniqueOrThrow({ where: { id } })).toEqual(originalEvent);
  });
  it('preserves configuration and intent ID when PUT/PATCH omit reminder', async () => {
    const id = await event(); await save(id).expect(200); const original = await rows(id);
    const updated = await save(id, { includedInPlan: false }).expect(200); expect(updated.body.reminder).toEqual(reminder); expect(await rows(id)).toEqual(original);
    await patch(id, { includedInPlan: true }).expect(200); expect(await rows(id)).toEqual(original);
  });
  it('stores date-only configuration without inventing a delivery time', async () => {
    const id = await event(); const response = await save(id, { reminder: { kind: 'date', date: '2030-03-08' } }).expect(200);
    expect(response.body.reminder).toEqual({ kind: 'date', date: '2030-03-08' }); expect(await rows(id)).toEqual([]);
  });
  it('removes intent on unsave and cleans a legacy orphan on retry', async () => {
    const id = await event(); await save(id).expect(200); await unsave(id).expect(200); expect(await rows(id)).toEqual([]);
    await db.reminder.create({ data: { userId, targetKind: 'savedEvent', targetId: id, fireAt: new Date(reminder.at) } });
    await unsave(id).expect(200); expect(await rows(id)).toEqual([]);
    await patch(id, { reminder }).expect(404); expect(await rows(id)).toEqual([]);
  });
  it('isolates saves and intent for two accounts sharing a public event', async () => {
    const id = await event(); await save(id).expect(200); await save(id, { includedInPlan: false, reminder: next }, otherToken).expect(200);
    const other = await rows(id, otherToken); expect(other).toHaveLength(1); await patch(id, { reminder: null }).expect(200); await unsave(id).expect(200);
    expect(await rows(id)).toEqual([]); expect(await rows(id, otherToken)).toEqual(other);
    const privateId = await event(`user:${otherId}`); await save(privateId).expect(404); await patch(privateId, { reminder }).expect(404); expect(await rows(privateId)).toEqual([]);
  });
  it('returns only the reader’s saved reminder configuration on event reads', async () => {
    const id = await event(); const onlyOther = await event(); await save(id).expect(200);
    await save(id, { includedInPlan: false, reminder: next }, otherToken).expect(200); await save(onlyOther, { reminder: next }, otherToken).expect(200);
    const own = await client().get('/events').set('Authorization', token).expect(200); const other = await client().get('/events').set('Authorization', otherToken).expect(200);
    expect(own.body.find((row: { id: string }) => row.id === id)).toMatchObject({ saved: true, includedInPlan: true, savedReminder: reminder });
    expect(other.body.find((row: { id: string }) => row.id === id)).toMatchObject({ saved: true, includedInPlan: false, savedReminder: next });
    expect(own.body.find((row: { id: string }) => row.id === onlyOther)).toMatchObject({ saved: false, includedInPlan: false, savedReminder: null });
  });
  it('cascades intent when the saved relationship or event is deleted directly', async () => {
    const first = await event(); await save(first).expect(200); await db.savedEvent.delete({ where: { userId_eventId: { userId, eventId: first } } }); expect(await rows(first)).toEqual([]);
    const second = await event(); await save(second).expect(200); await db.event.delete({ where: { id: second } }); expect(await rows(second)).toEqual([]);
  });
  it.each(['create', 'edit', 'unsave'])('rolls back %s when related reminder persistence fails', async operation => {
    const id = await event(); if (operation !== 'create') await save(id).expect(200); const original = await rows(id);
    const failure = jest.spyOn(app.get(ReminderService), 'replace').mockImplementation(async (owner, kind, target, _configuration, tx) => {
      await tx!.reminder.deleteMany({ where: { userId: owner, targetKind: kind, targetId: target } }); throw new Error('Injected intent failure');
    });
    try { if (operation === 'create') await save(id).expect(500); else if (operation === 'edit') await patch(id, { reminder: next, includedInPlan: false }).expect(500); else await unsave(id).expect(500); } finally { failure.mockRestore(); }
    const saved = await db.savedEvent.findUnique({ where: { userId_eventId: { userId, eventId: id } } });
    if (operation === 'create') expect(saved).toBeNull(); else { expect(saved?.reminder).toEqual(reminder); expect(saved?.includedInPlan).toBe(true); }
    expect(await rows(id)).toEqual(original);
  });
  it('serializes concurrent saves, edits and unsave without duplicate or orphaned intent', async () => {
    const id = await event();
    for (let round = 0; round < 3; round++) {
      await Promise.all([save(id).expect(200), save(id, { includedInPlan: true, reminder: next }).expect(200)]); expect(await rows(id)).toHaveLength(1);
      const raced = await Promise.all([patch(id, { reminder }), unsave(id)]); expect([200, 404]).toContain(raced[0].status); expect(raced[1].status).toBe(200);
      expect(await rows(id)).toEqual([]); expect(await db.savedEvent.count({ where: { userId, eventId: id } })).toBe(0);
    }
  });
});
