import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ReminderService } from '../src/data';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('explicit goal reminder lifecycle with PostgreSQL (ToR 3.4, 13, 19)', () => {
  let app: INestApplication; let db: PrismaService; let token: string; let otherToken: string; let userId: string;
  const marker = `goal-reminders-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const reminder = { kind: 'instant', at: '2030-03-08T18:00:00Z' }; const next = { kind: 'instant', at: '2030-03-09T18:00:00Z' };
  const body = { title: 'Read', schedule: { kind: 'daily' }, timeZone: 'America/Edmonton', reminder };
  const client = () => request(app.getHttpServer());
  const create = async (overrides: Record<string, unknown> = {}, auth = token) => (await client().post('/goals').set('Authorization', auth).send({ ...body, ...overrides }).expect(201)).body.id as string;
  const patch = (id: string, update: Record<string, unknown>, auth = token) => client().patch(`/goals/${id}`).set('Authorization', auth).send(update);
  const pause = (id: string, paused: boolean, auth = token) => client().post(`/goals/${id}/pause`).set('Authorization', auth).send({ paused });
  const rows = async (id: string, auth = token) => (await client().get('/reminders').set('Authorization', auth).expect(200)).body.filter((row: { targetKind: string; targetId: string }) => row.targetKind === 'goal' && row.targetId === id);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    const register = (name: string) => client().post('/auth/register').send({ email: `${marker}-${name}@example.test`, displayName: name, password: 'a-long-test-password-123', timeZone: 'America/Edmonton' }).expect(201);
    const own = await register('own'); const other = await register('other'); token = `Bearer ${own.body.accessToken}`; otherToken = `Bearer ${other.body.accessToken}`; userId = own.body.user.id;
  });
  afterAll(async () => { jest.restoreAllMocks(); if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it('creates, replaces and removes intent while ordinary edits preserve its ID', async () => {
    const id = await create(); const original = await rows(id); expect(original).toHaveLength(1); expect(original[0].fireAt).toBe('2030-03-08T18:00:00.000Z');
    expect((await db.reminder.findUniqueOrThrow({ where: { id: original[0].id } })).goalId).toBe(id);
    await patch(id, { title: 'Edited', schedule: { kind: 'weeklyTarget', target: 3 } }).expect(200); expect(await rows(id)).toEqual(original);
    await patch(id, { reminder: next }).expect(200); const replaced = await rows(id); expect(replaced).toHaveLength(1); expect(replaced[0].fireAt).toBe('2030-03-09T18:00:00.000Z');
    await patch(id, { reminder: null }).expect(200); expect(await rows(id)).toEqual([]); expect((await db.goal.findUniqueOrThrow({ where: { id } })).reminder).toBeNull();
  });
  it('preserves date-only configuration without inventing a delivery instant', async () => {
    const id = await create({ reminder: { kind: 'date', date: '2030-03-08' } }); expect(await rows(id)).toEqual([]);
    expect((await db.goal.findUniqueOrThrow({ where: { id } })).reminder).toEqual({ kind: 'date', date: '2030-03-08' });
  });
  it('keeps paused edits inactive, restores the latest configuration once, and cleans legacy intent on repeated pause', async () => {
    const id = await create(); const closed = await pause(id, true).expect(201); expect(await rows(id)).toEqual([]);
    await patch(id, { reminder: next }).expect(200); expect(await rows(id)).toEqual([]);
    await db.reminder.create({ data: { userId, goalId: id, targetKind: 'goal', targetId: id, fireAt: new Date(reminder.at) } });
    const again = await pause(id, true).expect(201); expect(again.body.pausedAt).toBe(closed.body.pausedAt); expect(await rows(id)).toEqual([]);
    await Promise.all([pause(id, false).expect(201), pause(id, false).expect(201)]); const restored = await rows(id); expect(restored).toHaveLength(1); expect(restored[0].fireAt).toBe('2030-03-09T18:00:00.000Z');
    await pause(id, false).expect(201); expect(await rows(id)).toEqual(restored);
  });
  it('cascades reminder deletion when a goal is deleted', async () => {
    const id = await create(); const original = await rows(id);
    await client().delete(`/goals/${id}`).set('Authorization', token).expect(200); expect(await rows(id)).toEqual([]);
    expect(await db.reminder.findUnique({ where: { id: original[0].id } })).toBeNull();
  });
  it('isolates reminder configuration and pause/delete writes across accounts', async () => {
    const id = await create({}, otherToken); const original = await rows(id, otherToken); expect(await rows(id)).toEqual([]);
    await patch(id, { reminder: null }).expect(404); await pause(id, true).expect(404); await client().delete(`/goals/${id}`).set('Authorization', token).expect(404);
    expect(await rows(id, otherToken)).toEqual(original);
  });
  it('rolls back goal creation and edits if related intent persistence fails', async () => {
    const id = await create(); const original = await rows(id); const service = app.get(ReminderService);
    const failure = jest.spyOn(service, 'replace').mockImplementation(async (owner, kind, target, _configuration, tx) => {
      await tx!.reminder.deleteMany({ where: { userId: owner, targetKind: kind, targetId: target } }); throw new Error('Injected related-write failure');
    });
    try {
      await patch(id, { title: 'Must roll back', reminder: next }).expect(500); expect((await db.goal.findUniqueOrThrow({ where: { id } })).title).toBe('Read'); expect(await rows(id)).toEqual(original);
      await client().post('/goals').set('Authorization', token).send({ ...body, title: 'Failed goal create' }).expect(500);
      expect(await db.goal.count({ where: { userId, title: 'Failed goal create' } })).toBe(0);
    } finally { failure.mockRestore(); }
  });
  it.each([true, false])('rolls back paused=%s if intent removal/restoration fails', async paused => {
    const id = await create(); if (!paused) await pause(id, true).expect(201);
    const before = await db.goal.findUniqueOrThrow({ where: { id } }); const original = await rows(id);
    const failure = jest.spyOn(app.get(ReminderService), 'replace').mockImplementation(async (owner, kind, target, _configuration, tx) => {
      await tx!.reminder.deleteMany({ where: { userId: owner, targetKind: kind, targetId: target } }); throw new Error('Injected intent failure');
    });
    try { await pause(id, paused).expect(500); } finally { failure.mockRestore(); }
    expect((await db.goal.findUniqueOrThrow({ where: { id } })).pausedAt).toEqual(before.pausedAt); expect(await rows(id)).toEqual(original);
  });
  it('serializes reminder edits racing with pause and concurrent resume', async () => {
    const id = await create();
    for (let round = 0; round < 3; round++) {
      await Promise.all([patch(id, { reminder: next }).expect(200), pause(id, true).expect(201)]); expect(await rows(id)).toEqual([]);
      await Promise.all([patch(id, { reminder }).expect(200), pause(id, false).expect(201), pause(id, false).expect(201)]);
      const current = await rows(id); expect(current).toHaveLength(1); expect(current[0].fireAt).toBe('2030-03-08T18:00:00.000Z');
    }
  });
  it('preserves a separate future reminder when recording a goal occurrence', async () => {
    const id = await create(); const original = await rows(id);
    await client().post(`/goals/${id}/complete`).set('Authorization', token).send({ occurrenceKey: '2026-03-08', state: 'completed' }).expect(201);
    expect(await rows(id)).toEqual(original);
  });
});
