import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { eraseAccount } from '../src/account';
import { REGISTRATION_CONFIG } from '../src/auth-config';
import { AuthGuard } from '../src/common';
import { ReminderService, TaskTemplatesController, TasksController } from '../src/data';
import { PrismaService } from '../src/prisma.service';

const suite = process.env.DATABASE_URL ? describe : describe.skip;
suite('Task templates with PostgreSQL', () => {
  const db = new PrismaService();
  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => { await db.$disconnect(); });

  it('enforces CRUD ownership, copies task values, and cascades account deletion without affecting another owner', async () => {
    const rollback = new Error('Roll back synthetic template audit records');
    await expect(db.$transaction(async tx => {
      const owners = await Promise.all([0, 1].map(async () => {
        const user = await tx.user.create({ data: { email: 'template-audit-' + randomUUID() + '@example.test',
          passwordHash: 'synthetic-not-used-for-login', displayName: 'Template audit', timeZone: 'UTC' } });
        const token = randomUUID();
        await tx.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date('2099-01-01') } });
        return { user, token };
      }));
      let app: INestApplication | undefined;
      try {
        const module = await Test.createTestingModule({
          controllers: [TaskTemplatesController, TasksController],
          providers: [AuthGuard, ReminderService, { provide: PrismaService, useValue: {
              taskTemplate: tx.taskTemplate, personalTask: tx.personalTask, session: tx.session,
              $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
            } },
            { provide: REGISTRATION_CONFIG, useValue: { mode: 'preview' } }],
        }).compile();
        app = module.createNestApplication(); app.useLogger(false); await app.init();
        const client = request(app.getHttpServer());
        const auth = (owner = 0) => 'Bearer ' + owners[owner].token;
        const body = { title: 'Prepare for lab', description: 'Bring notes', estimatedMinutes: 30,
          checklist: ['Read instructions'] };
        const created = (await client.post('/task-templates').set('Authorization', auth()).send(body).expect(201)).body;
        const other = (await client.post('/task-templates').set('Authorization', auth(1)).send({ title: 'Other owner' }).expect(201)).body;
        const listed = await client.get('/task-templates').set('Authorization', auth()).expect(200);
        expect(listed.body.map((row: { id: string }) => row.id)).toEqual([created.id]);
        expect(listed.body[0]).not.toHaveProperty('userId');
        await client.patch('/task-templates/' + created.id).set('Authorization', auth(1)).send({ title: 'Unowned edit' }).expect(404);
        await client.delete('/task-templates/' + created.id).set('Authorization', auth(1)).expect(404);
        expect((await tx.taskTemplate.findUniqueOrThrow({ where: { id: created.id } })).title).toBe(body.title);

        const duplicate = (await client.post('/task-templates').set('Authorization', auth())
          .send({ ...body, title: 'Copy of ' + body.title }).expect(201)).body;
        expect(duplicate.id).not.toBe(created.id);
        await client.patch('/task-templates/' + duplicate.id).set('Authorization', auth())
          .send({ title: 'Independent copy', checklist: ['Different instructions'] }).expect(200);
        expect(await tx.taskTemplate.findUniqueOrThrow({ where: { id: created.id } }))
          .toMatchObject({ title: body.title, checklist: body.checklist });

        const task = (await client.post('/tasks').set('Authorization', auth()).send({
          title: created.title, description: created.description, estimatedMinutes: created.estimatedMinutes,
          checklist: created.checklist.map((title: string) => ({ id: randomUUID(), title })),
        }).expect(201)).body;
        const saved = await tx.personalTask.findUniqueOrThrow({ where: { id: task.id } });
        expect(saved.checklist).toEqual([expect.objectContaining({ title: 'Read instructions', done: false })]);
        expect(saved).not.toHaveProperty('templateId');
        await client.patch('/task-templates/' + created.id).set('Authorization', auth())
          .send({ title: 'Changed template', description: null, estimatedMinutes: null, checklist: ['Changed step'] }).expect(200);
        expect(await tx.personalTask.findUniqueOrThrow({ where: { id: task.id } })).toEqual(saved);
        await client.delete('/task-templates/' + created.id).set('Authorization', auth()).expect(200);
        expect(await tx.taskTemplate.findUnique({ where: { id: created.id } })).toBeNull();
        expect(await tx.personalTask.findUniqueOrThrow({ where: { id: task.id } })).toEqual(saved);

        const remaining = (await client.post('/task-templates').set('Authorization', auth()).send(body).expect(201)).body;
        await eraseAccount(tx, owners[0].user);
        expect(await tx.taskTemplate.findUnique({ where: { id: remaining.id } })).toBeNull();
        expect(await tx.taskTemplate.findUnique({ where: { id: duplicate.id } })).toBeNull();
        expect(await tx.taskTemplate.findUnique({ where: { id: other.id } })).not.toBeNull();
      } finally { await app?.close(); }
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
  }, 40000);
});
