import { HttpException, Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { countRateBucket } from './rate-bucket';
import { recoveryRecipientHash } from './auth-recovery/recovery-secrets';

export const AUTH_RATE_CONFIG = Symbol('AUTH_RATE_CONFIG');
export const AUTH_RATE_NAMESPACE = Symbol('AUTH_RATE_NAMESPACE');
export type AuthRateConfig = { mode: 'local' } | { mode: 'shared'; key: Buffer };
export function authRateConfig(env: NodeJS.ProcessEnv = process.env): AuthRateConfig {
  const encoded = env.AUTH_RATE_KEY;
  if (!encoded) {
    if (env.NODE_ENV === 'production') throw new Error('AUTH_RATE_KEY is required in production');
    return { mode: 'local' };
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded || key.every(byte => byte === key[0]))
    throw new Error('Invalid AUTH_RATE_KEY');
  return { mode: 'shared', key };
}

const quarterHour = 15 * 60_000, hour = 60 * 60_000;
type LocalCounter = { count: number; resetAt: number };
@Injectable()
export class AuthRateService {
  private readonly failures = new Map<string, LocalCounter>();
  private readonly challenges = new Map<string, LocalCounter>();
  constructor(private readonly prisma: PrismaService, @Inject(AUTH_RATE_CONFIG) private readonly config: AuthRateConfig,
    @Optional() @Inject(AUTH_RATE_NAMESPACE) private readonly namespace = 'auth:v1') {}
  private limited() { throw new HttpException('Too many account attempts. Try again later.', 429); }
  private local(map: Map<string, LocalCounter>, id: string, increment: boolean) {
    const now = Date.now();
    for (const [key, value] of map) if (value.resetAt <= now) map.delete(key);
    const value = map.get(id);
    if (value && value.count >= 8 || !value && map.size >= 10_000) this.limited();
    if (increment) map.set(id, { count: (value?.count ?? 0) + 1, resetAt: value?.resetAt ?? now + quarterHour });
  }
  private id(kind: string, value: string) {
    if (this.config.mode !== 'shared') throw new Error('Shared authentication configuration is unavailable');
    return createHmac('sha256', this.config.key).update(`${kind}:${value}`).digest('hex');
  }
  async admitLogin(source: string, email: string) {
    if (this.config.mode === 'local') { this.local(this.failures, email, false); return; }
    const prefix = `${this.namespace}:login`, recipientHash = recoveryRecipientHash(email);
    const sourceId = this.id('source', source.slice(0, 512) || 'unknown'), recipientId = this.id('recipient', recipientHash);
    const allowed = await this.prisma.$transaction(async tx => {
      if (await countRateBucket(tx, `${prefix}:global`, hour) > 2000) return false;
      if (await countRateBucket(tx, `${prefix}:source:${sourceId}`, quarterHour) > 40) return false;
      return await countRateBucket(tx, `${prefix}:recipient:${recipientId}`, quarterHour, recipientHash) <= 8;
    }, { timeout: 5000, maxWait: 5000 });
    if (!allowed) this.limited();
  }
  /**
   * Unverified signup (ADR 018) has no mailbox proof to slow it down, so every
   * attempt counts against shared global and per-source hourly buckets before
   * any password hashing. Local development keeps unlimited signup.
   */
  async admitRegistration(source: string) {
    if (this.config.mode === 'local') return;
    const prefix = `${this.namespace}:register`, sourceId = this.id('source', source.slice(0, 512) || 'unknown');
    const allowed = await this.prisma.$transaction(async tx => {
      if (await countRateBucket(tx, `${prefix}:global`, hour) > 200) return false;
      return await countRateBucket(tx, `${prefix}:source:${sourceId}`, hour) <= 10;
    }, { timeout: 5000, maxWait: 5000 });
    if (!allowed) this.limited();
  }
  loginFailed(email: string) { if (this.config.mode === 'local') this.local(this.failures, email, true); }
  loginSucceeded(email: string) { this.failures.delete(email); }
  async admitPassword(userId: string, source: string) {
    if (this.config.mode === 'local') { this.local(this.challenges, userId, true); return; }
    const prefix = `${this.namespace}:password`, sourceId = this.id('source', source.slice(0, 512) || 'unknown');
    const allowed = await this.prisma.$transaction(async tx => {
      // Prevent an admission started during erasure from recreating owned data.
      // Release this lock before the separate password-confirmed mutation.
      const [user] = await tx.$queryRaw<{ email: string }[]>`SELECT "email" FROM "User" WHERE "id" = ${userId}::uuid FOR KEY SHARE`;
      if (!user) throw new UnauthorizedException('Account is unavailable.');
      if (await countRateBucket(tx, `${prefix}:global`, hour) > 2000) return false;
      if (await countRateBucket(tx, `${prefix}:source:${sourceId}`, quarterHour) > 40) return false;
      return await countRateBucket(tx, `${prefix}:owner:${this.id('owner', userId)}`, quarterHour, recoveryRecipientHash(user.email), userId) <= 8;
    }, { timeout: 5000, maxWait: 5000 });
    if (!allowed) this.limited();
  }
}
