import { Prisma } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../src/common';
import { TaskTemplatesController } from '../src/data';
import { PrismaService } from '../src/prisma.service';

const userId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
describe('task templates', () => {
  let app: INestApplication;
  const prisma = { session: { findUnique: jest.fn() }, taskTemplate: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() } };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [TaskTemplatesController],
      providers: [AuthGuard, { provide: PrismaService, useValue: prisma }] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.session.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date('2099-01-01'),
      user: { id: userId, email: 'student@example.test', displayName: 'Student', timeZone: 'UTC' } });
    prisma.taskTemplate.create.mockImplementation(async ({ data }) => ({ ...data, id,
      createdAt: new Date('2026-11-14T12:00:00Z'), updatedAt: new Date('2026-11-14T12:00:00Z') }));
  });
  afterAll(async () => { await app.close(); });
  it('creates a template for the authenticated account with task-compatible values', async () => {
    const body = { title: 'Lab', description: 'Bring notes', estimatedMinutes: 30, checklist: ['Read instructions'] };
    const result = await request(app.getHttpServer()).post('/task-templates').set('Authorization', 'Bearer session').send(body).expect(201);
    expect(prisma.taskTemplate.create).toHaveBeenCalledWith({ data: { ...body, userId } });
    expect(result.body).toMatchObject({ ...body, id });
    expect(result.body).not.toHaveProperty('userId');
  });
  it('rejects another owner supplied in the request and invalid checklist steps', async () => {
    for (const body of [{ title: 'Lab', userId: id }, { title: 'Lab', checklist: [''] }]) {
      await request(app.getHttpServer()).post('/task-templates').set('Authorization', 'Bearer session').send(body).expect(400);
    }
    expect(prisma.taskTemplate.create).not.toHaveBeenCalled();
  });
  it('lists only the current account templates and omits private ownership fields', async () => {
    const otherUser = '00000000-0000-4000-8000-000000000003';
    const records = [userId, otherUser].map(owner => ({ id, userId: owner, title: owner === userId ? 'My lab' : 'Private lab',
      description: null, estimatedMinutes: null, checklist: [],
      createdAt: new Date('2026-11-14T12:00:00Z'), updatedAt: new Date('2026-11-14T12:00:00Z') }));
    prisma.taskTemplate.findMany.mockImplementation(async ({ where }) => records.filter(row => row.userId === where.userId));
    const get = () => request(app.getHttpServer()).get('/task-templates').set('Authorization', 'Bearer session');
    const first = await get().expect(200);
    expect(first.body).toEqual([expect.objectContaining({ title: 'My lab', checklist: [] })]);
    expect(first.body[0]).not.toHaveProperty('userId');
    expect(prisma.taskTemplate.findMany).toHaveBeenCalledWith({ where: { userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
    prisma.session.findUnique.mockResolvedValue({ revokedAt: null, expiresAt: new Date('2099-01-01'),
      user: { id: otherUser, email: 'other@example.test', displayName: 'Other', timeZone: 'UTC' } });
    const second = await get().expect(200);
    expect(second.body).toEqual([expect.objectContaining({ title: 'Private lab' })]);
  });
  it('returns an empty list for an account without templates', async () => {
    prisma.taskTemplate.findMany.mockResolvedValue([]);
    const result = await request(app.getHttpServer()).get('/task-templates').set('Authorization', 'Bearer session').expect(200);
    expect(result.body).toEqual([]);
  });
  it('updates owned template fields, including clearing optional values', async () => {
    const body = { title: 'Updated lab', description: null, estimatedMinutes: null, checklist: [] };
    prisma.taskTemplate.update.mockImplementation(async ({ data }) => ({ ...data, id, userId,
      createdAt: new Date('2026-11-14T12:00:00Z'), updatedAt: new Date('2026-11-14T13:00:00Z') }));
    const result = await request(app.getHttpServer()).patch('/task-templates/' + id)
      .set('Authorization', 'Bearer session').send(body).expect(200);
    expect(prisma.taskTemplate.update).toHaveBeenCalledWith({ where: { id, userId }, data: body });
    expect(result.body).toMatchObject(body);
    expect(result.body).not.toHaveProperty('userId');
  });
  it('refuses to update another account template or a missing template', async () => {
    prisma.taskTemplate.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Not found', { code: 'P2025', clientVersion: '6.19.0' }));
    await request(app.getHttpServer()).patch('/task-templates/' + id).set('Authorization', 'Bearer session')
      .send({ title: 'Cannot change this' }).expect(404);
    expect(prisma.taskTemplate.update).toHaveBeenCalledWith({ where: { id, userId }, data: { title: 'Cannot change this' } });
  });
  it('validates edits and rejects owner reassignment', async () => {
    for (const body of [{ title: '' }, { estimatedMinutes: 1441 }, { checklist: [''] }, { userId: id }]) {
      await request(app.getHttpServer()).patch('/task-templates/' + id).set('Authorization', 'Bearer session').send(body).expect(400);
    }
    expect(prisma.taskTemplate.update).not.toHaveBeenCalled();
  });
  it('deletes only the authenticated account template', async () => {
    prisma.taskTemplate.deleteMany.mockResolvedValue({ count: 1 });
    const result = await request(app.getHttpServer()).delete('/task-templates/' + id)
      .set('Authorization', 'Bearer session').expect(200);
    expect(result.body).toEqual({ deleted: true });
    expect(prisma.taskTemplate.deleteMany).toHaveBeenCalledWith({ where: { id, userId } });
  });
  it('returns not found for an unowned or missing template without deleting anything', async () => {
    prisma.taskTemplate.deleteMany.mockResolvedValue({ count: 0 });
    await request(app.getHttpServer()).delete('/task-templates/' + id).set('Authorization', 'Bearer session').expect(404);
    expect(prisma.taskTemplate.deleteMany).toHaveBeenCalledWith({ where: { id, userId } });
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer()).post('/task-templates').send({ title: 'Lab' }).expect(401);
    expect(prisma.taskTemplate.create).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get('/task-templates').expect(401);
    expect(prisma.taskTemplate.findMany).not.toHaveBeenCalled();
    await request(app.getHttpServer()).patch('/task-templates/' + id).send({ title: 'Lab' }).expect(401);
    expect(prisma.taskTemplate.update).not.toHaveBeenCalled();
    await request(app.getHttpServer()).delete('/task-templates/' + id).expect(401);
    expect(prisma.taskTemplate.deleteMany).not.toHaveBeenCalled();
  });
});