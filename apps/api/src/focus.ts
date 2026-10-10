import { BadRequestException, Body, ConflictException, Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { FocusSession as FocusRow } from '@prisma/client';
import { focusHistoryQuerySchema, focusHistorySchema, focusSessionSchema, saveFocusSessionSchema, type SaveFocusSession } from '@campusflow/contracts';
import { dayBounds } from '@campusflow/domain';
import { z } from 'zod';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe } from './common';
import { PrismaService } from './prisma.service';

const dto = (row: FocusRow) => focusSessionSchema.parse({ ...row, startedAt: row.startedAt.toISOString(),
  endedAt: row.endedAt.toISOString(), createdAt: row.createdAt.toISOString() });

@Controller('focus-sessions') @UseGuards(AuthGuard)
export class FocusController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: RequestUser, @Query(new ZodPipe(focusHistoryQuerySchema)) query: z.infer<typeof focusHistoryQuerySchema>) {
    const start = dayBounds(query.from, user.timeZone).start, end = dayBounds(query.through, user.timeZone).end;
    const rows = await this.prisma.focusSession.findMany({ where: { userId: user.id, endedAt: { gte: new Date(start), lt: new Date(end) } },
      orderBy: [{ endedAt: 'desc' }, { id: 'asc' }] });
    return focusHistorySchema.parse({ accountId: user.id, timeZone: user.timeZone, ...query, capturedAt: new Date().toISOString(), sessions: rows.map(dto) });
  }
  @Post() @Header('Cache-Control', 'private, no-store')
  async save(@CurrentUser() user: RequestUser, @Body(new ZodPipe(saveFocusSessionSchema)) body: SaveFocusSession) {
    const requestHash = createHash('sha256').update(JSON.stringify({ taskId: body.taskId, title: body.title,
      startedAt: body.startedAt, endedAt: body.endedAt, plannedMinutes: body.plannedMinutes,
      focusedSeconds: body.focusedSeconds, outcome: body.outcome })).digest('hex');
    return this.prisma.$transaction(async tx => {
      // Match existing account-first locks and serialize retries across devices.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      const existing = await tx.focusSession.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey: body.requestKey } } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictException('This save key belongs to another focus block.');
        return dto(existing);
      }
      if (Date.parse(body.endedAt) > Date.now() + 30_000) throw new BadRequestException('Check your device clock before saving focus time.');
      if (body.taskId) {
        await tx.$queryRaw`SELECT "id" FROM "PersonalTask" WHERE "id" = ${body.taskId}::uuid AND "userId" = ${user.id}::uuid FOR KEY SHARE`;
        if (!await tx.personalTask.findFirst({ where: { id: body.taskId, userId: user.id } })) {
          throw new BadRequestException('The linked task is unavailable. Your timer has been kept.');
        }
      }
      return dto(await tx.focusSession.create({ data: { ...body, userId: user.id, requestHash,
        startedAt: new Date(body.startedAt), endedAt: new Date(body.endedAt) } }));
    });
  }
}
