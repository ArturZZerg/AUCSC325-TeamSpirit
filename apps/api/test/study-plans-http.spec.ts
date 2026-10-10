import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StudyPlansController } from '../src/study-plans';
import { AuthGuard } from '../src/common';
import { PrismaService } from '../src/prisma.service';
const userId = '00000000-0000-4000-8000-000000000001', itemId = '00000000-0000-4000-8000-000000000002';
const body = { requestKey: 'study-http-request-1', academicItemId: itemId, title: 'Prepare report',
  sessions: [{ title: 'Outline', scheduled: { kind: 'date', date: '2025-03-09' }, estimatedMinutes: 50 }] };
const now = new Date('2025-03-08');
const item = { id: itemId, userId, courseId: null, title: 'Report', kind: 'assignment', due: null,
  submissionState: 'unsubmitted', source: 'manual', externalId: 'manual', mainGoalDate: null, updatedAt: now };
describe('Study plan HTTP boundaries (ToR 3.2, 4, 7)', () => {
  let app: INestApplication;
  const prisma = { session: { findUnique: jest.fn() }, $transaction: jest.fn(), $queryRaw: jest.fn(),
    studyPlan: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), findFirstOrThrow: jest.fn() }, academicItem: { findFirst: jest.fn() } };
  const client = () => request(app.getHttpServer()), auth = { Authorization: 'Bearer study-test' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [StudyPlansController], providers: [AuthGuard, { provide: PrismaService, useValue: prisma }] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks(); prisma.session.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date('2099-01-01'), user: { id: userId } });
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
    prisma.$queryRaw.mockResolvedValue([]); prisma.academicItem.findFirst.mockResolvedValue(item); prisma.studyPlan.findMany.mockResolvedValue([]);
    prisma.studyPlan.create.mockImplementation(({ data }: { data: object }) => ({ ...data, deadlineWhenPlanned: null, id: itemId, academicItem: item, tasks: [], createdAt: now }));
    prisma.studyPlan.updateMany.mockResolvedValue({ count: 1 });
    prisma.studyPlan.findFirstOrThrow.mockResolvedValue({ id: itemId, title: body.title, academicItemId: itemId, academicItem: item, deadlineWhenPlanned: null, tasks: [], createdAt: now, archivedAt: null });
  });
  afterAll(async () => { await app.close(); });
  it('authenticates every entry point and filters plan reads by account', async () => {
    await client().get('/study-plans').expect(401); await client().post('/study-plans').send(body).expect(401);
    await client().patch(`/study-plans/${itemId}`).send({ archived: true }).expect(401);
    await client().get('/study-plans').set(auth).expect(200, []);
    expect(prisma.studyPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
  });
  it('creates one owned group with nested nonrecurring tasks and strips private persistence fields', async () => {
    const response = await client().post('/study-plans').set(auth).send(body).expect(201);
    expect(response.body).toMatchObject({ title: 'Prepare report', academicItemId: itemId });
    expect(response.body.userId).toBeUndefined(); expect(response.body.requestHash).toBeUndefined(); expect(response.body.requestKey).toBeUndefined();
    expect(prisma.academicItem.findFirst).toHaveBeenCalledWith({ where: { id: itemId, userId } });
    expect(prisma.studyPlan.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId,
      tasks: { create: [expect.objectContaining({ userId, category: 'university', estimatedMinutes: 50, studyPlanOrder: 0 })] },
    }) }));
  });
  it.each([{ title: '' }, { sessions: [] }, { userId: itemId }, { academicItemId: 'wrong' },
    { sessions: [{ ...body.sessions[0], estimatedMinutes: -1 }] }])('rejects invalid/private input before persistence %j', invalid => {
    return client().post('/study-plans').set(auth).send({ ...body, ...invalid }).expect(400).then(() => expect(prisma.studyPlan.create).not.toHaveBeenCalled());
  });
  it.each([null, { ...item, submissionState: 'submitted' }, { ...item, submissionState: 'graded' }])('refuses unavailable/finished coursework', value => {
    prisma.academicItem.findFirst.mockResolvedValue(value);
    return client().post('/study-plans').set(auth).send(body).expect(400).then(() => expect(prisma.studyPlan.create).not.toHaveBeenCalled());
  });
  it('replays a normalized identical request and conflicts for changed payloads', async () => {
    await client().post('/study-plans').set(auth).send(body).expect(201);
    const data = prisma.studyPlan.create.mock.calls[0][0].data;
    prisma.studyPlan.findUnique.mockResolvedValue({ ...data, deadlineWhenPlanned: null, id: itemId, academicItem: item, tasks: [], createdAt: now });
    await client().post('/study-plans').set(auth).send({ ...body, title: ' Prepare report ' }).expect(201);
    await client().post('/study-plans').set(auth).send({ ...body, title: 'Changed' }).expect(409);
    expect(prisma.studyPlan.create).toHaveBeenCalledTimes(1);
  });
  it('renames/archive/restores only an owned group without rewriting member tasks', async () => {
    await client().patch(`/study-plans/${itemId}`).set(auth).send({ title: ' Renamed ', archived: true }).expect(200);
    expect(prisma.studyPlan.updateMany).toHaveBeenCalledWith({ where: { id: itemId, userId }, data: { title: 'Renamed', archivedAt: expect.any(Date) } });
    await client().patch(`/study-plans/${itemId}`).set(auth).send({ archived: false }).expect(200);
    expect(prisma.studyPlan.updateMany).toHaveBeenLastCalledWith({ where: { id: itemId, userId }, data: { title: undefined, archivedAt: null } });
    prisma.studyPlan.updateMany.mockResolvedValue({ count: 0 });
    await client().patch(`/study-plans/${itemId}`).set(auth).send({ title: 'Foreign' }).expect(404);
  });
  it.each([{}, { title: ' ' }, { userId }, { archived: 'false' }, { tasks: [] }])('rejects invalid metadata updates %j', invalid => {
    return client().patch(`/study-plans/${itemId}`).set(auth).send(invalid).expect(400).then(() => expect(prisma.studyPlan.updateMany).not.toHaveBeenCalled());
  });
  it('validates plan route identity before mutation', () => client().patch('/study-plans/wrong').set(auth).send({ archived: true }).expect(400));
});
