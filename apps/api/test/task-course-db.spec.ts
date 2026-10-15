import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('personal tasks linked to courses', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string;
  const marker = `task-course-${randomUUID()}`, client = () => request(app.getHttpServer());
  const course = async (auth = token) => { const id = randomUUID(); await client().post('/courses').set('Authorization', auth).send({ id, name: `Course ${id.slice(0, 5)}` }).expect(201); return id; };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'task-course-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') token = `Bearer ${response.body.accessToken}`; else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it('creates, moves, clears and exports a task course, and keeps the task when the course is deleted', async () => {
    const first = await course(), second = await course();
    const created = await client().post('/tasks').set('Authorization', token).send({ title: 'Read chapter 4', courseId: first }).expect(201);
    expect(created.body.courseId).toBe(first);
    const moved = await client().patch(`/tasks/${created.body.id}`).set('Authorization', token).send({ courseId: second }).expect(200);
    expect(moved.body.courseId).toBe(second);
    const exported = await client().get('/me/export').set('Authorization', token).expect(200);
    expect(exported.body.personalTasks.find((row: { id: string }) => row.id === created.body.id).courseId).toBe(second);
    await client().delete(`/courses/${second}`).set('Authorization', token).expect(200);
    expect((await client().get(`/tasks/${created.body.id}`).set('Authorization', token).expect(200)).body.courseId).toBeNull();
    await client().patch(`/tasks/${created.body.id}`).set('Authorization', token).send({ courseId: first }).expect(200);
    expect((await client().patch(`/tasks/${created.body.id}`).set('Authorization', token).send({ courseId: null }).expect(200)).body.courseId).toBeNull();
    expect((await client().post('/tasks').set('Authorization', token).send({ title: 'No course' }).expect(201)).body.courseId).toBeNull();
  });

  it('rejects another account’s or a missing course without saving', async () => {
    const foreign = await course(otherToken);
    await client().post('/tasks').set('Authorization', token).send({ title: 'Sneaky', courseId: foreign }).expect(404);
    await client().post('/tasks').set('Authorization', token).send({ title: 'Ghost', courseId: randomUUID() }).expect(404);
    const task = await client().post('/tasks').set('Authorization', token).send({ title: 'Mine' }).expect(201);
    await client().patch(`/tasks/${task.body.id}`).set('Authorization', token).send({ courseId: foreign }).expect(404);
    expect(await db.personalTask.count({ where: { title: { in: ['Sneaky', 'Ghost'] } } })).toBe(0);
    expect((await db.personalTask.findUniqueOrThrow({ where: { id: task.body.id } })).courseId).toBeNull();
  });

  it('includes the course in creation retries without changing hashes of course-less requests', async () => {
    const id = await course(), requestKey = randomUUID();
    const body = { requestKey, title: 'Study block', courseId: id, scheduled: { kind: 'date', date: '2030-03-08' } };
    const first = await client().post('/tasks').set('Authorization', token).send(body).expect(201);
    expect((await client().post('/tasks').set('Authorization', token).send(body).expect(201)).body.id).toBe(first.body.id);
    await client().post('/tasks').set('Authorization', token).send({ ...body, courseId: undefined }).expect(409);
    const plainKey = randomUUID(), plain = { requestKey: plainKey, title: 'Plain', scheduled: { kind: 'date', date: '2030-03-08' } };
    const saved = await client().post('/tasks').set('Authorization', token).send(plain).expect(201);
    expect((await client().post('/tasks').set('Authorization', token).send(plain).expect(201)).body.id).toBe(saved.body.id);
  });
});
