import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { RecoveryMail } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { RECOVERY_CONFIG, type RecoveryConfig } from './recovery-config';
import { RECOVERY_MAILER, type RecoveryMailer } from './recovery-mail';
import { openRecoveryEnvelope, recoveryCodeHash, recoveryRecipientHash, type RecoveryEnvelope } from './recovery-secrets';

const leaseMs = 120_000, maxAttempts = 8;
@Injectable()
export class RecoveryWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RecoveryWorker.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopping = false;
  private lastWarning = 0;
  constructor(private readonly prisma: PrismaService, @Inject(RECOVERY_CONFIG) private readonly config: RecoveryConfig,
    @Inject(RECOVERY_MAILER) private readonly mailer: RecoveryMailer) {}
  onApplicationBootstrap() { this.schedule(); }
  private schedule() {
    if (this.stopping) return;
    this.timer = setTimeout(() => { void this.runOnce().catch(() => this.warn()).finally(() => this.schedule()); }, this.config.mode === 'smtp' ? 2000 : 60_000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopping = true; if (this.timer) clearTimeout(this.timer); await this.running?.catch(() => this.warn());
  }
  runOnce(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (!this.running) this.running = this.process().finally(() => { this.running = undefined; });
    return this.running;
  }
  private warn() {
    if (Date.now() - this.lastWarning < 60_000) return;
    this.lastWarning = Date.now(); this.logger.warn('Password recovery processing is delayed.');
  }
  private async cleanup() {
    // Bounded cleanup also runs while delivery is disabled; no private key is needed.
    await this.prisma.$executeRaw`DELETE FROM "RecoveryMail" WHERE "id" IN
      (SELECT "id" FROM "RecoveryMail" WHERE "expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') OR ("attempts" >= ${maxAttempts}
          AND ("leaseUntil" IS NULL OR "leaseUntil" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')))
        ORDER BY "expiresAt" LIMIT 500 FOR UPDATE SKIP LOCKED)`;
    await this.prisma.$executeRaw`DELETE FROM "PasswordResetToken" WHERE "id" IN
      (SELECT "id" FROM "PasswordResetToken" WHERE "expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ORDER BY "expiresAt" LIMIT 500 FOR UPDATE SKIP LOCKED)`;
    await this.prisma.$executeRaw`DELETE FROM "RecoveryRateBucket" WHERE "key" IN
      (SELECT "key" FROM "RecoveryRateBucket" WHERE "expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ORDER BY "expiresAt" LIMIT 500 FOR UPDATE SKIP LOCKED)`;
  }
  private async claim(): Promise<RecoveryMail | undefined> {
    const lease = randomUUID();
    const [job] = await this.prisma.$queryRaw<RecoveryMail[]>`
      WITH next AS (SELECT "id" FROM "RecoveryMail"
        WHERE "expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND "nextAttemptAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND "attempts" < ${maxAttempts}
          AND ("leaseUntil" IS NULL OR "leaseUntil" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
        ORDER BY "nextAttemptAt", "createdAt", "id" LIMIT 1 FOR UPDATE SKIP LOCKED)
      UPDATE "RecoveryMail" SET "leaseToken" = ${lease}::uuid,
        "leaseUntil" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${leaseMs} * interval '1 millisecond', "attempts" = "attempts" + 1
      FROM next WHERE "RecoveryMail"."id" = next."id" RETURNING "RecoveryMail".*`;
    return job;
  }
  private async discard(job: RecoveryMail) {
    await this.prisma.recoveryMail.deleteMany({ where: { id: job.id, leaseToken: job.leaseToken } });
  }
  private async prepare(job: RecoveryMail): Promise<RecoveryEnvelope | null> {
    if (this.config.mode !== 'smtp') return null;
    const envelope = openRecoveryEnvelope(this.config.key, job.id, job.sealed);
    if (envelope.kind !== job.kind || recoveryRecipientHash(envelope.email) !== job.recipientHash) throw new Error('Recovery message is unavailable');
    return this.prisma.$transaction(async tx => {
      // Match reset/deletion lock order: User first, then its private mail/token rows.
      const [user] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "email" = ${envelope.email} FOR UPDATE`;
      if (!user || job.userId && job.userId !== user.id || envelope.kind === 'changed' && job.userId !== user.id) return null;
      const current = await tx.recoveryMail.findFirst({ where: { id: job.id, leaseToken: job.leaseToken,
        leaseUntil: { gt: new Date() }, expiresAt: { gt: new Date() } } });
      if (!current) return null;
      if (envelope.kind === 'code') {
        const tokenHash = recoveryCodeHash(envelope.code);
        await tx.passwordResetToken.upsert({ where: { tokenHash }, update: {},
          create: { userId: user.id, tokenHash, expiresAt: job.expiresAt } });
      }
      await tx.recoveryMail.updateMany({ where: { id: job.id, leaseToken: job.leaseToken }, data: { userId: user.id } });
      return envelope;
    }, { timeout: 5000, maxWait: 5000 });
  }
  private async deliver(job: RecoveryMail) {
    let envelope: RecoveryEnvelope | null;
    try { envelope = await this.prepare(job); }
    catch (error) {
      if (error instanceof Error && error.message === 'Recovery message is unavailable') { await this.discard(job); return; }
      throw error;
    }
    if (!envelope) { await this.discard(job); return; }
    const current = await this.prisma.recoveryMail.findFirst({ where: { id: job.id, leaseToken: job.leaseToken,
      leaseUntil: { gt: new Date() }, expiresAt: { gt: new Date() } } });
    if (!current) return;
    // SMTP must run outside the account transaction. An already in-flight email can
    // arrive after reset/deletion, but its code cannot restore invalidated credentials.
    try { await this.mailer.send(job.id, envelope, job.expiresAt); }
    catch {
      this.warn();
      if (job.attempts >= maxAttempts) { await this.discard(job); return; }
      await this.prisma.recoveryMail.updateMany({ where: { id: job.id, leaseToken: job.leaseToken },
        data: { leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(60_000, 2000 * 2 ** (job.attempts - 1))) } });
      return;
    }
    await this.discard(job);
  }
  private async process() {
    await this.cleanup(); if (this.config.mode !== 'smtp') return;
    for (let i = 0; i < 5 && !this.stopping; i++) {
      const job = await this.claim(); if (!job) break;
      await this.deliver(job);
    }
  }
}
