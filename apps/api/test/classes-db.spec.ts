import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('Timetable persistence and account isolation', () => {
  let app: INestApplication, db: PrismaService, token: string, otherToken: string, userId: string;
  const marker = `classes-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const body = { title: 'Biology', weekdays: [1, 3], termStart: '2025-03-01', termEnd: '2025-04-30', startTime: '09:00', endTime: '10:00',
    timeZone: 'America/Edmonton', location: 'Room 204', instructor: 'Dr Test', notes: null, color: 'blue' };
  const client = () => request(app.getHttpServer());
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    for (const label of ['first', 'second']) {
      const response = await client().post('/auth/register').send({ email: `${marker}-${label}@example.test`, displayName: label, password: 'class-schedule-test-123', timeZone: 'America/Edmonton' }).expect(201);
      if (label === 'first') { userId = response.body.user.id; token = `Bearer ${response.body.accessToken}`; } else otherToken = `Bearer ${response.body.accessToken}`;
    }
  });
  afterAll(async () => { if (db) await db.user.deleteMany({ where: { email: { startsWith: marker } } }); if (app) await app.close(); });
  it('persists, edits, isolates and removes a class independently of Canvas', async () => {
    const created = await client().post('/classes').set('Authorization', token).send(body).expect(201); const id = created.body.id;
    await client().get('/classes').set('Authorization', otherToken).expect(200, []);
    await client().put(`/classes/${id}`).set('Authorization', otherToken).send({ ...body, title: 'Foreign edit' }).expect(404);
    await client().delete(`/classes/${id}`).set('Authorization', otherToken).expect(404);
    await client().put(`/classes/${id}`).set('Authorization', token).send({ ...body, weekdays: [2, 4], location: null }).expect(200);
    expect(await db.classSchedule.findUnique({ where: { id } })).toMatchObject({ weekdays: [2, 4], location: null, userId });
    await client().delete(`/classes/${id}`).set('Authorization', token).expect(200);
    expect(await db.classSchedule.findUnique({ where: { id } })).toBeNull();
  });
  it('cascades class data when its owning account is removed', async () => {
    const created = await client().post('/classes').set('Authorization', token).send(body).expect(201);
    await db.user.delete({ where: { id: userId } });
    expect(await db.classSchedule.findUnique({ where: { id: created.body.id } })).toBeNull();
  });
});
