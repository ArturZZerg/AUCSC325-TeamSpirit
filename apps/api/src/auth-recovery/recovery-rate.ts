import { HttpException, Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RECOVERY_CONFIG, type RecoveryConfig } from './recovery-config';
import { recoveryPrivateId, recoveryRecipientHash } from './recovery-secrets';
import { countRateBucket } from '../rate-bucket';

export const RECOVERY_RATE_NAMESPACE = Symbol('RECOVERY_RATE_NAMESPACE');
type RecoveryAction = 'request' | 'reset' | 'verification-request' | 'verify';
const hour = 60 * 60_000, quarterHour = 15 * 60_000;
const policies = {
  request: { source: 10, recipient: 3, recipientWindow: hour },
  reset: { source: 20, recipient: 8, recipientWindow: quarterHour },
  'verification-request': { source: 20, recipient: 3, recipientWindow: hour },
  verify: { source: 20, recipient: 8, recipientWindow: quarterHour },
} as const;

@Injectable()
export class RecoveryRateService {
  constructor(private readonly prisma: PrismaService, @Inject(RECOVERY_CONFIG) private readonly config: RecoveryConfig,
    @Optional() @Inject(RECOVERY_RATE_NAMESPACE) private readonly namespace = 'recovery:v1') {}
  async record(action: RecoveryAction, source: string, email: string): Promise<{ recipientAllowed: boolean }> {
    if (this.config.mode !== 'smtp') throw new ServiceUnavailableException('Password recovery is unavailable. Try again later.');
    const key = this.config.key, policy = policies[action], prefix = `${this.namespace}:${action}`;
    const recipientHash = recoveryRecipientHash(email);
    const sourceId = recoveryPrivateId(key, 'source', source.slice(0, 512) || 'unknown');
    const recipientId = recoveryPrivateId(key, 'recipient', recipientHash);
    // Stable lock order across replicas. Return the decision before throwing so
    // rejected attempts also commit their counts rather than rolling them back.
    const result = await this.prisma.$transaction(async tx => {
      if (await countRateBucket(tx, `${prefix}:global`, hour) > 2000) return { limited: true, recipientAllowed: false };
      if (await countRateBucket(tx, `${prefix}:source:${sourceId}`, quarterHour) > policy.source) return { limited: true, recipientAllowed: false };
      const allowed = await countRateBucket(tx, `${prefix}:recipient:${recipientId}`, policy.recipientWindow, recipientHash) <= policy.recipient;
      return { limited: !['request', 'verification-request'].includes(action) && !allowed, recipientAllowed: allowed };
    }, { timeout: 5000, maxWait: 5000 });
    if (result.limited) throw new HttpException('Too many account attempts. Try again later.', 429);
    return { recipientAllowed: result.recipientAllowed };
  }
}
