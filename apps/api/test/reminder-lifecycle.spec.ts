import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

const runWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runWithDatabase('personal task reminder lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  const marker = `reminder-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const account = (label: string) => ({
    email: `${marker}-${label}@example.test`,
    displayName: label,
    password: 'a-long-test-password-123',
    timeZone: 'America/Edmonton',
  });
  const client = () => request(app.getHttpServer());
  const reminder = (at: string) => ({ kind: 'instant', at });
  const listReminders = (auth = token) => client().get('/reminders').set('Authorization', auth);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    prisma = app.get(PrismaService);

    const first = await client().post('/auth/register').send(account('owner')).expect(201);
    const second = await client().post('/auth/register').send(account('other')).expect(201);
    token = String(first.body.accessToken);
    otherToken = String(second.body.accessToken);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
    await app.close();
  });

  it('creates one reminder for a task with an instant reminder', async () => {
    const task = await client().post('/tasks').set('Authorization', token).send({
      title: 'Submit report',
      reminder: reminder('2099-09-21T18:00:00.000Z'),
    }).expect(201);

    const response = await listReminders().expect(200);
    expect(response.body).toEqual([expect.objectContaining({
      targetKind: 'personalTask',
      targetId: task.body.id,
      occurrenceKey: null,
      fireAt: '2099-09-21T18:00:00.000Z',
      enabled: true,
    })]);
  });

  it('does not create a reminder when the task has none', async () => {
    const task = await client().post('/tasks').set('Authorization', token).send({ title: 'No reminder' }).expect(201);
    expect((await listReminders().expect(200)).body.some(
      (row: { targetId: string }) => row.targetId === task.body.id,
    )).toBe(false);
  });

  it('replaces an edited reminder instead of creating a duplicate', async () => {
    const task = await client().post('/tasks').set('Authorization', token).send({
      title: 'Change deadline',
      reminder: reminder('2099-09-22T18:00:00.000Z'),
    }).expect(201);

    await client().patch(`/tasks/${task.body.id}`).set('Authorization', token).send({
      reminder: reminder('2099-09-23T18:30:00.000Z'),
    }).expect(200);

    const rows = (await listReminders().expect(200)).body.filter(
      (row: { targetId: string }) => row.targetId === task.body.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fireAt).toBe('2099-09-23T18:30:00.000Z');
  });

  it('clears the persisted reminder when the task reminder is set to null', async () => {
    const task = await client().post('/tasks').set('Authorization', token).send({
      title: 'Clear reminder',
      reminder: reminder('2099-09-24T18:00:00.000Z'),
    }).expect(201);

    await client().patch(`/tasks/${task.body.id}`).set('Authorization', token).send({ reminder: null }).expect(200);

    const rows = (await listReminders().expect(200)).body.filter(
      (row: { targetId: string }) => row.targetId === task.body.id,
    );
    expect(rows).toHaveLength(0);
  });

  it('deletes a task reminder when the task is deleted', async () => {
    const task = await client().post('/tasks').set('Authorization', token).send({
      title: 'Delete reminder',
      reminder: reminder('2099-09-25T18:00:00.000Z'),
    }).expect(201);

    await client().delete(`/tasks/${task.body.id}`).set('Authorization', token).expect(200);
    expect((await listReminders().expect(200)).body.some(
      (row: { targetId: string }) => row.targetId === task.body.id,
    )).toBe(false);
  });

  it('rejects malformed reminders without creating a task', async () => {
    await client().post('/tasks').set('Authorization', token).send({
      title: 'Invalid reminder',
      reminder: { kind: 'instant', at: 'tomorrow' },
    }).expect(400);

    expect((await client().get('/tasks').set('Authorization', token).query({ search: 'Invalid reminder' }).expect(200)).body)
      .toHaveLength(0);
  });

  it('does not allow another account to edit or delete the task reminder', async () => {
    const task = await client().post('/tasks').set('Authorization', token).send({
      title: 'Private reminder',
      reminder: reminder('2099-09-26T18:00:00.000Z'),
    }).expect(201);

    await client().patch(`/tasks/${task.body.id}`).set('Authorization', otherToken)
      .send({ reminder: null }).expect(404);
    await client().delete(`/tasks/${task.body.id}`).set('Authorization', otherToken).expect(404);

    const rows = (await listReminders().expect(200)).body.filter(
      (row: { targetId: string }) => row.targetId === task.body.id,
    );
    expect(rows).toHaveLength(1);
  });

  it('requires authentication to read reminders', async () => {
    await client().get('/reminders').expect(401);
  });
});
