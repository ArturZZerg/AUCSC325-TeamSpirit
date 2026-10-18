import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { recoveryRecipientHash } from '../src/auth-recovery/recovery-secrets';
import { demoEmail, DemoSend, removeDemoUser, resetDemoUser, seedDemoAccount } from '../src/demo-account';
import { PrismaService } from '../src/prisma.service';

const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
databaseSuite('demo account', () => {
  let app: INestApplication, db: PrismaService, otherToken: string;
  const marker = `demo-account-${randomUUID()}`, password = 'demo-account-test-123', client = () => request(app.getHttpServer());
  const signIn = (secret = password) => client().post('/auth/login').send({ email: demoEmail, password: secret });
  const sender = (token: string): DemoSend => async (method, path, body) => {
    const call = method === 'GET' ? client().get(path) : method === 'PUT' ? client().put(path).send(body as object) : client().post(path).send(body as object);
    const response = await call.set('Authorization', `Bearer ${token}`);
    if (response.status >= 400) throw new Error(`${method} ${path} ${response.status} ${JSON.stringify(response.body)}`);
    return response.body;
  };
  const reset = async (now: string) => {
    const token = await resetDemoUser(db, password);
    return { token, summary: await seedDemoAccount(sender(token), now) };
  };
  const counts = async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: demoEmail }, select: { id: true } });
    const where = { userId: user.id };
    return { courses: await db.course.count({ where }), classes: await db.classSchedule.count({ where }), coursework: await db.academicItem.count({ where }),
      tasks: await db.personalTask.count({ where }), goals: await db.goal.count({ where }), journal: await db.wellnessEntry.count({ where }) };
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(PrismaService);
    otherToken = (await client().post('/auth/register').send({ email: `${marker}@example.test`, displayName: 'Other',
      password: 'demo-other-test-123', timeZone: 'America/Edmonton' }).expect(201)).body.accessToken;
    await client().post('/tasks').set('Authorization', `Bearer ${otherToken}`).send({ title: 'Someone else’s task' }).expect(201);
  });
  afterAll(async () => {
    if (db) await db.user.deleteMany({ where: { email: { in: [demoEmail, `${marker}@example.test`] } } });
    if (app) await app.close();
  });

  it('builds a non-empty Today for a weekday morning', async () => {
    // The nightly run at 10:00 UTC is 04:00 MDT on Wednesday 2026-10-14, the day viewers see.
    const { token, summary } = await reset('2026-10-14T10:00:00Z');
    expect(summary).toMatchObject({ courses: 3, classes: 4, coursework: 4, tasks: 4, goals: 2 });
    const today = (await client().get('/today?date=2026-10-14').set('Authorization', `Bearer ${token}`).expect(200)).body;
    const kinds = new Set((today.items as { kind: string }[]).map(item => item.kind));
    expect(today.items.length).toBeGreaterThanOrEqual(4);
    expect([...kinds]).toEqual(expect.arrayContaining(['academic', 'personalTask', 'goal']));
    const grades = (await client().get('/courses').set('Authorization', `Bearer ${token}`).expect(200)).body as { code: string; assessments: unknown[] }[];
    expect(grades.find(course => course.code === 'BIOL 107')?.assessments).toHaveLength(4);
  });

  it('resets to the same data without duplicates and leaves other accounts alone', async () => {
    await reset('2026-10-18T16:00:00Z');
    const first = await counts();
    const stale = (await signIn().expect(201)).body.accessToken as string;
    await reset('2026-10-18T16:00:00Z');
    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({ courses: 3, classes: 4, coursework: 4, journal: 2 });
    // The old account and its sessions are gone, not merged.
    await client().get('/today').set('Authorization', `Bearer ${stale}`).expect(401);
    const others = (await client().get('/tasks').set('Authorization', `Bearer ${otherToken}`).expect(200)).body as { title: string }[];
    expect(others.map(task => task.title)).toEqual(['Someone else’s task']);
  });

  it('removes a half-seeded account when asked', async () => {
    const { token } = await reset('2026-10-18T16:00:00Z');
    await removeDemoUser(db);
    expect(await db.user.count({ where: { email: demoEmail } })).toBe(0);
    await client().get('/today').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rejects a short password without touching the existing demo account', async () => {
    await reset('2026-10-18T16:00:00Z');
    const before = await counts();
    await expect(resetDemoUser(db, 'short')).rejects.toThrow('12-128');
    expect(await counts()).toEqual(before);
    await signIn().expect(201);
  });

  it('resets even after the published address exhausts its sign-in quota', async () => {
    await reset('2026-10-18T16:00:00Z');
    for (let attempt = 0; attempt < 9; attempt++) await signIn('wrong-password-123');
    await signIn().expect(429);
    const user = await db.user.findUniqueOrThrow({ where: { email: demoEmail } });
    // Production quotas are shared rows keyed by address; local tests count in memory, so plant one.
    await db.recoveryRateBucket.create({ data: { key: `demo-test-${randomUUID()}`, recipientHash: recoveryRecipientHash(demoEmail),
      count: 9, expiresAt: new Date(Date.now() + 15 * 60 * 1000) } });
    const { token } = await reset('2026-10-18T16:00:00Z');
    expect(await db.recoveryRateBucket.count({ where: { recipientHash: recoveryRecipientHash(demoEmail) } })).toBe(0);
    expect(await db.user.count({ where: { id: user.id } })).toBe(0);
    // The fresh seed session works even while sign-in for the address is throttled.
    await client().get('/today').set('Authorization', `Bearer ${token}`).expect(200);
    const sessions = await db.session.findMany({ where: { user: { email: demoEmail } } });
    const seed = sessions.find(row => row.expiresAt.getTime() <= Date.now() + 15 * 60 * 1000);
    expect(seed).toBeDefined();
    expect(token).toHaveLength(43);
  });
});
