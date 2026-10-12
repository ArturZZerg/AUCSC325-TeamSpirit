import { Body, ConflictException, Controller, ForbiddenException, Get, HttpException, Injectable, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { loginRequestSchema, registerRequestSchema, timeZoneSchema, userSchema } from '@campusflow/contracts';
import { z } from 'zod';
import { AuthGuard, CurrentToken, CurrentUser, RequestUser, ZodPipe, toIso } from './common';
import { PrismaService } from './prisma.service';
import { hashPassword, verifyPassword } from './password';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const updateMeSchema = z.object({ displayName: z.string().min(1).max(100).optional(), timeZone: timeZoneSchema.optional() }).strict();

@Injectable()
export class AuthService {
  private readonly failures = new Map<string,{count:number;resetAt:number}>();
  private readonly passwordChallenges = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly prisma: PrismaService) {}
  private async issue(tx: Prisma.TransactionClient, user: { id:string; email:string; displayName:string; timeZone:string; createdAt:Date }) { const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + SESSION_MS); await tx.session.create({ data: { userId:user.id, tokenHash:createHash('sha256').update(token).digest('hex'), expiresAt } }); return { accessToken:token, expiresAt:toIso(expiresAt), user:userSchema.parse({id:user.id,email:user.email,displayName:user.displayName,timeZone:user.timeZone,createdAt:toIso(user.createdAt)}) }; }
  async register(input: z.infer<typeof registerRequestSchema>) {
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.create({ data:{ email:input.email.trim().toLowerCase(), passwordHash, displayName:input.displayName, timeZone:input.timeZone, notificationPreference:{create:{}} } });
        return this.issue(tx, user);
      });
    } catch(error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Email already registered'); throw error; }
  }
  async login(input: z.infer<typeof loginRequestSchema>) {
    const email = input.email.trim().toLowerCase(), now = Date.now();
    for (const [id, failure] of this.failures) if (failure.resetAt <= now) this.failures.delete(id);
    const bound = this.failures.get(email);
    if (bound && bound.count >= 8 || !bound && this.failures.size >= 10_000) throw new UnauthorizedException('Too many attempts; try again later');
    const result = await this.prisma.$transaction(async tx => {
      // Reset/deletion take this same lock before changing credentials or sessions.
      const [user] = await tx.$queryRaw<{ id:string; email:string; displayName:string; timeZone:string; createdAt:Date; passwordHash:string }[]>`
        SELECT "id", "email", "displayName", "timeZone", "createdAt", "passwordHash" FROM "User" WHERE "email" = ${email} FOR UPDATE`;
      if (!user || !await verifyPassword(input.password, user.passwordHash)) return null;
      return this.issue(tx, user);
    }, { timeout: 5000, maxWait: 5000 });
    if (!result) {
      const current = this.failures.get(email) ?? { count:0, resetAt:now + 15 * 60_000 };
      this.failures.set(email, { ...current, count:current.count + 1 });
      throw new UnauthorizedException('Invalid email or password');
    }
    this.failures.delete(email); return result;
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
  @Post('register') register(@Body(new ZodPipe(registerRequestSchema)) body:z.infer<typeof registerRequestSchema>) { return this.auth.register(body); }
  @Post('login') login(@Body(new ZodPipe(loginRequestSchema)) body:z.infer<typeof loginRequestSchema>) { return this.auth.login(body); }
  @Post('logout') @UseGuards(AuthGuard) async logout(@CurrentToken() token:string):Promise<void> { await this.auth.logout(token); }
}

@Controller('me') @UseGuards(AuthGuard) export class MeController {
  constructor(private readonly prisma:PrismaService) {}
  @Get() async get(@CurrentUser() user:RequestUser) { const record=await this.prisma.user.findUniqueOrThrow({where:{id:user.id}}); return userSchema.parse({...record,createdAt:toIso(record.createdAt)}); }
  @Patch() async patch(@CurrentUser() user:RequestUser,@Body(new ZodPipe(updateMeSchema)) body:z.infer<typeof updateMeSchema>) { const record=await this.prisma.user.update({where:{id:user.id},data:body}); return userSchema.parse({...record,createdAt:toIso(record.createdAt)}); }
}
