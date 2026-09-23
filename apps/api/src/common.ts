import { ArgumentMetadata, BadRequestException, CanActivate, ExecutionContext, Injectable, PipeTransform, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z, ZodType } from 'zod';
import { PrismaService } from './prisma.service';

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException({ message: 'Validation failed', issues: result.error.issues });
    return result.data;
  }
}

export interface RequestUser { id: string; email: string; displayName: string; timeZone: string }
type HttpRequest = { headers: Record<string, string | string[] | undefined>; user?: RequestUser; accessToken?: string };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const header = request.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith('Bearer ')) throw new UnauthorizedException();
    const accessToken = raw.slice(7); const tokenHash = createHash('sha256').update(accessToken).digest('hex');
    const session = await this.prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new UnauthorizedException();
    request.user = session.user;
    request.accessToken = accessToken;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): RequestUser => {
  const request = context.switchToHttp().getRequest<HttpRequest>();
  if (!request.user) throw new UnauthorizedException();
  return request.user;
});
export const CurrentToken = createParamDecorator((_data:unknown, context:ExecutionContext):string => { const token=context.switchToHttp().getRequest<HttpRequest>().accessToken; if(!token)throw new UnauthorizedException(); return token; });

export const parseUuid = z.string().uuid();
export const toIso = (value: Date): string => value.toISOString();
