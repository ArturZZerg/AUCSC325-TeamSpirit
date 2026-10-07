import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('Manual coursework persistence and reminder lifecycle', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string, userId: string, otherId: string;
  const marker = `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const previousMode = process.env.CANVAS_MODE;
  const client = () => request(app.getHttpServer());
  const create = (body = {}) => client().post('/academic-items').set('Authorization', token).send({ title: 'Syllabus essay', kind: 'assignment', due: { kind: 'instant', at: '2030-10-10T18:00:00Z' }, ...body });
  const edit = (id: string, body: Record<string, unknown>) => client().patch(`/academic-items/${id}`).set('Authorization', token).send(body);
  beforeAll(async () => {
    process.env.CANVAS_MODE = 'fixture';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label, password: 'manual-coursework-test-123', timeZone: 'America/Denver' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; }
      else { otherId = response.body.user.id; otherToken = `Bearer ${response.body.accessToken}`; }
    }
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close();
    if (previousMode === undefined) delete process.env.CANVAS_MODE; else process.env.CANVAS_MODE = previousMode;
  });
  it('persists independent identities and appears in Today and offline snapshots without Canvas', async () => {
    const first = await create().expect(201); const second = await create().expect(201);
    expect(first.body.externalId).not.toBe(second.body.externalId);
    const today = await client().get('/today?date=2030-10-10').set('Authorization', token).expect(200);
    expect(today.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: first.body.id, kind: 'academic', state: 'today' })]));
    const snapshot = await client().get('/snapshot?date=2030-10-10').set('Authorization', token).expect(200);
    expect(snapshot.body.academicItems).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.body.id, source: 'manual' })]));
    const foreign = await client().get('/academic-items').set('Authorization', otherToken).expect(200); expect(foreign.body).toEqual([]);
  });
  it('reschedules, disables on finish, restores on reopen and removes reminders on deletion', async () => {
    const id = (await create().expect(201)).body.id;
    await client().put(`/academic-items/${id}/reminder`).set('Authorization', token).send({ leadMinutes: 60 }).expect(200);
    const first = await db.reminder.findFirstOrThrow({ where: { academicItemId: id } });
    await edit(id, { due: { kind: 'instant', at: '2030-10-11T18:00:00Z' } }).expect(200);
    expect(await db.reminder.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ enabled: true, fireAt: new Date('2030-10-11T17:00:00Z') });
    await edit(id, { submissionState: 'submitted' }).expect(200);
    expect((await db.reminder.findUniqueOrThrow({ where: { id: first.id } })).enabled).toBe(false);
    const today = await client().get('/today?date=2030-10-11').set('Authorization', token).expect(200);
    expect(today.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: id, state: 'completed', allowedActions: ['open'] })]));
    await edit(id, { submissionState: 'unsubmitted' }).expect(200);
    expect((await db.reminder.findUniqueOrThrow({ where: { id: first.id } })).enabled).toBe(true);
    await Promise.all([edit(id, { title: 'Updated essay' }).expect(200), client().put(`/academic-items/${id}/reminder`).set('Authorization', token).send({ leadMinutes: 60 }).expect(200)]);
    expect(await db.reminder.count({ where: { academicItemId: id } })).toBe(1);
    await db.reminder.create({ data: { userId, targetKind: 'academicItem', targetId: id, fireAt: new Date('2030-10-11T17:00:00Z') } });
    await client().delete(`/academic-items/${id}`).set('Authorization', token).expect(200);
    expect(await db.reminder.count({ where: { targetId: id } })).toBe(0);
    expect(await db.academicItem.findUnique({ where: { id } })).toBeNull();
  });
  it('protects imported and foreign items and foreign course associations', async () => {
    const id = (await create().expect(201)).body.id;
    await client().patch(`/academic-items/${id}`).set('Authorization', otherToken).send({ title: 'Foreign' }).expect(404);
    await client().delete(`/academic-items/${id}`).set('Authorization', otherToken).expect(404);
    const course = await db.course.create({ data: { userId: otherId, source: 'canvas:fixture', externalId: 'other-course', name: 'Other course' } });
    await create({ courseId: course.id }).expect(404); await edit(id, { courseId: course.id }).expect(404);
    const imported = await db.academicItem.create({ data: { userId, source: 'canvas:fixture', externalId: 'readonly', title: 'Imported', kind: 'quiz' } });
    await edit(imported.id, { title: 'Changed' }).expect(404);
    await client().delete(`/academic-items/${imported.id}`).set('Authorization', token).expect(404);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id: imported.id } })).title).toBe('Imported');
  });
  it('accepts owned course reassignment and explicit date-only or absent deadlines', async () => {
    const course = await db.course.create({ data: { userId, source: 'canvas:fixture', externalId: 'owned-course', name: 'Owned course' } });
    const id = (await create({ courseId: course.id, due: { kind: 'date', date: '2030-10-12' } }).expect(201)).body.id;
    const response = await edit(id, { courseId: null, due: null }).expect(200);
    expect(response.body.courseId).toBeNull(); expect(response.body.due).toBeNull();
  });
  it('leaves user-entered academic state intact across repeated Canvas synchronization', async () => {
    const id = (await create({ title: 'My syllabus quiz', kind: 'quiz' }).expect(201)).body.id;
    await edit(id, { submissionState: 'submitted' }).expect(200);
    const before = await db.academicItem.findUniqueOrThrow({ where: { id } });
    await client().post('/canvas/dev/connect').set('Authorization', token).send({}).expect(201);
    await client().post('/canvas/sync').set('Authorization', token).send({}).expect(201);
    await client().post('/canvas/sync').set('Authorization', token).send({}).expect(201);
    expect(await db.academicItem.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
});
