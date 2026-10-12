import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sessionSchema } from '@campusflow/contracts';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth';
import { AuthRateService } from '../src/auth-rate';
import { REGISTRATION_CONFIG, type RegistrationConfig } from '../src/auth-config';
import { RECOVERY_CONFIG, type RecoveryConfig } from '../src/auth-recovery/recovery-config';
import { RECOVERY_MAILER } from '../src/auth-recovery/recovery-mail';
import { RecoveryRateService } from '../src/auth-recovery/recovery-rate';
import { RecoveryService } from '../src/auth-recovery/recovery-service';
import { RecoveryWorker } from '../src/auth-recovery/recovery-worker';
import { createRecoveryCode, openRecoveryEnvelope, recoveryCodeHash, recoveryRecipientHash, sealRecoveryEnvelope, verificationCredentialHash, type RecoveryEnvelope } from '../src/auth-recovery/recovery-secrets';
import { EmailVerificationService } from '../src/email-verification';
import { hashPassword, verifyPassword } from '../src/password';
import * as passwords from '../src/password';
import { PrismaService } from '../src/prisma.service';

(process.env.DATABASE_URL ? describe : describe.skip)('mailbox verification with disposable PostgreSQL and captured mail', () => {
  const marker = `verify-${randomUUID()}`, namespace = `${marker}:quota`, password = 'account-password-123', changedPassword = 'changed-password-456';
  const registration: RegistrationConfig = { mode: 'verified' };
  const mail: RecoveryConfig = { mode: 'smtp', key: randomBytes(32), webOrigin: 'https://app.example.test',
    smtp: { host: 'smtp.example.test', port: 465, secure: true, user: 'fixture', password: 'fixture', from: 'mail@example.test' } };
  const send = jest.fn<Promise<void>, [string, RecoveryEnvelope, Date]>().mockResolvedValue(undefined);
  let app: INestApplication, db: PrismaService, auth: AuthService, verification: EmailVerificationService, recovery: RecoveryService, rates: RecoveryRateService, worker: RecoveryWorker;
  const emails = new Set<string>();
  const client = () => request(app.getHttpServer());
  const email = () => { const value = `${marker}-${randomUUID()}@example.test`; emails.add(value); return value; };
  const signup = (address: string) => client().post('/auth/register').send({ email: address, password, displayName: 'Verification student', timeZone: 'America/Edmonton' });
  const seed = async (verified = false) => db.user.create({ data: { email: email(), passwordHash: await hashPassword(password), displayName: 'Existing student', timeZone: 'UTC',
    emailVerifiedAt: verified ? new Date() : null, notificationPreference: { create: {} } } });
  const captured = (address: string, kind: 'verify' | 'code' = 'verify') => {
    const message = send.mock.calls.filter(([, value]) => value.email === address && value.kind === kind).at(-1)?.[1];
    if (!message || message.kind === 'changed') throw new Error('Expected captured verification or recovery mail'); return message.code;
  };
  const readyCode = async (user: { email: string }) => { await verification.request({ email: user.email, password }, randomUUID()); await worker.runOnce(); return captured(user.email); };
  const confirm = (address: string, code: string, currentPassword = password) => verification.confirm({ email: address, code, password: currentPassword }, randomUUID());
  async function waitForAccountLock() {
    const until = Date.now() + 2000;
    while (Date.now() < until) {
      const [state] = await db.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%"User"%') AS waiting`;
      if (state.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Expected a concurrent account operation to wait for the held lock');
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(REGISTRATION_CONFIG).useValue(registration)
      .overrideProvider(RECOVERY_CONFIG).useValue(mail).overrideProvider(RECOVERY_MAILER).useValue({ send })
      .overrideProvider(RecoveryRateService).useFactory({ factory: (prisma: PrismaService) => new RecoveryRateService(prisma, mail, namespace), inject: [PrismaService] })
      .overrideProvider(RecoveryWorker).useValue({}).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    db = app.get(PrismaService); auth = app.get(AuthService); verification = app.get(EmailVerificationService); recovery = app.get(RecoveryService); rates = app.get(RecoveryRateService);
    worker = new RecoveryWorker(db, mail, { send });
  });
  afterEach(async () => {
    registration.mode = 'verified'; jest.restoreAllMocks(); send.mockReset().mockResolvedValue(undefined);
    await db.recoveryMail.deleteMany({ where: { recipientHash: { in: [...emails].map(recoveryRecipientHash) } } });
    await db.user.deleteMany({ where: { email: { startsWith: marker } } });
    await db.recoveryRateBucket.deleteMany({ where: { key: { startsWith: namespace } } }); emails.clear();
  });
  afterAll(async () => { if (app) await app.close(); });

  it('advertises global uncached capability and creates an identity without an access session', async () => {
    await client().get('/auth/capability').expect(200, { registration: 'verified', verificationAvailable: true }).expect('Cache-Control', 'private, no-store');
    const address = email(); await signup(address).expect(201, { verificationRequired: true, codeRequested: true, expiresInMinutes: 15 }).expect('Cache-Control', 'private, no-store');
    const user = await db.user.findUniqueOrThrow({ where: { email: address } }); expect(user.emailVerifiedAt).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0); await client().get('/today').expect(401);
    const job = await db.recoveryMail.findFirstOrThrow({ where: { userId: user.id } });
    expect(job.kind).toBe('verify'); const plain = openRecoveryEnvelope(mail.key, job.id, job.sealed);
    expect(plain.kind).toBe('verify'); expect(JSON.stringify(job)).not.toContain(address); expect(JSON.stringify(job)).not.toContain(password);
    await worker.runOnce(); const code = captured(address);
    await client().post('/auth/verification/confirm').send({ email: address.toUpperCase(), password, code: code.match(/.{6}/g)!.join('-').toLowerCase() }).expect(200, { verified: true }).expect('Cache-Control', 'private, no-store');
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeInstanceOf(Date);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    const session = sessionSchema.parse(await auth.login({ email: address, password }, randomUUID()));
    await client().get('/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    await expect(confirm(address, code)).rejects.toMatchObject({ status: 400 });
  });
  it('preserves preview access without inventing verification, then rejects old sessions in public mode', async () => {
    registration.mode = 'preview'; const result = await signup(email()).expect(201), session = sessionSchema.parse(result.body);
    expect((await db.user.findUniqueOrThrow({ where: { id: session.user.id } })).emailVerifiedAt).toBeNull();
    expect(await db.recoveryMail.count({ where: { userId: session.user.id } })).toBe(0);
    await client().get('/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    registration.mode = 'verified'; await client().get('/me').set('Authorization', `Bearer ${session.accessToken}`).expect(401);
    const code = await readyCode(session.user); await confirm(session.user.email, code);
    await client().get('/me').set('Authorization', `Bearer ${session.accessToken}`).expect(401);
    expect(await db.session.count({ where: { userId: session.user.id, revokedAt: null } })).toBe(0);
  });
  it('offers verification for correct-password legacy login and keeps wrong-password responses generic', async () => {
    const user = await seed();
    await client().post('/auth/login').send({ email: user.email, password: 'wrong' }).expect(401);
    expect(await db.recoveryMail.count({ where: { userId: user.id } })).toBe(0);
    await client().post('/auth/login').send({ email: user.email, password }).expect(201, { verificationRequired: true, codeRequested: true, expiresInMinutes: 15 });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
  it('does not overwrite a pre-registered password or verify an unsolicited code without it', async () => {
    const user = await seed(), originalHash = user.passwordHash, code = await readyCode(user);
    await signup(user.email).expect(409);
    await expect(confirm(user.email, code, 'mailbox-owner-other-password')).rejects.toMatchObject({ status: 400 });
    await client().post('/auth/verification/confirm').send({ email: user.email, code }).expect(400);
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } }); expect(saved.passwordHash).toBe(originalHash); expect(saved.emailVerifiedAt).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
  it.each([{ code: '123456' }, { password: '' }, { userId: randomUUID() }, { emailVerifiedAt: new Date().toISOString() }])('rejects malformed or forged confirmation fields: %j', patch => client().post('/auth/verification/confirm').send({ email: email(), password, code: createRecoveryCode(), ...patch }).expect(400));
  it('requires the account password before a resend and serves only a private acknowledgment', async () => {
    const user = await seed();
    await client().post('/auth/verification/request').send({ email: user.email, password: 'wrong' }).expect(401);
    expect(await db.recoveryMail.count({ where: { userId: user.id } })).toBe(0);
    await client().post('/auth/verification/request').send({ email: user.email, password }).expect(202, { accepted: true }).expect('Cache-Control', 'private, no-store');
    await client().post('/auth/verification/request').send({ email: user.email, password, extra: true }).expect(400);
    expect(await db.recoveryMail.count({ where: { userId: user.id } })).toBe(1);
  });
  it('keeps recovery and verification code purposes isolated', async () => {
    const user = await seed(), code = await readyCode(user);
    await expect(recovery.reset({ email: user.email, code, newPassword: changedPassword }, randomUUID())).rejects.toMatchObject({ status: 400 });
    await recovery.request({ email: user.email }, randomUUID()); await worker.runOnce();
    await expect(confirm(user.email, captured(user.email, 'code'))).rejects.toMatchObject({ status: 400 });
    await expect(confirm(user.email, code)).resolves.toEqual({ verified: true });
  });
  it('rejects expired and cross-owner codes without consuming another owner’s valid token', async () => {
    const user = await seed(), other = await seed(), code = await readyCode(user), otherCode = await readyCode(other);
    await expect(confirm(other.email, code)).rejects.toMatchObject({ status: 400 });
    await db.emailVerificationToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    await expect(confirm(user.email, code)).rejects.toMatchObject({ status: 400 });
    await expect(confirm(other.email, otherCode)).resolves.toEqual({ verified: true });
  });
  it('allows exactly one concurrent redemption and creates no sessions', async () => {
    const user = await seed(), code = await readyCode(user);
    const results = await Promise.allSettled([confirm(user.email, code), confirm(user.email, code)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
  it('rolls back mailbox proof and token consumption when the atomic commit fails', async () => {
    const user = await seed(), code = await readyCode(user);
    const original = db.$transaction.bind(db);
    const commit = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(async tx => {
      const result = await work(tx); if (result === undefined) throw new Error('synthetic commit failure'); return result;
    })) as unknown as typeof db.$transaction);
    try { await expect(confirm(user.email, code)).rejects.toThrow('synthetic commit failure'); } finally { commit.mockRestore(); }
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
    await expect(confirm(user.email, code)).resolves.toEqual({ verified: true });
  });
  it('invalidates old verification material after recovery and preserves student data for the mailbox owner', async () => {
    const user = await seed(), verificationCode = await readyCode(user);
    const task = await db.personalTask.create({ data: { userId: user.id, title: 'Keep my coursework' } });
    await verification.request({ email: user.email, password }, randomUUID());
    await recovery.request({ email: user.email }, randomUUID()); await worker.runOnce();
    await recovery.reset({ email: user.email, code: captured(user.email, 'code'), newPassword: changedPassword }, randomUUID());
    expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.recoveryMail.count({ where: { userId: user.id, kind: 'verify' } })).toBe(0);
    await expect(confirm(user.email, verificationCode, changedPassword)).rejects.toMatchObject({ status: 400 });
    await expect(confirm(user.email, verificationCode, password)).rejects.toMatchObject({ status: 400 });
    await expect(auth.login({ email: user.email, password }, randomUUID())).rejects.toMatchObject({ status: 401 });
    await auth.login({ email: user.email, password: changedPassword }, randomUUID()); await worker.runOnce();
    await confirm(user.email, captured(user.email), changedPassword);
    const session = sessionSchema.parse(await auth.login({ email: user.email, password: changedPassword }, randomUUID()));
    const response = await client().get('/tasks').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    expect(response.body.some((record: { id: string }) => record.id === task.id)).toBe(true);
    const exported = await client().get('/me/export').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    for (const secret of ['credentialHash', 'emailVerificationTokens', verificationCode, user.passwordHash, session.accessToken]) expect(JSON.stringify(exported.body)).not.toContain(secret);
  });
  it('discards a delayed verification envelope bound to an old credential even if its user still exists', async () => {
    const user = await seed(); await verification.request({ email: user.email, password }, randomUUID());
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(changedPassword) } });
    await worker.runOnce(); expect(send).not.toHaveBeenCalled();
    expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
  });
  it('retries verification delivery with the same code, credential binding and original expiry', async () => {
    const user = await seed(); await verification.request({ email: user.email, password }, randomUUID());
    const job = await db.recoveryMail.findFirstOrThrow({ where: { userId: user.id } });
    send.mockRejectedValueOnce(new Error('synthetic provider unavailable')); await worker.runOnce();
    await db.recoveryMail.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    await worker.runOnce(); expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
    const token = await db.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(token.expiresAt).toEqual(job.expiresAt); expect(token.credentialHash).toBe(verificationCredentialHash(user.passwordHash));
  });
  it('rejects replayed mail after owner deletion and reuse of the address', async () => {
    const user = await seed(); await verification.request({ email: user.email, password }, randomUUID());
    const job = await db.recoveryMail.findFirstOrThrow({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    const replacement = await db.user.create({ data: { email: user.email, passwordHash: user.passwordHash, displayName: 'Replacement', timeZone: 'UTC' } });
    const id = randomUUID(), old = openRecoveryEnvelope(mail.key, job.id, job.sealed);
    await db.recoveryMail.create({ data: { id, recipientHash: job.recipientHash, kind: 'verify', sealed: sealRecoveryEnvelope(mail.key, id, old), expiresAt: job.expiresAt } });
    await worker.runOnce(); expect(send).not.toHaveBeenCalled();
    expect(await db.emailVerificationToken.count({ where: { userId: replacement.id } })).toBe(0);
  });
  it('keeps verified login working while public signup and delivery are closed', async () => {
    const user = await seed(true), unverified = await seed(), closed: RegistrationConfig = { mode: 'closed' };
    const disabledVerification = new EmailVerificationService(db, rates, { mode: 'disabled' }, closed);
    const closedAuth = new AuthService(db, disabledVerification, closed, new AuthRateService(db, { mode: 'local' }));
    await expect(closedAuth.register({ email: email(), password, displayName: 'Student', timeZone: 'UTC' })).rejects.toMatchObject({ status: 503 });
    const session = sessionSchema.parse(await closedAuth.login({ email: user.email, password }));
    await client().get('/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    await expect(closedAuth.login({ email: unverified.email, password })).rejects.toMatchObject({ status: 503 });
    await expect(disabledVerification.confirm({ email: user.email, password, code: createRecoveryCode() }, randomUUID())).rejects.toMatchObject({ status: 503 });
  });
  it('completes an unverified login with a single-connection database pool', async () => {
    const user = await seed(), url = new URL(process.env.DATABASE_URL!); url.searchParams.set('connection_limit', '1');
    const single = new PrismaService({ datasources: { db: { url: url.toString() } } });
    const singleRates = new RecoveryRateService(single, mail, namespace), service = new EmailVerificationService(single, singleRates, mail, registration);
    try {
      const result = await new AuthService(single, service, registration, new AuthRateService(single, { mode: 'local' })).login({ email: user.email, password }, randomUUID());
      expect(result).toEqual({ verificationRequired: true, codeRequested: true, expiresInMinutes: 15 });
      expect(await single.session.count({ where: { userId: user.id } })).toBe(0);
      expect(await single.recoveryMail.count({ where: { userId: user.id, kind: 'verify' } })).toBe(1);
    } finally { await single.$disconnect(); }
  });
  it('rolls back signup and preferences if the encrypted outbox transaction cannot commit', async () => {
    const address = email(), original = db.$transaction.bind(db);
    const commit = jest.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => original(async tx => {
      const result = await work(tx); if (result && typeof result === 'object' && 'verificationRequired' in result) throw new Error('synthetic signup commit failure'); return result;
    })) as unknown as typeof db.$transaction);
    try { await expect(auth.register({ email: address, password, displayName: 'Student', timeZone: 'UTC' }, randomUUID())).rejects.toThrow('synthetic signup commit failure'); }
    finally { commit.mockRestore(); }
    expect(await db.user.findUnique({ where: { email: address } })).toBeNull();
    expect(await db.recoveryMail.count({ where: { recipientHash: recoveryRecipientHash(address) } })).toBe(0);
  });
  it('prevents an in-flight verification delivery from restoring reset credentials', async () => {
    const user = await seed(); await verification.request({ email: user.email, password }, randomUUID());
    let entered!: () => void, release!: () => void; const arrived = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
    let code = '';
    const delivering = new RecoveryWorker(db, mail, { send: async (_id, envelope) => { if (envelope.kind === 'verify') { code = envelope.code; entered(); await hold; } } }).runOnce();
    await arrived;
    try {
      const resetCode = createRecoveryCode(); await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: recoveryCodeHash(resetCode), expiresAt: new Date(Date.now() + 60_000) } });
      await recovery.reset({ email: user.email, code: resetCode, newPassword: changedPassword }, randomUUID());
      await expect(confirm(user.email, code, changedPassword)).rejects.toMatchObject({ status: 400 });
    } finally { release(); await delivering; }
    expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
  });
  it('cleans expired verification tokens while delivery is disabled and preserves live tokens', async () => {
    const user = await seed(), credentialHash = verificationCredentialHash(user.passwordHash);
    await db.emailVerificationToken.createMany({ data: [
      { userId: user.id, credentialHash, tokenHash: recoveryCodeHash(createRecoveryCode()), expiresAt: new Date(0) },
      { userId: user.id, credentialHash, tokenHash: recoveryCodeHash(createRecoveryCode()), expiresAt: new Date(Date.now() + 60_000) },
    ] });
    await new RecoveryWorker(db, { mode: 'disabled' }, { send }).runOnce();
    expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(1); expect(send).not.toHaveBeenCalled();
  });
  it('issues a fresh session only after a verification holding the account lock has committed', async () => {
    const user = await seed(), code = await readyCode(user);
    let entered!: () => void, release!: () => void; const arrived = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
    const original = passwords.verifyPassword; let first = true;
    const spy = jest.spyOn(passwords, 'verifyPassword').mockImplementation(async (...args) => {
      const valid = await original(...args); if (first) { first = false; entered(); await hold; } return valid;
    });
    const verifying = confirm(user.email, code); await arrived;
    const loggingIn = auth.login({ email: user.email, password }, randomUUID());
    let result;
    try { await waitForAccountLock(); }
    finally { release(); const values = await Promise.all([verifying, loggingIn]); result = values[1]; spy.mockRestore(); }
    const session = sessionSchema.parse(result);
    await client().get('/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
  });
  it('bounds resends across replicas and rejects repeated redemption attempts even with forged forwarding headers', async () => {
    const user = await seed();
    for (let i = 0; i < 4; i++) await verification.request({ email: user.email, password }, randomUUID());
    expect(await db.recoveryMail.count({ where: { userId: user.id } })).toBe(3);
    const replicaRates = new RecoveryRateService(db, mail, namespace), replica = new EmailVerificationService(db, replicaRates, mail, registration);
    await replica.request({ email: user.email, password }, randomUUID()); expect(await db.recoveryMail.count({ where: { userId: user.id } })).toBe(3);
    for (let i = 0; i < 8; i++) await client().post('/auth/verification/confirm').set('X-Forwarded-For', `203.0.113.${i}`).send({ email: user.email, password, code: createRecoveryCode() }).expect(400);
    await client().post('/auth/verification/confirm').send({ email: user.email, password, code: createRecoveryCode() }).expect(429);
    expect(await verifyPassword(password, (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).toBe(true);
  });
  it('serializes verification behind a held credential update and rejects its stale password/code', async () => {
    const user = await seed(), code = await readyCode(user);
    let release!: () => void, entered!: () => void; const held = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const updating = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(changedPassword) } }); entered(); await hold;
    }, { timeout: 5000 });
    await held; const confirming = confirm(user.email, code); const failed = expect(confirming).rejects.toMatchObject({ status: 400 });
    try {
      await waitForAccountLock();
    } finally { release(); await updating; await failed; }
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
  });
  it('keeps the User locked through password confirmation and verification commit', async () => {
    const user = await seed(), code = await readyCode(user);
    let entered!: () => void, release!: () => void; const arrived = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
    const original = passwords.verifyPassword, spy = jest.spyOn(passwords, 'verifyPassword').mockImplementation(async (...args) => { const valid = await original(...args); entered(); await hold; return valid; });
    const confirming = confirm(user.email, code); await arrived;
    const deleting = db.user.delete({ where: { id: user.id } }).then(result => result);
    try { await waitForAccountLock(); }
    finally { release(); await Promise.all([confirming, deleting]); spy.mockRestore(); }
    expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
  });
});
