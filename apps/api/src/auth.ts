import { Body, ConflictException, Controller, Get, Injectable, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { loginRequestSchema, registerRequestSchema, timeZoneSchema, userSchema } from '@campusflow/contracts';
import { z } from 'zod';
import { AuthGuard, CurrentToken, CurrentUser, RequestUser, ZodPipe, toIso } from './common';
import { PrismaService } from './prisma.service';

const scrypt = promisify(nodeScrypt);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const updateMeSchema = z.object({ displayName: z.string().min(1).max(100).optional(), timeZone: timeZoneSchema.optional() }).strict();

@Injectable()
export class AuthService {
  private readonly failures = new Map<string,{count:number;resetAt:number}>();
  constructor(private readonly prisma: PrismaService) {}
  private async hashPassword(password: string): Promise<string> { const salt = randomBytes(16); const key = await scrypt(password, salt, 64) as Buffer; return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`; }
  private async verify(password: string, encoded: string): Promise<boolean> { const [algorithm, salt64, key64] = encoded.split(':'); if (algorithm !== 'scrypt' || !salt64 || !key64) return false; const expected = Buffer.from(key64, 'base64'); const actual = await scrypt(password, Buffer.from(salt64, 'base64'), expected.length) as Buffer; return expected.length === actual.length && timingSafeEqual(expected, actual); }
  private async issue(user: { id:string; email:string; displayName:string; timeZone:string; createdAt:Date }) { const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + SESSION_MS); await this.prisma.session.create({ data: { userId:user.id, tokenHash:createHash('sha256').update(token).digest('hex'), expiresAt } }); return { accessToken:token, expiresAt:toIso(expiresAt), user:userSchema.parse({id:user.id,email:user.email,displayName:user.displayName,timeZone:user.timeZone,createdAt:toIso(user.createdAt)}) }; }
  async register(input: z.infer<typeof registerRequestSchema>) { try { const user = await this.prisma.user.create({ data:{ email:input.email.trim().toLowerCase(), passwordHash:await this.hashPassword(input.password), displayName:input.displayName, timeZone:input.timeZone, notificationPreference:{create:{}} } }); return this.issue(user); } catch(error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Email already registered'); throw error; } }
  async login(input: z.infer<typeof loginRequestSchema>) { const email=input.email.trim().toLowerCase(); const bound=this.failures.get(email); if(bound&&bound.resetAt>Date.now()&&bound.count>=8)throw new UnauthorizedException('Too many attempts; try again later'); const user = await this.prisma.user.findUnique({where:{email}}); if (!user || !await this.verify(input.password,user.passwordHash)){const current=bound&&bound.resetAt>Date.now()?bound:{count:0,resetAt:Date.now()+15*60_000};this.failures.set(email,{...current,count:current.count+1});throw new UnauthorizedException('Invalid email or password');} this.failures.delete(email);return this.issue(user); }
  async logout(token: string): Promise<void> { await this.prisma.session.updateMany({where:{tokenHash:createHash('sha256').update(token).digest('hex'),revokedAt:null},data:{revokedAt:new Date()}}); }
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
