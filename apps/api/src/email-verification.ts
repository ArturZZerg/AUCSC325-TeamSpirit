import { BadRequestException, Body, Controller, Header, HttpCode, Inject, Injectable, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { emailVerificationConfirmSchema, emailVerificationRequestSchema } from '@campusflow/contracts';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { REGISTRATION_CONFIG, type RegistrationConfig } from './auth-config';
import { RECOVERY_CONFIG, type RecoveryConfig } from './auth-recovery/recovery-config';
import { RecoveryRateService } from './auth-recovery/recovery-rate';
import { createRecoveryCode, recoveryCodeHash, recoveryRecipientHash, sealRecoveryEnvelope, verificationCredentialHash } from './auth-recovery/recovery-secrets';
import { ZodPipe } from './common';
import { requestSource, type SourceRequest } from './request-source';
import { verifyPassword } from './password';
import { PrismaService } from './prisma.service';

const codeMs = 15 * 60_000;
type VerificationUser = { id: string; email: string; passwordHash: string; emailVerifiedAt: Date | null };
@Injectable()
export class EmailVerificationService {
  constructor(private readonly prisma: PrismaService, private readonly rates: RecoveryRateService,
    @Inject(RECOVERY_CONFIG) private readonly mail: RecoveryConfig,
    @Inject(REGISTRATION_CONFIG) private readonly registration: RegistrationConfig) {}
  available() { return this.mail.mode === 'smtp' && this.registration.mode !== 'preview'; }
  private enabled() {
    if (!this.available() || this.mail.mode !== 'smtp') throw new ServiceUnavailableException('Email verification is unavailable. Try again later.');
    return this.mail;
  }
  async admit(source: string, email: string) {
    this.enabled(); return this.rates.record('verification-request', source, email);
  }
  // Call inside the User transaction, never after releasing its credential lock.
  async enqueue(tx: Prisma.TransactionClient, user: VerificationUser) {
    const config = this.enabled(), id = randomUUID();
    await tx.recoveryMail.create({ data: { id, userId: user.id, recipientHash: recoveryRecipientHash(user.email), kind: 'verify',
      sealed: sealRecoveryEnvelope(config.key, id, { kind: 'verify', email: user.email, code: createRecoveryCode(),
        credentialHash: verificationCredentialHash(user.passwordHash) }), expiresAt: new Date(Date.now() + codeMs) } });
  }
  async requestCode(input: z.infer<typeof emailVerificationRequestSchema>, source: string): Promise<boolean> {
    const { recipientAllowed } = await this.admit(source, input.email);
    return this.prisma.$transaction(async tx => {
      const [user] = await tx.$queryRaw<VerificationUser[]>`SELECT "id", "email", "passwordHash", "emailVerifiedAt" FROM "User" WHERE "email" = ${input.email} FOR UPDATE`;
      if (!user || !await verifyPassword(input.password, user.passwordHash)) throw new UnauthorizedException('Invalid email or password');
      if (!user.emailVerifiedAt && recipientAllowed) await this.enqueue(tx, user);
      return !user.emailVerifiedAt && recipientAllowed;
    }, { timeout: 5000, maxWait: 5000 });
  }
  async request(input: z.infer<typeof emailVerificationRequestSchema>, source: string) {
    await this.requestCode(input, source);
    return { accepted: true as const };
  }
  async confirm(input: z.infer<typeof emailVerificationConfirmSchema>, source: string) {
    this.enabled(); await this.rates.record('verify', source, input.email);
    await this.prisma.$transaction(async tx => {
      const [user] = await tx.$queryRaw<VerificationUser[]>`SELECT "id", "email", "passwordHash", "emailVerifiedAt" FROM "User" WHERE "email" = ${input.email} FOR UPDATE`;
      const token = user && await tx.emailVerificationToken.findFirst({ where: { userId: user.id,
        tokenHash: recoveryCodeHash(input.code), credentialHash: verificationCredentialHash(user.passwordHash), expiresAt: { gt: new Date() } } });
      if (!user || user.emailVerifiedAt || !token || !await verifyPassword(input.password, user.passwordHash))
        throw new BadRequestException('The code or password is invalid. Check them or request a new code.');
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      // Preview credentials must not regain access after mailbox verification.
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await tx.recoveryMail.deleteMany({ where: { userId: user.id, kind: 'verify' } });
    }, { timeout: 5000, maxWait: 5000 });
    return { verified: true as const };
  }
}

@Controller('auth/verification')
export class EmailVerificationController {
  constructor(private readonly verification: EmailVerificationService) {}
  @Post('request') @HttpCode(202) @Header('Cache-Control', 'private, no-store')
  request(@Body(new ZodPipe(emailVerificationRequestSchema)) input: z.infer<typeof emailVerificationRequestSchema>, @Req() request: SourceRequest) {
    return this.verification.request(input, requestSource(request));
  }
  @Post('confirm') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  confirm(@Body(new ZodPipe(emailVerificationConfirmSchema)) input: z.infer<typeof emailVerificationConfirmSchema>, @Req() request: SourceRequest) {
    return this.verification.confirm(input, requestSource(request));
  }
}
