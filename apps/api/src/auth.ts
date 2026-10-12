import { Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpException, Inject, Injectable, Patch, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { loginRequestSchema, registerRequestSchema, timeZoneSchema, userSchema } from '@campusflow/contracts';
import { z } from 'zod';
import { AuthGuard, CurrentToken, CurrentUser, RequestUser, ZodPipe, toIso } from './common';
import { PrismaService } from './prisma.service';
import { hashPassword, verifyPassword } from './password';
import { REGISTRATION_CONFIG, type RegistrationConfig } from './auth-config';
import { EmailVerificationService } from './email-verification';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const updateMeSchema = z.object({ displayName: z.string().min(1).max(100).optional(), timeZone: timeZoneSchema.optional() }).strict();

@Injectable()
export class AuthService {
  private readonly failures = new Map<string,{count:number;resetAt:number}>();
  private readonly passwordChallenges = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly prisma: PrismaService, private readonly verification: EmailVerificationService,
    @Inject(REGISTRATION_CONFIG) private readonly registration: RegistrationConfig) {}
  capability() { return { registration: this.registration.mode, verificationAvailable: this.verification.available() }; }
  private async issue(tx: Prisma.TransactionClient, user: { id:string; email:string; displayName:string; timeZone:string; createdAt:Date }) { const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + SESSION_MS); await tx.session.create({ data: { userId:user.id, tokenHash:createHash('sha256').update(token).digest('hex'), expiresAt } }); return { accessToken:token, expiresAt:toIso(expiresAt), user:userSchema.parse({id:user.id,email:user.email,displayName:user.displayName,timeZone:user.timeZone,createdAt:toIso(user.createdAt)}) }; }
  async register(input: z.infer<typeof registerRequestSchema>, source = 'unknown') {
    if (this.registration.mode === 'closed') throw new ServiceUnavailableException('New accounts are currently unavailable. Existing users can sign in.');
    const quota = this.registration.mode === 'verified' ? await this.verification.admit(source, input.email) : null;
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.create({ data:{ email:input.email.trim().toLowerCase(), passwordHash, displayName:input.displayName, timeZone:input.timeZone, notificationPreference:{create:{}} } });
        if (quota) {
          if (quota.recipientAllowed) await this.verification.enqueue(tx, user);
          return { verificationRequired: true as const, codeRequested: quota.recipientAllowed, expiresInMinutes: 15 as const };
        }
        return this.issue(tx, user);
      });
    } catch(error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Email already registered'); throw error; }
  }
  async login(input: z.infer<typeof loginRequestSchema>, source = 'unknown') {
    const email = input.email.trim().toLowerCase(), now = Date.now();
    for (const [id, failure] of this.failures) if (failure.resetAt <= now) this.failures.delete(id);
    const bound = this.failures.get(email);
    if (bound && bound.count >= 8 || !bound && this.failures.size >= 10_000) throw new UnauthorizedException('Too many attempts; try again later');
    if (this.verification.available()) await this.verification.checkLogin(source, email);
    const result = await this.prisma.$transaction(async tx => {
      // Reset/deletion take this same lock before changing credentials or sessions.
      const [user] = await tx.$queryRaw<{ id:string; email:string; displayName:string; timeZone:string; createdAt:Date; passwordHash:string; emailVerifiedAt:Date|null }[]>`
        SELECT "id", "email", "displayName", "timeZone", "createdAt", "passwordHash", "emailVerifiedAt" FROM "User" WHERE "email" = ${email} FOR UPDATE`;
      if (!user || !await verifyPassword(input.password, user.passwordHash)) return null;
      if (this.registration.mode !== 'preview' && !user.emailVerifiedAt) {
        return { verificationRequired: true as const };
      }
      return this.issue(tx, user);
    }, { timeout: 5000, maxWait: 5000 });
    if (!result) {
      const current = this.failures.get(email) ?? { count:0, resetAt:now + 15 * 60_000 };
      this.failures.set(email, { ...current, count:current.count + 1 });
      throw new UnauthorizedException('Invalid email or password');
    }
    this.failures.delete(email);
    if ('verificationRequired' in result) {
      // A separate phase avoids nested transactions with small production pools.
      // It rechecks password/ownership under User lock before queuing any mail.
      const codeRequested = await this.verification.requestCode({ email, password: input.password }, source);
      return { verificationRequired: true as const, codeRequested, expiresInMinutes: 15 as const };
    }
    return result;
  }
  async logout(token: string): Promise<void> { await this.prisma.session.updateMany({where:{tokenHash:createHash('sha256').update(token).digest('hex'),revokedAt:null},data:{revokedAt:new Date()}}); }
  async confirmCurrentPassword(userId: string, password: string, encoded: string) {
    const now = Date.now();
    for (const [id, challenge] of this.passwordChallenges) if (challenge.resetAt <= now) this.passwordChallenges.delete(id);
    const challenge = this.passwordChallenges.get(userId) ?? { count: 0, resetAt: now + 15 * 60_000 };
    if (challenge.count >= 8 || (!this.passwordChallenges.has(userId) && this.passwordChallenges.size >= 10_000))
      throw new HttpException('Too many password attempts. Try again in 15 minutes.', 429);
    this.passwordChallenges.set(userId, { ...challenge, count: challenge.count + 1 });
    if (!await verifyPassword(password, encoded)) throw new ForbiddenException('Current password is incorrect. Your account has been kept.');
  }
}

@Controller('auth') export class AuthController {
  constructor(private readonly auth:AuthService) {}
  @Get('capability') @Header('Cache-Control', 'private, no-store') capability() { return this.auth.capability(); }
  @Post('register') @Header('Cache-Control', 'private, no-store') register(@Body(new ZodPipe(registerRequestSchema)) body:z.infer<typeof registerRequestSchema>, @Req() request: { socket: { remoteAddress?: string } }) { return this.auth.register(body, request.socket.remoteAddress ?? 'unknown'); }
  @Post('login') @Header('Cache-Control', 'private, no-store') login(@Body(new ZodPipe(loginRequestSchema)) body:z.infer<typeof loginRequestSchema>, @Req() request: { socket: { remoteAddress?: string } }) { return this.auth.login(body, request.socket.remoteAddress ?? 'unknown'); }
  @Post('logout') @UseGuards(AuthGuard) async logout(@CurrentToken() token:string):Promise<void> { await this.auth.logout(token); }
}

@Controller('me') @UseGuards(AuthGuard) export class MeController {
  constructor(private readonly prisma:PrismaService) {}
  @Get() async get(@CurrentUser() user:RequestUser) { const record=await this.prisma.user.findUniqueOrThrow({where:{id:user.id}}); return userSchema.parse({...record,createdAt:toIso(record.createdAt)}); }
  @Patch() async patch(@CurrentUser() user:RequestUser,@Body(new ZodPipe(updateMeSchema)) body:z.infer<typeof updateMeSchema>) { const record=await this.prisma.user.update({where:{id:user.id},data:body}); return userSchema.parse({...record,createdAt:toIso(record.createdAt)}); }
}
