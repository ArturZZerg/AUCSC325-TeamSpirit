import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('timetable classes linked to courses', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string;
  const marker = `class-course-${randomUUID()}`, client = () => request(app.getHttpServer());
  const course = async (auth = token) => { const id = randomUUID(); await client().post('/courses').set('Authorization', auth).send({ id, name: `Course ${id.slice(0, 5)}` }).expect(201); return id; };
  const lecture = { title: 'Psychology lecture', weekdays: [1, 3], termStart: '2026-09-01', termEnd: '2026-12-15', startTime: '10:00', endTime: '10:50',
    timeZone: 'America/Edmonton', location: 'Arts 101', instructor: null, notes: null, color: 'blue' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label,
        password: 'class-course-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') token = `Bearer ${response.body.accessToken}`; else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });

  it('links, keeps on an older full save, clears and exports a class course', async () => {
    const first = await course(), second = await course();
    const created = await client().post('/classes').set('Authorization', token).send({ ...lecture, courseId: first }).expect(201);
    expect(created.body.courseId).toBe(first);
    // A save that predates course links omits the field and must keep the link.
    expect((await client().put(`/classes/${created.body.id}`).set('Authorization', token).send({ ...lecture, location: 'Arts 102' }).expect(200)).body)
      .toMatchObject({ courseId: first, location: 'Arts 102' });
    expect((await client().put(`/classes/${created.body.id}`).set('Authorization', token).send({ ...lecture, courseId: second }).expect(200)).body.courseId).toBe(second);
    const exported = await client().get('/me/export').set('Authorization', token).expect(200);
    expect(exported.body.classes.find((row: { id: string }) => row.id === created.body.id).courseId).toBe(second);
    await client().delete(`/courses/${second}`).set('Authorization', token).expect(200);
    const listed = await client().get('/classes').set('Authorization', token).expect(200);
    expect(listed.body.find((row: { id: string }) => row.id === created.body.id).courseId).toBeNull();
    expect((await client().post('/classes').set('Authorization', token).send(lecture).expect(201)).body.courseId).toBeNull();
    await client().put(`/classes/${created.body.id}`).set('Authorization', token).send({ ...lecture, courseId: first }).expect(200);
    expect((await client().put(`/classes/${created.body.id}`).set('Authorization', token).send({ ...lecture, courseId: null }).expect(200)).body.courseId).toBeNull();
  });

  it('rejects another account’s or a missing course without saving', async () => {
    const foreign = await course(otherToken);
    await client().post('/classes').set('Authorization', token).send({ ...lecture, title: 'Foreign', courseId: foreign }).expect(404);
    await client().post('/classes').set('Authorization', token).send({ ...lecture, title: 'Missing', courseId: randomUUID() }).expect(404);
    const created = await client().post('/classes').set('Authorization', token).send(lecture).expect(201);
    await client().put(`/classes/${created.body.id}`).set('Authorization', token).send({ ...lecture, title: 'Moved', courseId: foreign }).expect(404);
    const classes = (await client().get('/classes').set('Authorization', token).expect(200)).body as { title: string; courseId: string | null }[];
    expect(classes.map(row => row.title)).not.toEqual(expect.arrayContaining(['Foreign', 'Missing', 'Moved']));
    await client().post('/classes').set('Authorization', token).send({ ...lecture, courseId: 'not-a-uuid' }).expect(400);
  });
});
