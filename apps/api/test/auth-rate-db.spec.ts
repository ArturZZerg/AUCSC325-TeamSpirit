import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AUTH_RATE_CONFIG, AuthRateService } from '../src/auth-rate';
import { REGISTRATION_CONFIG } from '../src/auth-config';
import { AuthService } from '../src/auth';
import { AccountService } from '../src/account';
import { EmailVerificationService } from '../src/email-verification';
import { RECOVERY_CONFIG } from '../src/auth-recovery/recovery-config';
import { RecoveryWorker } from '../src/auth-recovery/recovery-worker';
import { recoveryRecipientHash } from '../src/auth-recovery/recovery-secrets';
import { hashPassword } from '../src/password';
import { PrismaService } from '../src/prisma.service';

(process.env.DATABASE_URL ? describe : describe.skip)('persistent account access limits with mail disabled', () => {
  const namespace = `auth-test-${randomUUID()}`, key = randomBytes(32), password = 'auth-test-password-123';
  const registration = { mode: 'closed' as const }, config = { mode: 'shared' as const, key };
  let app: INestApplication, db: PrismaService, rates: AuthRateService, replica: AuthRateService, auth: AuthService, account: AccountService;
  const client = () => request(app.getHttpServer());
  const seed = () => db.user.create({ data: { email: `${namespace}-${randomUUID()}@example.test`, passwordHash: encoded,
    emailVerifiedAt: new Date(), displayName: 'Student', timeZone: 'UTC' } });
  let encoded: string;
  beforeAll(async () => {
    encoded = await hashPassword(password);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_RATE_CONFIG).useValue(config)
      .overrideProvider(AuthRateService).useFactory({ factory: (prisma: PrismaService) => new AuthRateService(prisma, config, namespace), inject: [PrismaService] })
      .overrideProvider(REGISTRATION_CONFIG).useValue(registration).overrideProvider(RECOVERY_CONFIG).useValue({ mode: 'disabled' })
      .overrideProvider(RecoveryWorker).useValue({}).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); rates = app.get(AuthRateService); replica = new AuthRateService(db, config, namespace);
    auth = app.get(AuthService); account = app.get(AccountService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.user.deleteMany({ where: { email: { startsWith: namespace } } });
    await db.recoveryRateBucket.deleteMany({ where: { key: { startsWith: namespace } } });
  });
  afterAll(async () => { if (app) await app.close(); });
  it('shares concurrent login quotas across replicas, including absent recipients and denied attempts', async () => {
    const email = `${namespace}-absent@example.test`;
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => (i % 2 ? rates : replica).admitLogin(`source-${i}`, email)));
    expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(8);
    for (const value of results) if (value.status === 'rejected') expect(value.reason.status).toBe(429);
    const bucket = await db.recoveryRateBucket.findFirstOrThrow({ where: { recipientHash: recoveryRecipientHash(email) } });
    expect(bucket).toMatchObject({ count: 12, userId: null });
    expect(JSON.stringify(bucket)).not.toContain(email); expect(await db.user.count({ where: { email } })).toBe(0);
  });
  it('persists wrong-password attempts and does not reset them after a successful login', async () => {
    const user = await seed();
    const otherAuth = new AuthService(db, app.get(EmailVerificationService), registration, replica);
    for (let i = 0; i < 7; i++) await expect((i % 2 ? auth : otherAuth).login({ email: user.email, password: 'incorrect' }, randomUUID())).rejects.toMatchObject({ status: 401 });
    await expect(otherAuth.login({ email: user.email, password }, randomUUID())).resolves.toHaveProperty('accessToken');
    await expect(auth.login({ email: user.email, password }, randomUUID())).rejects.toMatchObject({ status: 429 });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    const login = await client().get('/auth/capability').expect(200); expect(login.body).toEqual({ registration: 'closed', verificationAvailable: false });
  });
  it('commits admission even if the separate login transaction rolls back', async () => {
    const user = await seed(), original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => original(async tx => {
      const value = await work(tx);
      if (value && typeof value === 'object' && 'accessToken' in value) throw new Error('simulated login commit failure');
      return value;
    }, options)) as unknown as typeof db.$transaction);
    await expect(auth.login({ email: user.email, password }, 'rollback-source')).rejects.toThrow('simulated login commit failure'); spy.mockRestore();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await db.recoveryRateBucket.findFirstOrThrow({ where: { recipientHash: recoveryRecipientHash(user.email) } })).count).toBe(1);
  });
  it('uses the socket source rather than forged forwarding headers across many recipients', async () => {
    for (let i = 0; i < 40; i++) await client().post('/auth/login').set('X-Forwarded-For', `192.0.2.${i + 1}`)
      .send({ email: `${namespace}-${i}@example.test`, password: 'incorrect' }).expect(401);
    await client().post('/auth/login').set('X-Forwarded-For', '198.51.100.1').send({ email: `${namespace}-blocked@example.test`, password: 'incorrect' }).expect(429);
    expect(await db.recoveryRateBucket.count({ where: { key: { startsWith: `${namespace}:login:source:` } } })).toBe(1);
  });
  it('enforces global limits before allocating recipient metadata and reuses expired UTC windows', async () => {
    const email = `${namespace}-global@example.test`, global = `${namespace}:login:global`;
    await db.recoveryRateBucket.create({ data: { key: global, count: 2000, expiresAt: new Date(Date.now() + 60_000) } });
    await expect(replica.admitLogin('global-source', email)).rejects.toMatchObject({ status: 429 });
    expect((await db.recoveryRateBucket.findUniqueOrThrow({ where: { key: global } })).count).toBe(2001);
    expect(await db.recoveryRateBucket.count({ where: { recipientHash: recoveryRecipientHash(email) } })).toBe(0);
    await db.recoveryRateBucket.update({ where: { key: global }, data: { expiresAt: new Date(0) } });
    await rates.admitLogin('global-source', email);
    const count = await db.recoveryRateBucket.count({ where: { key: { startsWith: namespace } } });
    await db.recoveryRateBucket.updateMany({ where: { key: { startsWith: namespace } }, data: { expiresAt: new Date(0) } });
    await db.$transaction(async tx => { await tx.$executeRaw`SET LOCAL TIME ZONE 'Pacific/Auckland'`;
      // Use the same atomic implementation in a non-UTC connection.
      const { countRateBucket } = await import('../src/rate-bucket');
      expect(await countRateBucket(tx, global, 60_000)).toBe(1);
    });
    await replica.admitLogin('global-source', email);
    expect(await db.recoveryRateBucket.count({ where: { key: { startsWith: namespace } } })).toBe(count);
    const row = await db.recoveryRateBucket.findUniqueOrThrow({ where: { key: global } });
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now()); expect(row.expiresAt.getTime()).toBeLessThan(Date.now() + 65_000);
  });
  it('bounds password challenges across replicas and commits wrong-password and denied counts', async () => {
    const user = await seed(), otherAuth = new AuthService(db, app.get(EmailVerificationService), registration, replica), other = new AccountService(db, otherAuth);
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => (i % 2 ? account : other).delete(user.id, 'incorrect', `source-${i}`)));
    expect(results.map(value => value.status === 'rejected' ? value.reason.status : 200).sort()).toEqual([...Array(8).fill(403), 429, 429].sort());
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect((await db.recoveryRateBucket.findFirstOrThrow({ where: { userId: user.id } })).count).toBe(10);
    await expect(other.delete(user.id, password, randomUUID())).rejects.toMatchObject({ status: 429 });
  });
  it('keeps a committed password admission after mutation rollback and excludes private quota data from export', async () => {
    const user = await seed(); await db.personalTask.create({ data: { userId: user.id, title: 'Keep this task' } });
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => original(async tx => {
      const value = await work(tx); if (value && typeof value === 'object' && 'deleted' in value) throw new Error('simulated deletion commit failure'); return value;
    }, options)) as unknown as typeof db.$transaction);
    await expect(account.delete(user.id, password, 'rollback-source')).rejects.toThrow('simulated deletion commit failure'); spy.mockRestore();
    const bucket = await db.recoveryRateBucket.findFirstOrThrow({ where: { userId: user.id } }); expect(bucket.count).toBe(1);
    const exported = JSON.stringify(await account.export(user.id)); expect(exported).toContain('Keep this task');
    for (const privateValue of ['authRateBuckets', 'RecoveryRateBucket', bucket.key, recoveryRecipientHash(user.email), key.toString('base64')]) expect(exported).not.toContain(privateValue);
  });
  it('erases owned and anonymous recipient metadata while retaining aggregate and another owner limits', async () => {
    const user = await seed(), other = await seed();
    await rates.admitLogin('login-source', user.email); await rates.admitPassword(other.id, 'password-source');
    await account.delete(user.id, password, 'password-source');
    expect(await db.recoveryRateBucket.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.recoveryRateBucket.count({ where: { recipientHash: recoveryRecipientHash(user.email) } })).toBe(0);
    expect(await db.recoveryRateBucket.count({ where: { userId: other.id } })).toBe(1);
    expect(await db.recoveryRateBucket.findUnique({ where: { key: `${namespace}:password:global` } })).not.toBeNull();
    await expect(replica.admitPassword(user.id, randomUUID())).rejects.toMatchObject({ status: 401 });
    expect(await db.recoveryRateBucket.count({ where: { userId: user.id } })).toBe(0);
  });
  it('does not recreate owned metadata behind an account already locked for deletion', async () => {
    const user = await seed(); let entered!: () => void, release!: () => void;
    const locked = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const deleting = db.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`; entered(); await gate; await tx.user.delete({ where: { id: user.id } }); });
    await locked; const admitting = replica.admitPassword(user.id, 'late-source');
    const rejected = expect(admitting).rejects.toMatchObject({ status: 401 });
    try {
      const until = Date.now() + 2000;
      let waiting = false;
      while (!waiting && Date.now() < until) {
        const [state] = await db.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND query LIKE '%FOR KEY SHARE%') AS waiting`;
        waiting = state.waiting; if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true); release(); await deleting; await rejected;
      expect(await db.recoveryRateBucket.count({ where: { userId: user.id } })).toBe(0);
    } finally { release(); await Promise.allSettled([deleting, admitting]); }
  });
  it('runs shared login and password deletion with one database connection', async () => {
    const user = await seed(), url = new URL(process.env.DATABASE_URL!); url.searchParams.set('connection_limit', '1');
    const single = new PrismaService({ datasourceUrl: url.toString() });
    try {
      await single.$connect(); const limiter = new AuthRateService(single, config, `${namespace}:single`);
      const singleAuth = new AuthService(single, app.get(EmailVerificationService), registration, limiter);
      const result = await singleAuth.login({ email: user.email, password }, 'single-source'); expect(result).toHaveProperty('accessToken');
      await expect(new AccountService(single, singleAuth).delete(user.id, password, 'single-source')).resolves.toEqual({ deleted: true });
    } finally { await single.$disconnect(); }
  });
  it('bounds password challenges across owners using source and global limits before allocating more owned buckets', async () => {
    const users = await Promise.all(Array.from({ length: 41 }, seed));
    for (const user of users.slice(0, 40)) await rates.admitPassword(user.id, 'same-source');
    await expect(replica.admitPassword(users[40].id, 'same-source')).rejects.toMatchObject({ status: 429 });
    expect(await db.recoveryRateBucket.count({ where: { userId: users[40].id } })).toBe(0);
    await db.recoveryRateBucket.update({ where: { key: `${namespace}:password:global` }, data: { count: 2000 } });
    await expect(replica.admitPassword(users[40].id, 'different-source')).rejects.toMatchObject({ status: 429 });
    expect((await db.recoveryRateBucket.findUniqueOrThrow({ where: { key: `${namespace}:password:global` } })).count).toBe(2001);
    expect(await db.recoveryRateBucket.count({ where: { userId: users[40].id } })).toBe(0);
  });
  it('rechecks the current credential after admission and keeps the account if it changed between phases', async () => {
    const user = await seed(), admit = auth.admitPassword.bind(auth);
    const changedHash = await hashPassword('replacement-password-123');
    const spy = jest.spyOn(auth, 'admitPassword').mockImplementation(async (...args) => {
      await admit(...args); await db.user.update({ where: { id: user.id }, data: { passwordHash: changedHash } });
    });
    await expect(account.delete(user.id, password, randomUUID())).rejects.toMatchObject({ status: 403 }); spy.mockRestore();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(changedHash);
    expect((await db.recoveryRateBucket.findFirstOrThrow({ where: { userId: user.id } })).count).toBe(1);
  });
  it('cleans expired owned and aggregate counters with delivery disabled while preserving active windows', async () => {
    const user = await seed(); await rates.admitPassword(user.id, 'cleanup-source');
    const active = await db.recoveryRateBucket.findFirstOrThrow({ where: { userId: user.id } });
    const old = `${namespace}:expired-owner`, aggregate = `${namespace}:expired-aggregate`;
    await db.recoveryRateBucket.createMany({ data: [
      { key: old, userId: user.id, count: 8, expiresAt: new Date(0) }, { key: aggregate, count: 2000, expiresAt: new Date(0) },
    ] });
    const worker = new RecoveryWorker(db, { mode: 'disabled' }, { send: jest.fn() }); await worker.runOnce();
    expect(await db.recoveryRateBucket.count({ where: { key: { in: [old, aggregate] } } })).toBe(0);
    expect(await db.recoveryRateBucket.findUnique({ where: { key: active.key } })).toEqual(active);
  });
});
