import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma.service';
import { RecoveryConfig } from '../src/auth-recovery/recovery-config';
import { RecoveryRateService } from '../src/auth-recovery/recovery-rate';
import { recoveryRecipientHash } from '../src/auth-recovery/recovery-secrets';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;
withDatabase('shared recovery quotas', () => {
  const namespace = `recovery-test-${randomUUID()}`, key = randomBytes(32);
  const config: RecoveryConfig = { mode: 'smtp', key, webOrigin: 'https://app.example.test',
    smtp: { host: 'smtp.example.test', port: 465, secure: true, user: 'synthetic', password: 'synthetic', from: 'mail@example.test' } };
  let db: PrismaService, first: RecoveryRateService, replica: RecoveryRateService;
  const email = (name: string) => `${namespace}-${name}@example.test`;
  beforeAll(async () => { db = new PrismaService(); await db.$connect(); first = new RecoveryRateService(db, config, namespace); replica = new RecoveryRateService(db, config, namespace); });
  afterEach(async () => { await db.recoveryRateBucket.deleteMany({ where: { key: { startsWith: `${namespace}:` } } }); });
  afterAll(async () => { await db.$disconnect(); });
  it('atomically shares recipient cooldown across concurrent replicas without an account lookup', async () => {
    const decisions = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? first : replica).record('request', `source-${i}`, email('not-registered'))));
    expect(decisions.filter(result => result.recipientAllowed)).toHaveLength(3);
    expect(decisions.filter(result => !result.recipientAllowed)).toHaveLength(3);
    expect(await db.user.count({ where: { email: email('not-registered') } })).toBe(0);
    const buckets = await db.recoveryRateBucket.findMany({ where: { recipientHash: recoveryRecipientHash(email('not-registered')) } });
    expect(buckets).toHaveLength(1); expect(buckets[0].count).toBe(6);
    expect(JSON.stringify(buckets)).not.toContain(email('not-registered'));
  });
  it('bounds source requests across different recipient addresses and retains rejected counts', async () => {
    for (let i = 0; i < 10; i++) await first.record('request', 'one-source', email(`recipient-${i}`));
    await expect(replica.record('request', 'one-source', email('over-limit'))).rejects.toMatchObject({ status: 429 });
    await expect(first.record('request', 'one-source', email('again'))).rejects.toMatchObject({ status: 429 });
    await expect(replica.record('request', 'other-source', email('over-limit'))).resolves.toEqual({ recipientAllowed: true });
  });
  it('keeps reset attempt limits independent of mail requests and shares them across service instances', async () => {
    for (let i = 0; i < 8; i++) await first.record('reset', 'reset-source', email('reset-owner'));
    await expect(replica.record('reset', 'other-source', email('reset-owner'))).rejects.toMatchObject({ status: 429 });
    await expect(replica.record('request', 'request-source', email('reset-owner'))).resolves.toEqual({ recipientAllowed: true });
  });
  it('reopens expired windows without accumulating a new bucket per request', async () => {
    for (let i = 0; i < 3; i++) await first.record('request', 'expired-source', email('expired'));
    await expect(replica.record('request', 'expired-source', email('expired'))).resolves.toEqual({ recipientAllowed: false });
    const oldCount = await db.recoveryRateBucket.count({ where: { key: { startsWith: `${namespace}:` } } });
    await db.recoveryRateBucket.updateMany({ where: { key: { startsWith: `${namespace}:` } }, data: { expiresAt: new Date(0) } });
    await expect(replica.record('request', 'expired-source', email('expired'))).resolves.toEqual({ recipientAllowed: true });
    expect(await db.recoveryRateBucket.count({ where: { key: { startsWith: `${namespace}:` } } })).toBe(oldCount);
  });
  it('enforces a shared global bound before creating more recipient buckets', async () => {
    await db.recoveryRateBucket.create({ data: { key: `${namespace}:request:global`, count: 2000, expiresAt: new Date(Date.now() + 60_000) } });
    await expect(replica.record('request', 'global-source', email('global'))).rejects.toMatchObject({ status: 429 });
    expect(await db.recoveryRateBucket.count({ where: { recipientHash: recoveryRecipientHash(email('global')) } })).toBe(0);
    expect((await db.recoveryRateBucket.findUniqueOrThrow({ where: { key: `${namespace}:request:global` } })).count).toBe(2001);
  });
  it('disabled delivery creates no rate metadata and exposes no configuration detail', async () => {
    await expect(new RecoveryRateService(db, { mode: 'disabled' }, namespace).record('request', 'disabled-source', email('disabled'))).rejects.toMatchObject({ status: 503 });
    expect(await db.recoveryRateBucket.count({ where: { key: { startsWith: `${namespace}:` } } })).toBe(0);
  });
});
