import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const runWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runWithDatabase('account-owned planning API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marker = `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const account = (label: string) => ({ email: `${marker}-${label}@example.test`, displayName: label, password: 'a-long-test-password-123', timeZone: 'America/Edmonton' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
    await app.close();
  });

  it('keeps records private, composes Today, and revokes logout tokens', async () => {
    const first = await request(app.getHttpServer()).post('/auth/register').send(account('first')).expect(201);
    const second = await request(app.getHttpServer()).post('/auth/register').send(account('second')).expect(201);
    expect(first.body.user.passwordHash).toBeUndefined();
    const firstToken = `Bearer ${first.body.accessToken}`;
    const task = await request(app.getHttpServer()).post('/tasks').set('Authorization', firstToken).send({ title: 'Write proposal', priority: 'high', due: { kind: 'date', date: '2026-09-21' }, reminder: { kind: 'instant', at: '2026-09-21T18:00:00.000Z' } }).expect(201);
    const reminders = await request(app.getHttpServer()).get('/reminders').set('Authorization', firstToken).expect(200);
    expect(reminders.body).toHaveLength(1);
    await request(app.getHttpServer()).get('/tasks').set('Authorization', `Bearer ${second.body.accessToken}`).expect(200).expect([]);
    const today = await request(app.getHttpServer()).get('/today?date=2026-09-21').set('Authorization', firstToken).expect(200);
    expect(today.body.items.some((item: { entityId: string }) => item.entityId === task.body.id)).toBe(true);
    await request(app.getHttpServer()).post('/auth/logout').set('Authorization', firstToken).expect(201);
    await request(app.getHttpServer()).get('/tasks').set('Authorization', firstToken).expect(401);
  });
});
