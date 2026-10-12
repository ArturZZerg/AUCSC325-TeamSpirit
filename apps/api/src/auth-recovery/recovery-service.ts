import { BadRequestException, Body, Controller, Get, Header, HttpCode, Inject, Injectable, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { passwordRecoveryRequestSchema, passwordResetRequestSchema } from '@campusflow/contracts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ZodPipe } from '../common';
import { hashPassword } from '../password';
import { PrismaService } from '../prisma.service';
import { RECOVERY_CONFIG, type RecoveryConfig } from './recovery-config';
import { RecoveryRateService } from './recovery-rate';
import { createRecoveryCode, recoveryCodeHash, recoveryRecipientHash, sealRecoveryEnvelope } from './recovery-secrets';

export const RECOVERY_CODE_MS = 15 * 60_000;
@Injectable()
export class RecoveryService {
  constructor(private readonly prisma: PrismaService, private readonly rates: RecoveryRateService,
    @Inject(RECOVERY_CONFIG) private readonly config: RecoveryConfig) {}
  capability() { return { available: this.config.mode === 'smtp', expiresInMinutes: 15 as const }; }
  private enabled() {
    if (this.config.mode !== 'smtp') throw new ServiceUnavailableException('Password recovery is unavailable. Try again later.');
    return this.config;
  }
  async request(input: z.infer<typeof passwordRecoveryRequestSchema>, source: string) {
    const config = this.enabled(), { recipientAllowed } = await this.rates.record('request', source, input.email);
    if (recipientAllowed) {
      const id = randomUUID(), sealed = sealRecoveryEnvelope(config.key, id, { kind: 'code', email: input.email, code: createRecoveryCode() });
      // Deliberately no User lookup: the worker resolves ownership after acknowledgment.
      await this.prisma.recoveryMail.create({ data: { id, recipientHash: recoveryRecipientHash(input.email), kind: 'code', sealed,
        expiresAt: new Date(Date.now() + RECOVERY_CODE_MS) } });
    }
    return { accepted: true as const };
  }
  async reset(input: z.infer<typeof passwordResetRequestSchema>, source: string) {
    const config = this.enabled(); await this.rates.record('reset', source, input.email);
    const passwordHash = await hashPassword(input.newPassword), tokenHash = recoveryCodeHash(input.code);
    await this.prisma.$transaction(async tx => {
      const [user] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "email" = ${input.email} FOR UPDATE`;
      const token = user && await tx.passwordResetToken.findFirst({ where: { userId: user.id, tokenHash, expiresAt: { gt: new Date() } } });
      if (!user || !token) throw new BadRequestException('This code is invalid or expired. Request a new code and try again.');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      const recipientHash = recoveryRecipientHash(input.email);
      await tx.recoveryMail.deleteMany({ where: { recipientHash } });
      const id = randomUUID();
      await tx.recoveryMail.create({ data: { id, userId: user.id, recipientHash, kind: 'changed',
        sealed: sealRecoveryEnvelope(config.key, id, { kind: 'changed', email: input.email }), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
    }, { timeout: 5000, maxWait: 5000 });
    return { reset: true as const };
  }
}

type RecoveryRequest = { socket: { remoteAddress?: string } };
@Controller('auth/recovery')
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}
  @Get('capability') @Header('Cache-Control', 'private, no-store') capability() { return this.recovery.capability(); }
  @Post('request') @HttpCode(202) @Header('Cache-Control', 'private, no-store')
  request(@Body(new ZodPipe(passwordRecoveryRequestSchema)) input: z.infer<typeof passwordRecoveryRequestSchema>, @Req() request: RecoveryRequest) {
    // Until an explicit deployment proxy policy exists, use the actual peer only.
    return this.recovery.request(input, request.socket.remoteAddress ?? 'unknown');
  }
  @Post('reset') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  reset(@Body(new ZodPipe(passwordResetRequestSchema)) input: z.infer<typeof passwordResetRequestSchema>, @Req() request: RecoveryRequest) {
    return this.recovery.reset(input, request.socket.remoteAddress ?? 'unknown');
  }
}
