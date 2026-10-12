import { INestApplication, Logger } from '@nestjs/common';
import { sessionSchema } from '@campusflow/contracts';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth';
import { AccountService } from '../src/account';
import { RECOVERY_CONFIG, type RecoveryConfig } from '../src/auth-recovery/recovery-config';
import { RECOVERY_MAILER, type RecoveryMailer } from '../src/auth-recovery/recovery-mail';
import { RecoveryRateService } from '../src/auth-recovery/recovery-rate';
import { RecoveryService } from '../src/auth-recovery/recovery-service';
import { RecoveryWorker } from '../src/auth-recovery/recovery-worker';
import { createRecoveryCode, openRecoveryEnvelope, recoveryCodeHash, recoveryRecipientHash, sealRecoveryEnvelope, type RecoveryEnvelope } from '../src/auth-recovery/recovery-secrets';
import { verifyPassword } from '../src/password';
import * as passwords from '../src/password';
import { PrismaService } from '../src/prisma.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;
withDatabase('password recovery with disposable PostgreSQL owners and captured delivery', () => {
  const marker = `recovery-${randomUUID()}`, namespace = `${marker}:quota`, oldPassword = 'previous-test-password-123', newPassword = 'new-test-password-456';
  const config: RecoveryConfig = { mode: 'smtp', key: randomBytes(32), webOrigin: 'https://app.example.test',
    smtp: { host: 'smtp.example.test', port: 465, secure: true, user: 'synthetic', password: 'synthetic', from: 'mail@example.test' } };
  let app: INestApplication, db: PrismaService, recovery: RecoveryService, auth: AuthService, worker: RecoveryWorker, account: AccountService;
  const send = jest.fn<Promise<void>, [string, RecoveryEnvelope, Date]>().mockResolvedValue(undefined);
  const mailer: RecoveryMailer = { send };
  const emails = new Set<string>();
  const client = () => request(app.getHttpServer());
  const email = () => { const address = `${marker}-${randomUUID()}@example.test`; emails.add(address); return address; };
  const register = async () => (await client().post('/auth/register').send({ email: email(), password: oldPassword,
    displayName: 'Recovery student', timeZone: 'America/Edmonton' }).expect(201)).body as { accessToken: string; user: { id: string; email: string } };
  const bearer = (owner: { accessToken: string }) => `Bearer ${owner.accessToken}`;
  const requestCode = (address: string) => recovery.request({ email: address }, randomUUID());
  const deliveredCode = (address: string) => {
    const envelope = send.mock.calls.find(([, message]) => message.kind === 'code' && message.email === address)?.[1];
    if (!envelope || envelope.kind !== 'code') throw new Error('Expected captured code'); return envelope.code;
  };
  const readyCode = async (owner: { user: { email: string } }) => { await requestCode(owner.user.email); await worker.runOnce(); return deliveredCode(owner.user.email); };
  const redeem = (address: string, code: string, password = newPassword) => recovery.reset({ email: address, code, newPassword: password }, randomUUID());
  const makeWorker = (port: RecoveryMailer = mailer) => new RecoveryWorker(db, config, port);
  async function waitForAccountLock() {
    const until = Date.now() + 2000;
    while (Date.now() < until) {
      const [state] = await db.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
          AND query LIKE '%FROM "User" WHERE "email"%') AS waiting`;
      if (state.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Expected a concurrent account operation to wait for the held lock');
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RECOVERY_CONFIG).useValue(config)
      .overrideProvider(RECOVERY_MAILER).useValue(mailer).overrideProvider(RecoveryRateService)
      .useFactory({ factory: (prisma: PrismaService) => new RecoveryRateService(prisma, config, namespace), inject: [PrismaService] })
      // Delivery is explicitly stepped here; separate tests cover lifecycle polling.
      .overrideProvider(RecoveryWorker).useValue({}).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); recovery = app.get(RecoveryService); auth = app.get(AuthService); account = app.get(AccountService); worker = makeWorker();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    send.mockReset().mockResolvedValue(undefined);
    await db.recoveryMail.deleteMany({ where: { recipientHash: { in: [...emails].map(recoveryRecipientHash) } } });
    await db.user.deleteMany({ where: { email: { startsWith: marker } } });
    await db.recoveryRateBucket.deleteMany({ where: { key: { startsWith: namespace } } });
    emails.clear();
  });
  afterAll(async () => { jest.restoreAllMocks(); if (app) await app.close(); });

  it('advertises only global availability and serves private uncached acknowledgments', async () => {
    await client().get('/auth/recovery/capability').expect(200, { available: true, expiresInMinutes: 15 }).expect('Cache-Control', 'private, no-store');
    await client().post('/auth/recovery/request').send({ email: email() }).expect(202, { accepted: true }).expect('Cache-Control', 'private, no-store');
  });
  it.each([{ email: 'invalid' }, { email: 'student@example.test', extra: true }, { email: ' '.repeat(321) }, {}])('rejects malformed requests without creating private recovery records: %j', async input => {
    const count = await db.recoveryMail.count(); await client().post('/auth/recovery/request').send(input).expect(400);
    expect(await db.recoveryMail.count()).toBe(count);
  });
  it('enqueues equivalent encrypted work for registered and absent addresses without an account lookup', async () => {
    const owner = await register(), absent = email();
    const lookup = jest.spyOn(db.user, 'findUnique');
    try {
      await expect(requestCode(owner.user.email)).resolves.toEqual({ accepted: true });
      await expect(requestCode(absent)).resolves.toEqual({ accepted: true });
      expect(lookup).not.toHaveBeenCalled();
    } finally { lookup.mockRestore(); }
    const jobs = await db.recoveryMail.findMany({ where: { recipientHash: { in: [owner.user.email, absent].map(recoveryRecipientHash) } } });
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.userId).toBeNull(); expect(job.kind).toBe('code');
      expect(job.expiresAt.getTime() - job.createdAt.getTime()).toBeGreaterThan(14 * 60_000);
      expect(job.expiresAt.getTime() - job.createdAt.getTime()).toBeLessThanOrEqual(15 * 60_000 + 1000);
      const envelope = openRecoveryEnvelope(config.key, job.id, job.sealed);
      expect(JSON.stringify(job)).not.toContain(envelope.email);
      if (envelope.kind === 'code') expect(JSON.stringify(job)).not.toContain(envelope.code);
    }
    expect(await db.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(0);
    await worker.runOnce();
    expect(send).toHaveBeenCalledTimes(1); expect(deliveredCode(owner.user.email)).toMatch(/^[0-9A-F]{30}$/);
    expect(await db.recoveryMail.count({ where: { id: { in: jobs.map(job => job.id) } } })).toBe(0);
  });
  it('keeps recipient cooldown acknowledgment generic and ordinary sign-in available', async () => {
    const owner = await register();
    for (let i = 0; i < 5; i++) await expect(requestCode(owner.user.email)).resolves.toEqual({ accepted: true });
    expect(await db.recoveryMail.count({ where: { recipientHash: recoveryRecipientHash(owner.user.email) } })).toBe(3);
    await client().post('/auth/login').send({ email: owner.user.email, password: oldPassword }).expect(201);
  });
  it('ignores forged forwarded addresses when enforcing the actual peer quota', async () => {
    for (let i = 0; i < 10; i++) await client().post('/auth/recovery/request').set('X-Forwarded-For', `198.51.100.${i}`).send({ email: email() }).expect(202);
    await client().post('/auth/recovery/request').set('X-Forwarded-For', '203.0.113.70').send({ email: email() }).expect(429);
  });
  it('resets once, invalidates all other codes and sessions, preserves student data and queues a private notice', async () => {
    const owner = await register(), other = await register();
    const secondSession = sessionSchema.parse(await auth.login({ email: owner.user.email, password: oldPassword }));
    const task = await client().post('/tasks').set('Authorization', bearer(owner)).send({ title: 'Retained assignment', priority: 'medium' }).expect(201);
    const code = await readyCode(owner); await requestCode(owner.user.email);
    const pending = await db.recoveryMail.findFirstOrThrow({ where: { recipientHash: recoveryRecipientHash(owner.user.email) } });
    await db.passwordResetToken.create({ data: { userId: owner.user.id, tokenHash: recoveryCodeHash(createRecoveryCode()), expiresAt: pending.expiresAt } });
    const response = await client().post('/auth/recovery/reset').send({ email: owner.user.email, code: code.match(/.{6}/g)!.join('-').toLowerCase(), newPassword }).expect(200, { reset: true });
    expect(response.headers['cache-control']).toBe('private, no-store');
    for (const token of [owner.accessToken, secondSession.accessToken]) await client().get('/me').set('Authorization', `Bearer ${token}`).expect(401);
    await client().get('/me').set('Authorization', bearer(other)).expect(200);
    await client().post('/auth/login').send({ email: owner.user.email, password: oldPassword }).expect(401);
    const fresh = await client().post('/auth/login').send({ email: owner.user.email, password: newPassword }).expect(201);
    await client().get('/tasks').set('Authorization', `Bearer ${fresh.body.accessToken}`).expect(200).then(result => expect(result.body.some((row: { id: string }) => row.id === task.body.id)).toBe(true));
    await expect(redeem(owner.user.email, code)).rejects.toMatchObject({ status: 400 });
    expect(await db.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(0);
    const jobs = await db.recoveryMail.findMany({ where: { recipientHash: recoveryRecipientHash(owner.user.email) } });
    expect(jobs).toHaveLength(1); expect(jobs[0].kind).toBe('changed');
    const notice = openRecoveryEnvelope(config.key, jobs[0].id, jobs[0].sealed);
    expect(notice).toEqual({ kind: 'changed', email: owner.user.email });
    expect(JSON.stringify(jobs)).not.toContain(newPassword); expect(JSON.stringify(jobs)).not.toContain(code);
    await worker.runOnce(); expect(send.mock.calls.some(([, value]) => value.kind === 'changed')).toBe(true);
  });
  it('rejects wrong, expired and other-account codes without changing passwords or sessions', async () => {
    const owner = await register(), other = await register(), code = await readyCode(owner);
    await expect(redeem(owner.user.email, createRecoveryCode())).rejects.toMatchObject({ status: 400 });
    await expect(redeem(other.user.email, code)).rejects.toMatchObject({ status: 400 });
    await db.passwordResetToken.updateMany({ where: { userId: owner.user.id }, data: { expiresAt: new Date(0) } });
    await expect(redeem(owner.user.email, code)).rejects.toMatchObject({ status: 400 });
    await client().get('/me').set('Authorization', bearer(owner)).expect(200);
    expect(await verifyPassword(oldPassword, (await db.user.findUniqueOrThrow({ where: { id: owner.user.id } })).passwordHash)).toBe(true);
  });
  it.each([{ code: 'short', newPassword }, { code: 'A'.repeat(30), newPassword: 'short' }, { code: 'A'.repeat(30), newPassword, extra: true }])('rejects malformed reset bodies without consuming a valid code: %j', async value => {
    const owner = await register(); await readyCode(owner);
    await client().post('/auth/recovery/reset').send({ email: owner.user.email, ...value }).expect(400);
    expect(await db.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(1);
  });
  it('allows exactly one winner when the same code is redeemed concurrently', async () => {
    const owner = await register(), code = await readyCode(owner);
    const results = await Promise.allSettled([redeem(owner.user.email, code), redeem(owner.user.email, code, 'different-password-789')]);
    expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(value => value.status === 'rejected'); expect(failed && failed.status === 'rejected' && failed.reason.status).toBe(400);
    expect(await db.recoveryMail.count({ where: { userId: owner.user.id, kind: 'changed' } })).toBe(1);
    await client().get('/me').set('Authorization', bearer(owner)).expect(401);
  });
  it('rolls back the password, revoked sessions, consumed token and notice when commit fails', async () => {
    const owner = await register(), code = await readyCode(owner);
    const before = await db.user.findUniqueOrThrow({ where: { id: owner.user.id } });
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(async tx => {
      const result = await work(tx);
      // Rate decisions return an object; reset's complete transaction returns void.
      if (result === undefined) throw new Error('Synthetic commit failure'); return result;
    })) as unknown as typeof db.$transaction);
    try { await expect(redeem(owner.user.email, code)).rejects.toThrow('Synthetic commit failure'); }
    finally { spy.mockRestore(); }
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.user.id } })).passwordHash).toBe(before.passwordHash);
    expect(await db.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(1);
    await client().get('/me').set('Authorization', bearer(owner)).expect(200);
    expect(await db.recoveryMail.count({ where: { userId: owner.user.id, kind: 'changed' } })).toBe(0);
  });
  it('revokes the session of an old-password sign-in already holding the account lock when reset begins', async () => {
    const owner = await register(), code = await readyCode(owner);
    let entered!: () => void, release!: () => void;
    const verified = new Promise<void>(resolve => { entered = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const verify = passwords.verifyPassword;
    const spy = jest.spyOn(passwords, 'verifyPassword').mockImplementation(async (...args) => {
      const valid = await verify(...args); entered(); await pause; return valid;
    });
    const signingIn = auth.login({ email: owner.user.email, password: oldPassword }); await verified;
    const resetting = redeem(owner.user.email, code);
    try {
      await waitForAccountLock();
      release(); const [session] = await Promise.all([signingIn, resetting]);
      await client().get('/me').set('Authorization', `Bearer ${sessionSchema.parse(session).accessToken}`).expect(401);
      expect(await db.session.count({ where: { userId: owner.user.id, revokedAt: null } })).toBe(0);
    } finally { release(); spy.mockRestore(); await Promise.allSettled([signingIn, resetting]); }
  });
  it('rejects old-password sign-in waiting behind a reset and accepts the newly saved password', async () => {
    const owner = await register(), code = await readyCode(owner);
    let entered!: () => void, release!: () => void;
    const written = new Promise<void>(resolve => { entered = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(async tx => {
      const result = await work(tx); if (result === undefined) { entered(); await pause; } return result;
    })) as unknown as typeof db.$transaction);
    const resetting = redeem(owner.user.email, code); await written;
    const signingIn = auth.login({ email: owner.user.email, password: oldPassword });
    const rejected = expect(signingIn).rejects.toMatchObject({ status: 401 });
    try { await waitForAccountLock(); release(); await resetting; await rejected; }
    finally { release(); spy.mockRestore(); await Promise.allSettled([signingIn, resetting]); }
    await client().post('/auth/login').send({ email: owner.user.email, password: newPassword }).expect(201);
  });
  it('retries the same encrypted code and original expiry after delivery failure and worker restart', async () => {
    const owner = await register(); await requestCode(owner.user.email);
    const original = await db.recoveryMail.findFirstOrThrow({ where: { recipientHash: recoveryRecipientHash(owner.user.email) } });
    send.mockRejectedValueOnce(new Error(`Synthetic provider error ${owner.user.email}`)); await worker.runOnce();
    const retry = await db.recoveryMail.findUniqueOrThrow({ where: { id: original.id } });
    expect(retry.sealed).toBe(original.sealed); expect(retry.expiresAt).toEqual(original.expiresAt); expect(retry.leaseToken).toBeNull(); expect(retry.attempts).toBe(1);
    expect(retry.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await db.recoveryMail.update({ where: { id: retry.id }, data: { nextAttemptAt: new Date(0) } });
    await makeWorker().runOnce(); expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(await db.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(1);
    expect(await db.recoveryMail.findUnique({ where: { id: original.id } })).toBeNull();
  });
  it('does not send expired, tampered, mismatched or absent-owner messages', async () => {
    const owner = await register(); await requestCode(owner.user.email); await requestCode(email());
    const id = randomUUID();
    await db.recoveryMail.create({ data: { id, recipientHash: recoveryRecipientHash(owner.user.email), kind: 'changed', expiresAt: new Date(Date.now() + 60_000),
      sealed: sealRecoveryEnvelope(config.key, id, { kind: 'code', email: owner.user.email, code: createRecoveryCode() }) } });
    const jobs = await db.recoveryMail.findMany({ where: { recipientHash: recoveryRecipientHash(owner.user.email), kind: 'code' } });
    await db.recoveryMail.update({ where: { id: jobs[0].id }, data: { sealed: 'v1.invalid', expiresAt: new Date(Date.now() + 60_000) } });
    await requestCode(owner.user.email);
    await db.recoveryMail.updateMany({ where: { recipientHash: recoveryRecipientHash(owner.user.email), kind: 'code', sealed: { not: 'v1.invalid' } }, data: { expiresAt: new Date(0) } });
    await worker.runOnce(); expect(send).not.toHaveBeenCalled();
    expect(await db.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(0);
    expect(await db.recoveryMail.count({ where: { recipientHash: { in: [...emails].map(recoveryRecipientHash) } } })).toBe(0);
  });
  it('holds no account lock during SMTP and leaves an in-flight old code unusable after reset', async () => {
    const owner = await register(); await requestCode(owner.user.email);
    let entered!: () => void, release!: () => void;
    const enteredSend = new Promise<void>(resolve => { entered = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const port: RecoveryMailer = { send: jest.fn(async (_id, message) => { if (message.kind === 'code') { entered(); await pause; } }) };
    const running = makeWorker(port).runOnce(); await enteredSend;
    try {
      const token = await db.passwordResetToken.findFirstOrThrow({ where: { userId: owner.user.id } });
      const job = await db.recoveryMail.findFirstOrThrow({ where: { userId: owner.user.id } });
      const envelope = openRecoveryEnvelope(config.key, job.id, job.sealed); if (envelope.kind !== 'code') throw new Error('Expected code');
      expect(recoveryCodeHash(envelope.code)).toBe(token.tokenHash);
      await expect(redeem(owner.user.email, envelope.code)).resolves.toEqual({ reset: true });
      await expect(redeem(owner.user.email, envelope.code)).rejects.toMatchObject({ status: 400 });
    } finally { release(); await running; }
  });
  it('leases one message to one replica while another worker runs', async () => {
    const owner = await register(); await requestCode(owner.user.email);
    let entered!: () => void, release!: () => void;
    const enteredSend = new Promise<void>(resolve => { entered = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const port: RecoveryMailer = { send: jest.fn(async () => { entered(); await pause; }) };
    const first = makeWorker(port).runOnce(); await enteredSend;
    try { await makeWorker(port).runOnce(); expect(port.send).toHaveBeenCalledTimes(1); }
    finally { release(); await first; }
  });
  it('fences a stale sender acknowledgment after an expired lease is reclaimed', async () => {
    const owner = await register(); await requestCode(owner.user.email);
    let enterFirst!: () => void, enterSecond!: () => void, releaseFirst!: () => void, releaseSecond!: () => void;
    const seenFirst = new Promise<void>(resolve => { enterFirst = resolve; }), seenSecond = new Promise<void>(resolve => { enterSecond = resolve; });
    const pausedFirst = new Promise<void>(resolve => { releaseFirst = resolve; }), pausedSecond = new Promise<void>(resolve => { releaseSecond = resolve; });
    const first = makeWorker({ send: async () => { enterFirst(); await pausedFirst; } }).runOnce(); await seenFirst;
    const job = await db.recoveryMail.findFirstOrThrow({ where: { userId: owner.user.id } });
    await db.recoveryMail.update({ where: { id: job.id }, data: { leaseUntil: new Date(0) } });
    const second = makeWorker({ send: async () => { enterSecond(); await pausedSecond; } }).runOnce(); await seenSecond;
    try {
      const fresh = await db.recoveryMail.findUniqueOrThrow({ where: { id: job.id } }); expect(fresh.leaseToken).not.toBe(job.leaseToken);
      releaseFirst(); await first;
      expect((await db.recoveryMail.findUniqueOrThrow({ where: { id: job.id } })).leaseToken).toBe(fresh.leaseToken);
    } finally { releaseFirst(); releaseSecond(); await Promise.all([first, second]); }
    expect(await db.recoveryMail.findUnique({ where: { id: job.id } })).toBeNull();
  });
  it('cleans exhausted and expired jobs and token/quota metadata even with sending disabled', async () => {
    const owner = await register(); await readyCode(owner); await requestCode(owner.user.email);
    await db.recoveryMail.updateMany({ where: { userId: null, recipientHash: recoveryRecipientHash(owner.user.email) }, data: { attempts: 8 } });
    await db.passwordResetToken.updateMany({ where: { userId: owner.user.id }, data: { expiresAt: new Date(0) } });
    await db.recoveryRateBucket.updateMany({ where: { key: { startsWith: namespace } }, data: { expiresAt: new Date(0) } });
    await new RecoveryWorker(db, { mode: 'disabled' }, mailer).runOnce();
    expect(await db.recoveryMail.count({ where: { recipientHash: recoveryRecipientHash(owner.user.email) } })).toBe(0);
    expect(await db.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(0);
    expect(await db.recoveryRateBucket.count({ where: { key: { startsWith: namespace } } })).toBe(0);
  });
  it('uses UTC quota, claim and lease times even when a database connection runs in Auckland time', async () => {
    const owner = await register(), url = new URL(process.env.DATABASE_URL!); url.searchParams.set('connection_limit', '1');
    const zoned = new PrismaService({ datasources: { db: { url: url.href } } });
    try {
      await zoned.$connect(); await zoned.$executeRawUnsafe("SET TIME ZONE 'Pacific/Auckland'");
      const rates = new RecoveryRateService(zoned, config, namespace), service = new RecoveryService(zoned, rates, config);
      await service.request({ email: owner.user.email }, 'zoned-source');
      const buckets = await zoned.recoveryRateBucket.findMany({ where: { key: { startsWith: namespace } } });
      const expiryDeltas = buckets.map(bucket => bucket.expiresAt.getTime() - Date.now());
      expect(expiryDeltas.every(value => value > 14 * 60_000 && value <= 60 * 60_000 + 1000)).toBe(true);
      await new RecoveryWorker(zoned, config, mailer).runOnce(); expect(deliveredCode(owner.user.email)).toMatch(/^[0-9A-F]{30}$/);
      expect(await zoned.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(1);
      await zoned.passwordResetToken.updateMany({ where: { userId: owner.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await new RecoveryWorker(zoned, { mode: 'disabled' }, mailer).runOnce();
      expect(await zoned.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(0);
    } finally { await zoned.$disconnect(); }
  });
  it('keeps the last active attempt leased during another replica cleanup, then stops after a final failure', async () => {
    const owner = await register(); await requestCode(owner.user.email);
    const job = await db.recoveryMail.findFirstOrThrow({ where: { recipientHash: recoveryRecipientHash(owner.user.email) } });
    await db.recoveryMail.update({ where: { id: job.id }, data: { attempts: 7 } });
    let entered!: () => void, release!: () => void;
    const inFlight = new Promise<void>(resolve => { entered = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const port: RecoveryMailer = { send: async () => { entered(); await pause; throw new Error('Synthetic unavailable delivery'); } };
    const running = makeWorker(port).runOnce(); await inFlight;
    try {
      await makeWorker().runOnce();
      expect((await db.recoveryMail.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(8);
    } finally { release(); await running; }
    expect(await db.recoveryMail.findUnique({ where: { id: job.id } })).toBeNull();
  });
  it('continues delivery while expired cleanup rows are locked by another transaction', async () => {
    const owner = await register(); await requestCode(owner.user.email);
    const id = randomUUID(), expiredCode = createRecoveryCode(), key = `${namespace}:expired-locked`;
    await db.recoveryMail.create({ data: { id, recipientHash: recoveryRecipientHash(owner.user.email), kind: 'code', expiresAt: new Date(0),
      sealed: sealRecoveryEnvelope(config.key, id, { kind: 'code', email: owner.user.email, code: expiredCode }) } });
    const token = await db.passwordResetToken.create({ data: { userId: owner.user.id, tokenHash: recoveryCodeHash(expiredCode), expiresAt: new Date(0) } });
    await db.recoveryRateBucket.create({ data: { key, count: 1, expiresAt: new Date(0) } });
    let entered!: () => void, release!: () => void, timeout: ReturnType<typeof setTimeout> | undefined;
    const locked = new Promise<void>(resolve => { entered = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const holding = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "RecoveryMail" WHERE "id" = ${id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "PasswordResetToken" WHERE "id" = ${token.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "key" FROM "RecoveryRateBucket" WHERE "key" = ${key} FOR UPDATE`;
      entered(); await pause;
    });
    await locked; const processing = makeWorker().runOnce();
    try {
      const result = await Promise.race([processing.then(() => 'processed'), new Promise<string>(resolve => { timeout = setTimeout(() => resolve('blocked'), 1000); })]);
      expect(result).toBe('processed'); expect(send).toHaveBeenCalledTimes(1);
      expect(await db.recoveryMail.findUnique({ where: { id } })).not.toBeNull();
    } finally { if (timeout) clearTimeout(timeout); release(); await Promise.allSettled([holding, processing]); }
    await makeWorker().runOnce(); expect(await db.recoveryMail.findUnique({ where: { id } })).toBeNull();
    expect(await db.passwordResetToken.findUnique({ where: { id: token.id } })).toBeNull();
    expect(await db.recoveryRateBucket.findUnique({ where: { key } })).toBeNull();
  });
  it('waits for in-flight delivery at shutdown and leaves the next queued message for restart', async () => {
    const owner = await register(); await requestCode(owner.user.email); await requestCode(owner.user.email);
    let entered!: () => void, release!: () => void;
    const inFlight = new Promise<void>(resolve => { entered = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const port: RecoveryMailer = { send: jest.fn(async () => { entered(); await pause; }) }, active = makeWorker(port);
    const running = active.runOnce(); await inFlight;
    let closed = false; const shutdown = active.onModuleDestroy().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    release(); await Promise.all([running, shutdown]); expect(port.send).toHaveBeenCalledTimes(1);
    expect(await db.recoveryMail.count({ where: { recipientHash: recoveryRecipientHash(owner.user.email) } })).toBe(1);
    await makeWorker().runOnce(); expect(send).toHaveBeenCalledTimes(1);
  });
  it('removes pending recovery before account deletion and never recreates a token for that owner', async () => {
    const owner = await register(); await requestCode(owner.user.email);
    await client().delete('/me').set('Authorization', bearer(owner)).send({ currentPassword: oldPassword, confirmation: 'DELETE' }).expect(200);
    await worker.runOnce(); expect(send).not.toHaveBeenCalled();
    expect(await db.passwordResetToken.count({ where: { userId: owner.user.id } })).toBe(0);
    await requestCode(owner.user.email); await worker.runOnce(); expect(send).not.toHaveBeenCalled();
  });
  it('cannot redeem an in-flight delivered code after the account is deleted', async () => {
    const owner = await register(); await requestCode(owner.user.email);
    let entered!: () => void, release!: () => void, captured = '';
    const enteredSend = new Promise<void>(resolve => { entered = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const running = makeWorker({ send: async (_id, envelope) => { if (envelope.kind === 'code') captured = envelope.code; entered(); await pause; } }).runOnce(); await enteredSend;
    try {
      await account.delete(owner.user.id, oldPassword);
      await expect(redeem(owner.user.email, captured)).rejects.toMatchObject({ status: 400 });
    } finally { release(); await running; }
    expect(await db.user.findUnique({ where: { id: owner.user.id } })).toBeNull();
  });
});
