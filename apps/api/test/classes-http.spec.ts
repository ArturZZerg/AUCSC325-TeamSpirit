import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ClassesController } from '../src/classes';
import { AuthGuard } from '../src/common';
import { PrismaService } from '../src/prisma.service';
const userId = '00000000-0000-4000-8000-000000000001', id = '00000000-0000-4000-8000-000000000002';
const body = { title: ' Biology ', weekdays: [1, 3], termStart: '2025-03-01', termEnd: '2025-04-30',
  startTime: '09:00', endTime: '10:00', timeZone: 'America/Edmonton', location: 'Room 204', instructor: null, notes: null, color: 'moss' };
describe('Class timetable HTTP boundaries', () => {
  let app: INestApplication;
  const prisma = { session: { findUnique: jest.fn() }, $transaction: jest.fn(), classSchedule: {
    create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), findFirstOrThrow: jest.fn(), deleteMany: jest.fn(),
  } };
  const client = () => request(app.getHttpServer()); const auth = { Authorization: 'Bearer class-test' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ClassesController], providers: [AuthGuard, { provide: PrismaService, useValue: prisma }] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.session.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date('2099-01-01'), user: { id: userId, timeZone: 'America/Edmonton' } });
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
    const row = { ...body, title: 'Biology', id, userId, createdAt: new Date('2025-03-01'), updatedAt: new Date('2025-03-01') };
    prisma.classSchedule.create.mockImplementation(({ data }: { data: object }) => ({ ...row, ...data }));
    prisma.classSchedule.findFirstOrThrow.mockResolvedValue(row); prisma.classSchedule.findMany.mockResolvedValue([row]);
    prisma.classSchedule.updateMany.mockResolvedValue({ count: 1 }); prisma.classSchedule.deleteMany.mockResolvedValue({ count: 1 });
  });
  afterAll(async () => { await app.close(); });
  it('creates and reads normalized owned schedules without exposing ownership fields', async () => {
    const result = await client().post('/classes').set(auth).send(body).expect(201);
    expect(result.body).toMatchObject({ title: 'Biology', location: 'Room 204' }); expect(result.body.userId).toBeUndefined();
    expect(prisma.classSchedule.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId }) });
    const list = await client().get('/classes').set(auth).expect(200); expect(list.body).toHaveLength(1);
    expect(prisma.classSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
  });
  it.each([{ weekdays: [] }, { endTime: '08:00' }, { termEnd: '2024-01-01' }, { userId: id }, { timeZone: 'wrong' }])('rejects invalid create/replacement before writing %j', invalid => {
    return (async () => {
      await client().post('/classes').set(auth).send({ ...body, ...invalid }).expect(400);
      await client().put(`/classes/${id}`).set(auth).send({ ...body, ...invalid }).expect(400);
      expect(prisma.classSchedule.create).not.toHaveBeenCalled(); expect(prisma.classSchedule.updateMany).not.toHaveBeenCalled();
    })();
  });
  it('requires authentication for every timetable endpoint', async () => {
    await client().get('/classes').expect(401); await client().post('/classes').send(body).expect(401);
    await client().put(`/classes/${id}`).send(body).expect(401); await client().delete(`/classes/${id}`).expect(401);
  });
  it('replaces the entire validated pattern and clears optional details explicitly', async () => {
    await client().put(`/classes/${id}`).set(auth).send({ ...body, location: null, weekdays: [5] }).expect(200);
    expect(prisma.classSchedule.updateMany).toHaveBeenCalledWith({ where: { id, userId }, data: { ...body, title: 'Biology', location: null, weekdays: [5] } });
    await client().put(`/classes/${id}`).set(auth).send({ title: 'Partial change' }).expect(400);
  });
  it('uses owned write predicates and returns 404 for missing/foreign classes', async () => {
    prisma.classSchedule.updateMany.mockResolvedValue({ count: 0 }); prisma.classSchedule.deleteMany.mockResolvedValue({ count: 0 });
    await client().put(`/classes/${id}`).set(auth).send(body).expect(404);
    await client().delete(`/classes/${id}`).set(auth).expect(404);
    expect(prisma.classSchedule.deleteMany).toHaveBeenCalledWith({ where: { id, userId } });
    expect(prisma.classSchedule.findFirstOrThrow).not.toHaveBeenCalled();
  });
  it('validates route identities and deletes an owned meeting pattern', async () => {
    await client().delete('/classes/wrong').set(auth).expect(400);
    await client().delete(`/classes/${id}`).set(auth).expect(200, { deleted: true });
  });
});
