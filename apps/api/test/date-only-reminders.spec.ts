import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { offlineSnapshotSchema } from '@campusflow/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
const resources = ['tasks', 'goals'] as const;
type Resource = typeof resources[number];
databaseSuite('explicit reminder input and legacy compatibility with PostgreSQL (ToR 7, 13, 19; #190)', () => {
  let app: INestApplication; let db: PrismaService; let token: string; let userId: string;
  const marker = `date-reminders-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const legacy = { kind: 'date', date: '2030-03-10' };
  const reminder = { kind: 'instant', at: '2030-03-10T09:00:00Z' };
  const client = () => request(app.getHttpServer());
  const body = (resource: Resource) => ({ title: 'Read', ...(resource === 'goals' ? { schedule: { kind: 'daily' }, timeZone: 'America/Edmonton' } : {}) });
  const create = async (resource: Resource, configuration: unknown = null) => (await client().post(`/${resource}`).set('Authorization', token)
    .send({ ...body(resource), reminder: configuration }).expect(201)).body.id as string;
  const patch = (resource: Resource, id: string, change: Record<string, unknown>) => client().patch(`/${resource}/${id}`).set('Authorization', token).send(change);
  const rows = (id: string) => db.reminder.findMany({ where: { userId, targetId: id } });
  const record = (resource: Resource, id: string) => resource === 'tasks' ? db.personalTask.findUniqueOrThrow({ where: { id } }) : db.goal.findUniqueOrThrow({ where: { id } });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    const registered = await client().post('/auth/register').send({ email: `${marker}@example.test`, displayName: 'Reminder input', password: 'a-long-test-password-123', timeZone: 'America/Edmonton' }).expect(201);
    token = `Bearer ${registered.body.accessToken}`; userId = registered.body.user.id;
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: `${marker}@example.test` } }); if (app) await app.close(); });

  it.each(resources)('rejects date-only %s creation before persisting a target or intent', async resource => {
    const count = resource === 'tasks' ? () => db.personalTask.count({ where: { userId } }) : () => db.goal.count({ where: { userId } });
    const before = await count();
    const rejected = await client().post(`/${resource}`).set('Authorization', token).send({ ...body(resource), reminder: legacy }).expect(400);
    expect(rejected.body.issues.some((issue: { path: string[] }) => issue.path[0] === 'reminder')).toBe(true);
    expect(await count()).toBe(before);
  });

  it.each(resources)('rejects a date-only %s PATCH atomically while omitted and null reminders keep their meaning', async resource => {
    const id = await create(resource, reminder); const original = await rows(id);
    await patch(resource, id, { title: 'Must not change', reminder: legacy }).expect(400);
    expect((await record(resource, id)).title).toBe('Read'); expect((await record(resource, id)).reminder).toEqual(reminder); expect(await rows(id)).toEqual(original);
    await patch(resource, id, { title: 'Ordinary edit' }).expect(200); expect(await rows(id)).toEqual(original);
    await patch(resource, id, { reminder: null }).expect(200); expect((await record(resource, id)).reminder).toBeNull(); expect(await rows(id)).toEqual([]);
  });

  it.each(resources)('reads legacy date-only %s and permits unrelated edits, clearing and explicit repair', async resource => {
    const id = await create(resource);
    if (resource === 'tasks') await db.personalTask.update({ where: { id }, data: { reminder: legacy } });
    else await db.goal.update({ where: { id }, data: { reminder: legacy } });
    const listed = await client().get(`/${resource}`).set('Authorization', token).expect(200);
    expect(listed.body.find((entry: { id: string }) => entry.id === id).reminder).toEqual(legacy);
    const snapshot = offlineSnapshotSchema.parse((await client().get('/snapshot?date=2030-03-10').set('Authorization', token).expect(200)).body);
    expect((resource === 'tasks' ? snapshot.personalTasks : snapshot.goals).find(entry => entry.id === id)?.reminder).toEqual(legacy);
    const edited = await patch(resource, id, { title: 'Legacy ordinary edit' }).expect(200); expect(edited.body.reminder).toEqual(legacy); expect(await rows(id)).toEqual([]);
    await patch(resource, id, { reminder }).expect(200); expect(await rows(id)).toHaveLength(1);
    expect((await rows(id))[0].fireAt.toISOString()).toBe('2030-03-10T09:00:00.000Z');
    await patch(resource, id, { reminder: null }).expect(200); expect(await rows(id)).toEqual([]);
  });

  it.each(resources)('stores explicit %s reminder instants unchanged across midnight and DST', async resource => {
    const id = await create(resource);
    for (const at of ['2030-03-10T00:00:00Z', '2030-03-10T08:59:59.123Z', '2030-03-10T09:00:00Z', '2030-11-03T07:30:12.345Z', '2030-11-03T08:30:12.345Z']) {
      const changed = await patch(resource, id, { reminder: { kind: 'instant', at } }).expect(200);
      expect(changed.body.reminder).toEqual({ kind: 'instant', at });
      const intent = await rows(id); expect(intent).toHaveLength(1); expect(intent[0].fireAt.toISOString()).toBe(new Date(at).toISOString());
    }
  });
});
