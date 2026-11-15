import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../src/common';
import { TasksController, TaskTemplatesController, ReminderService } from '../src/data';
import { PrismaService } from '../src/prisma.service';

const userId = '10000000-0000-4000-8000-000000000001';
const taskId = '10000000-0000-4000-8000-000000000002';
const stepId = '10000000-0000-4000-8000-000000000003';
const templateId = '10000000-0000-4000-8000-000000000004';
const stamp = new Date('2026-11-14T12:00:00Z');
describe('using task template values', () => {
  let app: INestApplication;
  let savedTask: Record<string, unknown> | undefined;
  let creation: Record<string, unknown> | undefined;
  const prisma = {
    session: { findUnique: jest.fn() },
    $transaction: jest.fn(), $queryRaw: jest.fn(),
    personalTask: { create: jest.fn(), findFirst: jest.fn() },
    taskCreationRequest: { findUnique: jest.fn(), create: jest.fn() },
    taskTemplate: { update: jest.fn(), deleteMany: jest.fn() },
    reminder: { deleteMany: jest.fn() },
  };
  const post = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/tasks').set('Authorization', 'Bearer session').send(body);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [TasksController, TaskTemplatesController],
      providers: [AuthGuard, ReminderService, { provide: PrismaService, useValue: prisma }] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    jest.resetAllMocks(); savedTask = undefined; creation = undefined;
    prisma.$transaction.mockImplementation(async work => work(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.session.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date('2099-01-01'),
      user: { id: userId, email: 'student@example.test', displayName: 'Student', timeZone: 'UTC' } });
    prisma.personalTask.create.mockImplementation(async ({ data }) => {
      savedTask = { ...data, id: taskId, due: null, scheduled: null, recurrence: null, reminder: null,
        completedAt: null, snoozedUntil: null, mainGoalDate: null, createdAt: stamp, updatedAt: stamp };
      return savedTask;
    });
    prisma.personalTask.findFirst.mockImplementation(async () => savedTask);
    prisma.taskCreationRequest.findUnique.mockImplementation(async () => creation);
    prisma.taskCreationRequest.create.mockImplementation(async ({ data }) => { creation = data; return data; });
    prisma.reminder.deleteMany.mockResolvedValue({ count: 0 });
  });
  it('creates copied task details and incomplete steps atomically, and replays the same save without duplicates', async () => {
    const body = { title: 'Lab', description: 'Bring notes', estimatedMinutes: 30,
      checklist: [{ id: stepId, title: 'Read instructions' }], requestKey: 'template-save-123456' };
    const result = await post(body).expect(201);
    expect(result.body).toMatchObject({ title: 'Lab', description: 'Bring notes', estimatedMinutes: 30,
      checklist: [{ id: stepId, title: 'Read instructions', done: false }] });
    expect(savedTask).not.toHaveProperty('templateId');
    const replay = await post(body).expect(201);
    expect(replay.body.id).toBe(result.body.id);
    expect(prisma.personalTask.create).toHaveBeenCalledTimes(1);
    await post({ ...body, checklist: [{ id: stepId, title: 'Different steps' }] }).expect(409);
  });
  it('leaves an existing task unchanged when its source template is edited', async () => {
    await post({ title: 'Lab', description: 'Bring notes', checklist: [{ id: stepId, title: 'Read instructions' }] }).expect(201);
    const before = structuredClone(savedTask);
    prisma.taskTemplate.update.mockImplementation(async ({ data }) => ({ id: templateId, userId,
      ...data, createdAt: stamp, updatedAt: stamp }));
    await request(app.getHttpServer()).patch('/task-templates/' + templateId).set('Authorization', 'Bearer session')
      .send({ title: 'New lab', description: null, estimatedMinutes: 60, checklist: ['Different instructions'] }).expect(200);
    expect(savedTask).toEqual(before);
    expect(prisma.personalTask.create).toHaveBeenCalledTimes(1);
  });
  it('keeps an existing task and its checklist when the source template is deleted', async () => {
    await post({ title: 'Lab', description: 'Bring notes', checklist: [{ id: stepId, title: 'Read instructions' }] }).expect(201);
    const before = structuredClone(savedTask);
    prisma.taskTemplate.deleteMany.mockResolvedValue({ count: 1 });
    await request(app.getHttpServer()).delete('/task-templates/' + templateId).set('Authorization', 'Bearer session').expect(200);
    expect(savedTask).toEqual(before);
    expect(prisma.taskTemplate.deleteMany).toHaveBeenCalledWith({ where: { id: templateId, userId } });
  });
  it('rejects invalid, duplicate or recurring checklist input before creating a task', async () => {
    const step = { id: stepId, title: 'Read notes' };
    for (const body of [
      { title: 'Lab', checklist: [{ ...step, title: '' }] },
      { title: 'Lab', checklist: [step, step] },
      { title: 'Lab', checklist: [step], recurrence: { frequency: 'daily', interval: 1 }, scheduled: { kind: 'date', date: '2026-11-14' } },
    ]) await post(body).expect(400);
    expect(prisma.personalTask.create).not.toHaveBeenCalled();
  });
});
