import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AuthGuard } from '../src/common';
import { AcademicController, ReminderService } from '../src/data';
import { PrismaService } from '../src/prisma.service';

const userId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const courseId = '00000000-0000-4000-8000-000000000003';
const manual = { id, userId, source: 'manual', externalId: id, title: 'Essay', kind: 'assignment', courseId: null,
  due: null, submissionState: 'unsubmitted', mainGoalDate: null, reminderLeadMinutes: null, updatedAt: new Date('2026-10-07T12:00:00Z') };
describe('Manual coursework HTTP boundaries', () => {
  let app: INestApplication; let item = manual;
  const prisma = { $transaction: jest.fn(), session: { findUnique: jest.fn() },
    academicItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    course: { findFirst: jest.fn() }, reminder: { deleteMany: jest.fn() } };
  const reminders = { lockAcademicReminders: jest.fn(), lockAcademicItem: jest.fn(), reconcileAcademicItem: jest.fn() };
  const client = () => request(app.getHttpServer());
  const auth = { Authorization: 'Bearer manual-test-session' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AcademicController],
      providers: [AuthGuard, { provide: PrismaService, useValue: prisma }, { provide: ReminderService, useValue: reminders }] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks(); item = manual;
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
    prisma.session.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date('2099-01-01'), user: { id: userId, timeZone: 'America/Denver' } });
    prisma.academicItem.findFirst.mockImplementation(async ({ where }: { where: { id: string; userId: string; source: string } }) => where.id === item.id && where.userId === item.userId && where.source === item.source ? item : null);
    const result = ({ data }: { data: Record<string, unknown> }) => ({ ...item, ...data, due: data.due === Prisma.JsonNull ? null : data.due ?? item.due });
    prisma.academicItem.create.mockImplementation(result); prisma.academicItem.update.mockImplementation(result);
    prisma.course.findFirst.mockResolvedValue(null);
  });
  afterAll(async () => { await app.close(); });
  it('creates account-owned coursework with a server identity and unfinished default', async () => {
    const response = await client().post('/academic-items').set(auth).send({ title: ' Essay ', kind: 'assignment' }).expect(201);
    expect(response.body).toMatchObject({ title: 'Essay', source: 'manual', submissionState: 'unsubmitted', courseId: null, due: null });
    expect(response.body.externalId).toMatch(/^[a-f0-9-]{36}$/);
    expect(prisma.academicItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId }) });
  });
  it.each([{}, { title: '', kind: 'quiz' }, { title: 'Quiz', kind: 'quiz', source: 'manual' },
    { title: 'Quiz', kind: 'quiz', submissionState: 'graded' }, { title: 'Quiz', kind: 'quiz', due: { kind: 'date', date: '2026-02-30' } }])('rejects invalid creates before writing %j', async body => {
    await client().post('/academic-items').set(auth).send(body).expect(400); expect(prisma.academicItem.create).not.toHaveBeenCalled();
  });
  it('requires authentication for create, edit and delete', async () => {
    await client().post('/academic-items').send({ title: 'Essay', kind: 'assignment' }).expect(401);
    await client().patch(`/academic-items/${id}`).send({ title: 'Changed' }).expect(401);
    await client().delete(`/academic-items/${id}`).expect(401);
  });
  it('rejects unowned course association on create and edit', async () => {
    await client().post('/academic-items').set(auth).send({ title: 'Essay', kind: 'assignment', courseId }).expect(404);
    await client().patch(`/academic-items/${id}`).set(auth).send({ courseId }).expect(404);
    expect(prisma.course.findFirst).toHaveBeenCalledWith({ where: { id: courseId, userId } });
    expect(prisma.academicItem.create).not.toHaveBeenCalled(); expect(prisma.academicItem.update).not.toHaveBeenCalled();
  });
  it.each(['canvas:fixture', 'other-account'])('protects imported or foreign-owned coursework %s', async source => {
    item = source === 'other-account' ? { ...manual, userId: courseId } : { ...manual, source };
    await client().patch(`/academic-items/${id}`).set(auth).send({ title: 'Changed' }).expect(404);
    await client().delete(`/academic-items/${id}`).set(auth).expect(404);
    expect(prisma.academicItem.update).not.toHaveBeenCalled(); expect(prisma.academicItem.delete).not.toHaveBeenCalled();
  });
  it.each([{}, { submissionState: 'graded' }, { submissionState: 'missing' }, { externalId: 'changed' }])('rejects invalid updates %j', async body => {
    await client().patch(`/academic-items/${id}`).set(auth).send(body).expect(400); expect(prisma.academicItem.update).not.toHaveBeenCalled();
  });
  it('reconciles reminders and clears a finished Main Goal', async () => {
    await client().patch(`/academic-items/${id}`).set(auth).send({ submissionState: 'submitted' }).expect(200);
    expect(prisma.academicItem.update).toHaveBeenCalledWith({ where: { id }, data: { submissionState: 'submitted', due: undefined, mainGoalDate: null } });
    expect(reminders.reconcileAcademicItem).toHaveBeenCalledWith(userId, id, prisma);
  });
  it('deletes owned legacy reminder targets along with coursework', async () => {
    await client().delete(`/academic-items/${id}`).set(auth).expect(200, { deleted: true });
    expect(prisma.reminder.deleteMany).toHaveBeenCalledWith({ where: { userId, targetKind: 'academicItem', targetId: id } });
    expect(prisma.academicItem.delete).toHaveBeenCalledWith({ where: { id } });
  });
});
