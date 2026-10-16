import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const runWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runWithDatabase('notification preference API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marker = `notification-preferences-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const account = (label: string) => ({
    email: `${marker}-${label}@example.test`,
    displayName: label,
    password: 'a-long-test-password-123',
    timeZone: 'America/Edmonton',
  });
  const client = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
    await app.close();
  });

  it('returns the default preferences for a newly registered account', async () => {
    const registration = await client().post('/auth/register').send(account('defaults')).expect(201);
    const token = String(registration.body.accessToken);

    await client().get('/notification-preferences').set('Authorization', token).expect(200)
      .expect(response => {
        expect(response.body).toEqual({
          academicEnabled: true,
          personalEnabled: true,
          goalEnabled: true,
          eventEnabled: true,
          dailyOverviewEnabled: false,
          quietHoursStart: null,
          quietHoursEnd: null,
        });
      });
  });

  it('applies partial updates without resetting unrelated preferences', async () => {
    const registration = await client().post('/auth/register').send(account('partial')).expect(201);
    const token = String(registration.body.accessToken);

    await client().patch('/notification-preferences').set('Authorization', token).send({
      academicEnabled: false,
      personalEnabled: false,
      dailyOverviewEnabled: true,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:00',
    }).expect(200);

    const response = await client().patch('/notification-preferences').set('Authorization', token)
      .send({ personalEnabled: true }).expect(200);

    expect(response.body).toEqual({
      academicEnabled: false,
      personalEnabled: true,
      goalEnabled: true,
      eventEnabled: true,
      dailyOverviewEnabled: true,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:00',
    });
  });

  it('allows quiet hours to be cleared explicitly', async () => {
    const registration = await client().post('/auth/register').send(account('clear')).expect(201);
    const token = String(registration.body.accessToken);

    await client().patch('/notification-preferences').set('Authorization', token).send({
      quietHoursStart: '22:00',
      quietHoursEnd: '06:30',
    }).expect(200);

    const response = await client().patch('/notification-preferences').set('Authorization', token)
      .send({ quietHoursStart: null, quietHoursEnd: null }).expect(200);

    expect(response.body.quietHoursStart).toBeNull();
    expect(response.body.quietHoursEnd).toBeNull();
  });

  it.each([
    { academicEnabled: 'false' },
    { quietHoursStart: '7:00' },
    { quietHoursEnd: '24:00' },
    { quietHoursStart: 'not-a-time' },
    { unsupported: true },
  ])('rejects invalid preference update %j', async body => {
    const registration = await client().post('/auth/register').send(account(`invalid-${Math.random().toString(16).slice(2)}`)).expect(201);
    const token = String(registration.body.accessToken);

    await client().patch('/notification-preferences').set('Authorization', token).send(body).expect(400);
  });

  it('keeps preferences isolated between accounts', async () => {
    const first = await client().post('/auth/register').send(account('first')).expect(201);
    const second = await client().post('/auth/register').send(account('second')).expect(201);
    const firstToken = String(first.body.accessToken);
    const secondToken = String(second.body.accessToken);

    await client().patch('/notification-preferences').set('Authorization', firstToken)
      .send({ academicEnabled: false, eventEnabled: false }).expect(200);

    const secondPreferences = await client().get('/notification-preferences').set('Authorization', secondToken).expect(200);
    expect(secondPreferences.body).toEqual({
      academicEnabled: true,
      personalEnabled: true,
      goalEnabled: true,
      eventEnabled: true,
      dailyOverviewEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  });

  it('requires authentication for reads and updates', async () => {
    await client().get('/notification-preferences').expect(401);
    await client().patch('/notification-preferences').send({ personalEnabled: false }).expect(401);
  });
});
