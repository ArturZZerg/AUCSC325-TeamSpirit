import { HttpException, Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { RECOVERY_CONFIG, type RecoveryConfig } from './recovery-config';
import { recoveryPrivateId, recoveryRecipientHash } from './recovery-secrets';

export const RECOVERY_RATE_NAMESPACE = Symbol('RECOVERY_RATE_NAMESPACE');
type RecoveryAction = 'request' | 'reset';
const hour = 60 * 60_000, quarterHour = 15 * 60_000;
const policies = {
  request: { source: 10, recipient: 3, recipientWindow: hour },
  reset: { source: 20, recipient: 8, recipientWindow: quarterHour },
} as const;

@Injectable()
export class RecoveryRateService {
  constructor(private readonly prisma: PrismaService, @Inject(RECOVERY_CONFIG) private readonly config: RecoveryConfig,
    @Optional() @Inject(RECOVERY_RATE_NAMESPACE) private readonly namespace = 'recovery:v1') {}
  private async count(tx: Prisma.TransactionClient, key: string, window: number, recipientHash: string | null = null) {
    const [result] = await tx.$queryRaw<{ count: number }[]>`
      INSERT INTO "RecoveryRateBucket" ("key", "recipientHash", "count", "expiresAt")
      VALUES (${key}, ${recipientHash}, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${window} * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RecoveryRateBucket"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1
          ELSE LEAST("RecoveryRateBucket"."count", 2147483646) + 1 END,
        "expiresAt" = CASE WHEN "RecoveryRateBucket"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN EXCLUDED."expiresAt"
          ELSE "RecoveryRateBucket"."expiresAt" END
      RETURNING "count"`;
    return result.count;
  }
  async record(action: RecoveryAction, source: string, email: string): Promise<{ recipientAllowed: boolean }> {
    if (this.config.mode !== 'smtp') throw new ServiceUnavailableException('Password recovery is unavailable. Try again later.');
    const key = this.config.key, policy = policies[action], prefix = `${this.namespace}:${action}`;
    const recipientHash = recoveryRecipientHash(email);
    const sourceId = recoveryPrivateId(key, 'source', source.slice(0, 512) || 'unknown');
    const recipientId = recoveryPrivateId(key, 'recipient', recipientHash);
    // Stable lock order across replicas. Return the decision before throwing so
    // rejected attempts also commit their counts rather than rolling them back.
    const result = await this.prisma.$transaction(async tx => {
      if (await this.count(tx, `${prefix}:global`, hour) > 2000) return { limited: true, recipientAllowed: false };
      if (await this.count(tx, `${prefix}:source:${sourceId}`, quarterHour) > policy.source) return { limited: true, recipientAllowed: false };
      const allowed = await this.count(tx, `${prefix}:recipient:${recipientId}`, policy.recipientWindow, recipientHash) <= policy.recipient;
      return { limited: action === 'reset' && !allowed, recipientAllowed: allowed };
    }, { timeout: 5000, maxWait: 5000 });
    if (result.limited) throw new HttpException('Too many recovery attempts. Try again later.', 429);
    return { recipientAllowed: result.recipientAllowed };
  }
}
