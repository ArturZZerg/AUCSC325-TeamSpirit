import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('course assessments and target grades', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string, userId: string;
  const marker = `grades-${randomUUID()}`, client = () => request(app.getHttpServer());
  const course = async () => { const id = randomUUID(); await client().post('/courses').set('Authorization', token).send({ id, name: `Course ${id.slice(0, 6)}` }).expect(201); return id; };
  const add = (courseId: string, body: Record<string, unknown>, auth = token) => client().post(`/courses/${courseId}/assessments`).set('Authorization', auth).send(body);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'course-grades-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; } else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it('adds, scores, edits and removes assessments, sets a target and exports both', async () => {
    const id = await course(), midterm = randomUUID(), final = randomUUID();
    await add(id, { id: midterm, title: ' Midterm ', weight: 30, score: 78.25 }).expect(201);
    const added = await add(id, { id: final, title: 'Final exam', weight: 50 }).expect(201);
    expect(added.body.assessments).toEqual([{ id: midterm, title: 'Midterm', weight: 30, score: 78.3 }, { id: final, title: 'Final exam', weight: 50, score: null }]);
    await add(id, { id: final, title: 'Final exam', weight: 50 }).expect(201);
    await add(id, { id: final, title: 'Final', weight: 50 }).expect(409);
    const scored = await client().patch(`/courses/${id}/assessments/${final}`).set('Authorization', token).send({ score: 91 }).expect(200);
    expect(scored.body.assessments[1]).toEqual({ id: final, title: 'Final exam', weight: 50, score: 91 });
    const cleared = await client().patch(`/courses/${id}/assessments/${midterm}`).set('Authorization', token).send({ score: null, weight: 40 }).expect(200);
    expect(cleared.body.assessments[0]).toEqual({ id: midterm, title: 'Midterm', weight: 40, score: null });
    const targeted = await client().patch(`/courses/${id}`).set('Authorization', token).send({ targetGrade: 85 }).expect(200);
    expect(targeted.body.targetGrade).toBe(85);
    await client().delete(`/courses/${id}/assessments/${midterm}`).set('Authorization', token).expect(200);
    await client().delete(`/courses/${id}/assessments/${midterm}`).set('Authorization', token).expect(200);
    const exported = await client().get('/me/export').set('Authorization', token).expect(200);
    expect(exported.body.courses.find((row: { id: string }) => row.id === id)).toMatchObject({ targetGrade: 85, assessments: [{ id: final, score: 91 }] });
  });

  it('keeps total weight at or below 100%, validates values and limits the list', async () => {
    const id = await course();
    await add(id, { id: randomUUID(), title: 'Big', weight: 70 }).expect(201);
    const over = await add(id, { id: randomUUID(), title: 'Too much', weight: 31 }).expect(400);
    expect(over.body.message).toMatch(/total 101%/);
    await add(id, { id: randomUUID(), title: 'Zero', weight: 0 }).expect(400);
    await add(id, { id: randomUUID(), title: 'Bonus score', weight: 5, score: 151 }).expect(400);
    await add(id, { id: randomUUID(), title: '  ', weight: 5 }).expect(400);
    await client().patch(`/courses/${id}`).set('Authorization', token).send({ targetGrade: 101 }).expect(400);
    await client().patch(`/courses/${id}/assessments/${randomUUID()}`).set('Authorization', token).send({ score: 50 }).expect(404);
    const small = await course();
    for (let index = 0; index < 30; index++) await add(small, { id: randomUUID(), title: `Quiz ${index}`, weight: 1 }).expect(201);
    await add(small, { id: randomUUID(), title: 'Quiz 31', weight: 1 }).expect(400);
  });

  it('serializes concurrent adds and allows targets on imported courses', async () => {
    const id = await course();
    await Promise.all(Array.from({ length: 6 }, (_, index) => add(id, { id: randomUUID(), title: `Lab ${index}`, weight: 5 }).expect(201)));
    expect((await db.course.findUniqueOrThrow({ where: { id } })).assessments).toHaveLength(6);
    const imported = await db.course.create({ data: { userId, source: 'canvas', externalId: `canvas-${randomUUID()}`, name: 'Imported' } });
    await client().patch(`/courses/${imported.id}`).set('Authorization', token).send({ targetGrade: 70 }).expect(200);
    await add(imported.id, { id: randomUUID(), title: 'Essay', weight: 25, score: 88 }).expect(201);
  });

  it('isolates assessments by account', async () => {
    const id = await course(), item = randomUUID();
    await add(id, { id: item, title: 'Private', weight: 10 }).expect(201);
    await add(id, { id: randomUUID(), title: 'Intrusion', weight: 10 }, otherToken).expect(404);
    await client().patch(`/courses/${id}/assessments/${item}`).set('Authorization', otherToken).send({ score: 100 }).expect(404);
    await client().delete(`/courses/${id}/assessments/${item}`).set('Authorization', otherToken).expect(404);
    await client().patch(`/courses/${id}`).set('Authorization', otherToken).send({ targetGrade: 10 }).expect(404);
  });
  it('groups assessments, weights groups toward 100% and protects groups in use', async () => {
    const id = await course(), quizzes = randomUUID(), labs = randomUUID(), quiz = randomUUID(), exam = randomUUID();
    const group = (body: Record<string, unknown>) => client().post(`/courses/${id}/assessment-groups`).set('Authorization', token).send(body);
    await group({ id: quizzes, title: 'Quizzes', weight: 30 }).expect(201);
    await group({ id: quizzes, title: 'Quizzes', weight: 30 }).expect(201);
    await group({ id: quizzes, title: 'Tests', weight: 30 }).expect(409);
    await group({ id: labs, title: 'Labs', weight: null }).expect(201);
    // Inside a group the weight is a share, so points above 100 are fine.
    await add(id, { id: quiz, title: 'Quiz 1', weight: 250, score: 80, groupId: quizzes }).expect(201);
    await add(id, { id: randomUUID(), title: 'Lost', weight: 5, groupId: randomUUID() }).expect(400);
    await add(id, { id: randomUUID(), title: 'Too big', weight: 250 }).expect(400);
    await add(id, { id: exam, title: 'Final', weight: 70 }).expect(201);
    expect((await add(id, { id: randomUUID(), title: 'Over', weight: 1 }).expect(400)).body.message).toMatch(/total 101%/);
    await client().patch(`/courses/${id}/assessment-groups/${quizzes}`).set('Authorization', token).send({ weight: 31 }).expect(400);
    await client().patch(`/courses/${id}/assessment-groups/${quizzes}`).set('Authorization', token).send({ resetWeight: true }).expect(400);
    // Moving a 250-point quiz out of its group would make it 250% of the course.
    await client().patch(`/courses/${id}/assessments/${quiz}`).set('Authorization', token).send({ groupId: null }).expect(400);
    const moved = await client().patch(`/courses/${id}/assessments/${quiz}`).set('Authorization', token).send({ groupId: labs }).expect(200);
    expect(moved.body.assessments[0]).toEqual({ id: quiz, title: 'Quiz 1', weight: 250, score: 80, groupId: labs });
    await client().delete(`/courses/${id}/assessment-groups/${labs}`).set('Authorization', token).expect(409);
    await client().delete(`/courses/${id}/assessment-groups/${quizzes}`).set('Authorization', token).expect(200);
    await client().delete(`/courses/${id}/assessment-groups/${quizzes}`).set('Authorization', token).expect(200);
    const renamed = await client().patch(`/courses/${id}/assessment-groups/${labs}`).set('Authorization', token).send({ title: 'Lab work', weight: 30 }).expect(200);
    expect(renamed.body.assessmentGroups).toEqual([{ id: labs, title: 'Lab work', weight: 30 }]);
    await client().patch(`/courses/${id}/assessment-groups/${labs}`).set('Authorization', otherToken).send({ weight: 10 }).expect(404);
    const exported = await client().get('/me/export').set('Authorization', token).expect(200);
    expect(exported.body.courses.find((row: { id: string }) => row.id === id)).toMatchObject({ assessmentGroups: [{ id: labs, title: 'Lab work' }] });
  });
});
