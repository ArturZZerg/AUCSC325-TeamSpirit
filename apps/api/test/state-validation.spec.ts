import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../src/common';
import { GoalsController, ReminderService, TasksController } from '../src/data';
import { PrismaService } from '../src/prisma.service';

const userId = '00000000-0000-4000-8000-000000000001';
const recordId = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-09-27T12:00:00.000Z');
const goal = {
  id: recordId, userId, title: 'Read', category: 'personal',
  schedule: { kind: 'daily' }, timeZone: 'America/Denver', reminder: null,
  pausedAt: null, snoozedUntil: null, createdAt: now, updatedAt: now,
};
const task = {
  id: recordId, userId, title: 'Study', description: null, priority: 'medium',
  category: 'personal', due: null, scheduled: { kind: 'date', date: '2026-09-27' },
  recurrence: { frequency: 'daily', interval: 1 }, reminder: null,
  estimatedMinutes: null, completedAt: null, snoozedUntil: null,
  mainGoalDate: null, createdAt: now, updatedAt: now,
};

describe('task and goal state request validation (ToR sections 5 and 7)', () => {
  let app: INestApplication;
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    session: { findUnique: jest.fn() },
    goal: { findFirst: jest.fn(), update: jest.fn() },
    personalTask: { findFirst: jest.fn(), update: jest.fn() },
    reminder: { deleteMany: jest.fn(), create: jest.fn() },
    taskCompletion: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  const post = (path: string) => request(app.getHttpServer()).post(path).set('Authorization', 'Bearer test-session');

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GoalsController, TasksController],
      providers: [AuthGuard, ReminderService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.session.findUnique.mockResolvedValue({
      revokedAt: null, expiresAt: new Date('2099-01-01'),
      user: { id: userId, email: 'student@example.test', displayName: 'Student', timeZone: 'America/Denver' },
    });
    prisma.goal.findFirst.mockImplementation(async ({ where }: { where: { id: string; userId: string } }) =>
      where.id === recordId && where.userId === userId ? goal : null);
    prisma.goal.update.mockImplementation(async ({ data }: { data: { pausedAt: Date | null } }) => ({ ...goal, ...data }));
    prisma.personalTask.findFirst.mockImplementation(async ({ where }: { where: { id: string; userId: string } }) =>
      where.id === recordId && where.userId === userId ? task : null);
  });

  afterAll(async () => { await app.close(); });

  it.each([true, false])('accepts explicit paused=%s', async paused => {
    const response = await post(`/goals/${recordId}/pause`).send({ paused }).expect(201);
    if (paused === false) expect(response.body.pausedAt).toBeNull();
    else expect(Number.isNaN(Date.parse(response.body.pausedAt))).toBe(false);
    expect(prisma.goal.update).toHaveBeenCalledTimes(1);
  });

  it('rejects an omitted pause state without changing the goal', async () => {
    await post(`/goals/${recordId}/pause`).send({}).expect(400);
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it.each(['false', 'true', 0, 1, null, [], {}])('rejects malformed paused=%j without changing the goal', async paused => {
    await post(`/goals/${recordId}/pause`).send({ paused }).expect(400);
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it.each([true, false])('requires an occurrence date for recurring completion=%s', async completed => {
    const response = await post(`/tasks/${recordId}/complete`).send({ completed }).expect(400);
    expect(response.body.message).toBe('A recurring task completion requires an occurrence date');
    expect(prisma.taskCompletion.upsert).not.toHaveBeenCalled();
    expect(prisma.taskCompletion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.personalTask.update).not.toHaveBeenCalled();
  });

  it.each(['2026-02-30', 'not-a-date'])('rejects invalid occurrence date %s without recording completion', async occurrenceKey => {
    await post(`/tasks/${recordId}/complete`).send({ completed: true, occurrenceKey }).expect(400);
    expect(prisma.taskCompletion.upsert).not.toHaveBeenCalled();
  });

  it('accepts a valid recurring occurrence for completion and undo', async () => {
    await post(`/tasks/${recordId}/complete`).send({ completed: true, occurrenceKey: '2026-09-27' }).expect(201);
    expect(prisma.taskCompletion.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId, taskId: recordId, occurrenceKey: '2026-09-27' },
    }));
    await post(`/tasks/${recordId}/complete`).send({ completed: false, occurrenceKey: '2026-09-27' }).expect(201);
    expect(prisma.taskCompletion.deleteMany).toHaveBeenCalledWith({ where: { userId, taskId: recordId, occurrenceKey: '2026-09-27' } });
    expect(prisma.personalTask.update).not.toHaveBeenCalled();
  });

  it('allows a one-time task to complete without an occurrence date', async () => {
    prisma.personalTask.findFirst.mockResolvedValue({ ...task, recurrence: null });
    prisma.personalTask.update.mockResolvedValue({ ...task, recurrence: null, completedAt: now });
    const response = await post(`/tasks/${recordId}/complete`).send({ completed: true }).expect(201);
    expect(response.body.completedAt).toBe(now.toISOString());
    expect(prisma.taskCompletion.upsert).not.toHaveBeenCalled();
  });

  it('rejects adding recurrence to a completed one-time task without changing state', async () => {
    prisma.personalTask.findFirst.mockResolvedValue({ ...task, recurrence: null, completedAt: now });
    const response = await request(app.getHttpServer()).patch(`/tasks/${recordId}`).set('Authorization', 'Bearer test-session')
      .send({ recurrence: { frequency: 'daily' } }).expect(400);
    expect(response.body.message).toBe('Undo completion before making this task repeat');
    expect(prisma.personalTask.update).not.toHaveBeenCalled(); expect(prisma.reminder.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps missing records distinct from invalid state requests', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);
    prisma.personalTask.findFirst.mockResolvedValue(null);
    await post(`/goals/${recordId}/pause`).send({ paused: true }).expect(404);
    await post(`/tasks/${recordId}/complete`).send({ completed: true }).expect(404);
    expect(prisma.goal.update).not.toHaveBeenCalled();
    expect(prisma.taskCompletion.upsert).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated state changes', async () => {
    await request(app.getHttpServer()).post(`/goals/${recordId}/pause`).send({ paused: true }).expect(401);
    await request(app.getHttpServer()).post(`/tasks/${recordId}/complete`).send({ completed: true }).expect(401);
    expect(prisma.goal.update).not.toHaveBeenCalled();
    expect(prisma.personalTask.update).not.toHaveBeenCalled();
  });
});
