import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createStudyPlanSchema, studyPlanSchema, updateStudyPlanSchema, type CreateStudyPlan } from '@campusflow/contracts';
import { z } from 'zod';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, parseUuid } from './common';
import { PrismaService } from './prisma.service';

const include = { academicItem: true, tasks: { orderBy: [{ studyPlanOrder: 'asc' as const }, { id: 'asc' as const }] } };
type PlanRow = Prisma.StudyPlanGetPayload<{ include: typeof include }>;
const dto = (row: PlanRow) => studyPlanSchema.parse({ ...row, createdAt: row.createdAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null,
  academicItem: row.academicItem ? { ...row.academicItem, updatedAt: row.academicItem.updatedAt.toISOString() } : null,
  tasks: row.tasks.map(task => ({ ...task, completedAt: task.completedAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() })),
});

@Controller('study-plans') @UseGuards(AuthGuard)
export class StudyPlansController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@CurrentUser() user: RequestUser) {
    return (await this.prisma.studyPlan.findMany({ where: { userId: user.id }, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] })).map(dto);
  }
  @Patch(':id') async update(@CurrentUser() user: RequestUser, @Param('id', new ZodPipe(parseUuid)) id: string,
    @Body(new ZodPipe(updateStudyPlanSchema)) body: z.infer<typeof updateStudyPlanSchema>) {
    return this.prisma.$transaction(async tx => {
      const changed = await tx.studyPlan.updateMany({ where: { id, userId: user.id }, data: {
        title: body.title, archivedAt: body.archived === undefined ? undefined : body.archived ? new Date() : null,
      } });
      if (!changed.count) throw new NotFoundException('Study plan not found.');
      return dto(await tx.studyPlan.findFirstOrThrow({ where: { id, userId: user.id }, include }));
    });
  }
  @Post() async create(@CurrentUser() user: RequestUser, @Body(new ZodPipe(createStudyPlanSchema)) body: CreateStudyPlan) {
    // Hash the validated canonical shape, independent of JSON property order.
    const requestHash = createHash('sha256').update(JSON.stringify({ academicItemId: body.academicItemId, title: body.title,
      sessions: body.sessions.map(session => ({ title: session.title, estimatedMinutes: session.estimatedMinutes,
        scheduled: session.scheduled.kind === 'date' ? { kind: 'date', date: session.scheduled.date } : { kind: 'instant', at: session.scheduled.at } })) })).digest('hex');
    return this.prisma.$transaction(async tx => {
      // Share the existing account-before-academic lock order. Serializes retries
      // and source deletion without exposing a foreign account's request key.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      const existing = await tx.studyPlan.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey: body.requestKey } }, include });
      if (existing) {
        if (existing.archivedAt) throw new ConflictException('This plan was archived. Restore it from My study plans.');
        if (existing.requestHash !== requestHash) throw new ConflictException('This save key already belongs to a different plan.');
        return dto(existing);
      }
      const item = await tx.academicItem.findFirst({ where: { id: body.academicItemId, userId: user.id } });
      if (!item) throw new BadRequestException('Coursework is unavailable. Refresh and choose an item from your account.');
      if (item.submissionState === 'submitted' || item.submissionState === 'graded') throw new BadRequestException('This coursework is already finished.');
      return dto(await tx.studyPlan.create({ include, data: { userId: user.id, academicItemId: item.id, title: body.title,
        deadlineWhenPlanned: item.due ?? Prisma.JsonNull, requestKey: body.requestKey, requestHash,
        tasks: { create: body.sessions.map((session, index) => ({ userId: user.id, studyPlanOrder: index,
          title: session.title, description: `Study plan: ${body.title}\nCoursework when planned: ${item.title.slice(0, 1000)}`,
          category: 'university', priority: 'medium', scheduled: session.scheduled, estimatedMinutes: session.estimatedMinutes,
          due: Prisma.JsonNull, recurrence: Prisma.JsonNull, reminder: Prisma.JsonNull,
        })) },
      } }));
    });
  }
}
