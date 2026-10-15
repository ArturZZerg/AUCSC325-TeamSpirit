import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('student-created courses', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string, userId: string;
  const marker = `courses-${randomUUID()}`, client = () => request(app.getHttpServer());
  const create = (body: Record<string, unknown>, auth = token) => client().post('/courses').set('Authorization', auth).send(body);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'manual-course-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; } else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it('creates, lists, edits, archives and exports a course, idempotently for a retried create', async () => {
    const id = randomUUID();
    const created = await create({ id, name: '  Cognitive Psychology ', code: ' PSY 223 ', color: 'plum' }).expect(201);
    expect(created.body).toEqual({ id, externalId: id, name: 'Cognitive Psychology', code: 'PSY 223', active: true, source: 'manual', color: 'plum', assessments: [], targetGrade: null });
    await create({ id, name: 'Cognitive Psychology', code: 'PSY 223', color: 'plum' }).expect(201);
    await create({ id, name: 'Different name' }).expect(409);
    expect(await db.course.count({ where: { userId } })).toBe(1);
    const edited = await client().patch(`/courses/${id}`).set('Authorization', token).send({ code: '', color: 'teal', active: false }).expect(200);
    expect(edited.body).toMatchObject({ code: null, color: 'teal', active: false });
    const listed = await client().get('/courses').set('Authorization', token).expect(200);
    expect(listed.body).toEqual([edited.body]);
    const exported = await client().get('/me/export').set('Authorization', token).expect(200);
    expect(exported.body.courses).toEqual([{ ...edited.body }]);
  });

  it('attaches coursework and keeps it when the course is deleted', async () => {
    const id = randomUUID(); await create({ id, name: 'Statistics' }).expect(201);
    const item = await client().post('/academic-items').set('Authorization', token).send({ title: 'Problem set 3', kind: 'assignment', courseId: id }).expect(201);
    expect(item.body.courseId).toBe(id);
    await client().delete(`/courses/${id}`).set('Authorization', token).expect(200);
    expect((await db.academicItem.findUniqueOrThrow({ where: { id: item.body.id } })).courseId).toBeNull();
    // A retried delete still succeeds.
    await client().delete(`/courses/${id}`).set('Authorization', token).expect(200);
  });

  it('only changes the colour of imported courses', async () => {
    const imported = await db.course.create({ data: { userId, source: 'canvas', externalId: `canvas-${randomUUID()}`, name: 'Imported', code: 'IMP 100' } });
    await client().patch(`/courses/${imported.id}`).set('Authorization', token).send({ name: 'Renamed' }).expect(400);
    await client().patch(`/courses/${imported.id}`).set('Authorization', token).send({ active: false }).expect(400);
    await client().delete(`/courses/${imported.id}`).set('Authorization', token).expect(400);
    const coloured = await client().patch(`/courses/${imported.id}`).set('Authorization', token).send({ color: 'gold' }).expect(200);
    expect(coloured.body).toMatchObject({ name: 'Imported', code: 'IMP 100', active: true, color: 'gold', source: 'canvas' });
  });

  it('validates input, isolates accounts and limits manual courses', async () => {
    await create({ id: randomUUID(), name: '   ' }).expect(400);
    await create({ id: randomUUID(), name: 'Bad colour', color: 'neon' }).expect(400);
    await create({ id: randomUUID(), name: 'Too long code', code: 'X'.repeat(21) }).expect(400);
    const id = randomUUID(); await create({ id, name: 'Private' }).expect(201);
    await client().patch(`/courses/${id}`).set('Authorization', otherToken).send({ name: 'Taken' }).expect(404);
    await client().delete(`/courses/${id}`).set('Authorization', otherToken).expect(200);
    expect(await db.course.findUnique({ where: { id } })).not.toBeNull();
    await create({ id, name: 'Private' }, otherToken).expect(409);
    await client().patch(`/courses/${id}`).set('Authorization', token).send({}).expect(400);
    // Concurrent creates near the limit cannot overshoot it.
    const existing = await db.course.count({ where: { userId, source: 'manual' } });
    await db.course.createMany({ data: Array.from({ length: 38 - existing }, (_, index) => ({ userId, source: 'manual', externalId: randomUUID(), name: `Bulk ${index}` })) });
    const racing = await Promise.all(Array.from({ length: 5 }, (_, index) => create({ id: randomUUID(), name: `Race ${index}` })));
    expect(racing.filter(response => response.status === 201)).toHaveLength(2);
    expect(await db.course.count({ where: { userId, source: 'manual' } })).toBe(40);
    await create({ id: randomUUID(), name: 'One too many' }).expect(400);
  });
});
