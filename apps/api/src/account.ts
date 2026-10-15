import { Body, Controller, Delete, Get, Header, Injectable, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { accountExportSchema, deleteAccountSchema } from '@campusflow/contracts';
import { z } from 'zod';
import { AuthService } from './auth';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe } from './common';
import { PrismaService } from './prisma.service';
import { recoveryRecipientHash } from './auth-recovery/recovery-secrets';
import { requestSource, type SourceRequest } from './request-source';

const eventFields = { id: true, title: true, description: true, category: true, source: true, externalId: true, timing: true, location: true, url: true } as const;
// Database whitelists: adding a credential column cannot add it to an export.
const accountFields = {
  id: true, email: true, displayName: true, timeZone: true, createdAt: true,
  tasks: { select: { id: true, studyPlanId: true, studyPlanOrder: true, title: true, description: true, priority: true, category: true, due: true,
    scheduled: true, recurrence: true, reminder: true, estimatedMinutes: true, completedAt: true, snoozedUntil: true,
    mainGoalDate: true, checklist: true, courseId: true, createdAt: true, updatedAt: true } },
  taskCompletions: { select: { taskId: true, occurrenceKey: true, completedAt: true } },
  courses: { select: { id: true, externalId: true, source: true, name: true, code: true, active: true, color: true, assessments: true, targetGrade: true } },
  academicItems: { select: { id: true, courseId: true, title: true, kind: true, due: true, submissionState: true,
    source: true, externalId: true, mainGoalDate: true, updatedAt: true, reminderLeadMinutes: true } },
  classSchedules: { select: { id: true, title: true, weekdays: true, termStart: true, termEnd: true, startTime: true,
    endTime: true, timeZone: true, location: true, instructor: true, notes: true, color: true, courseId: true, createdAt: true, updatedAt: true } },
  studyPlans: { select: { id: true, academicItemId: true, title: true, deadlineWhenPlanned: true, archivedAt: true, createdAt: true } },
  focusSessions: { select: { id: true, taskId: true, title: true, startedAt: true, endedAt: true,
    plannedMinutes: true, focusedSeconds: true, outcome: true, createdAt: true } },
  goals: { select: { id: true, title: true, category: true, schedule: true, timeZone: true, reminder: true,
    pausedAt: true, snoozedUntil: true, createdAt: true, updatedAt: true } },
  goalCompletions: { select: { id: true, goalId: true, occurrenceKey: true, state: true, completedAt: true, createdAt: true } },
  wellnessEntries: { select: { id: true, date: true, mood: true, energy: true, stress: true, note: true, createdAt: true } },
  savedEvents: { select: { eventId: true, includedInPlan: true, reminder: true, savedAt: true, event: { select: eventFields } } },
  reminders: { select: { id: true, targetKind: true, targetId: true, occurrenceKey: true, fireAt: true, enabled: true } },
  notificationPreference: { select: { academicEnabled: true, personalEnabled: true, goalEnabled: true, eventEnabled: true,
    dailyOverviewEnabled: true, quietHoursStart: true, quietHoursEnd: true } },
  canvasConnection: { select: { baseUrl: true, externalAccountId: true, lastSuccessfulSyncAt: true,
    lastSyncAttemptAt: true, coveredFrom: true, coveredThrough: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}
  async export(userId: string) {
    return this.prisma.$transaction(async tx => {
      const [stamp] = await tx.$queryRaw<{ at: Date }[]>`SELECT transaction_timestamp() AS "at"`;
      const record = await tx.user.findUnique({ where: { id: userId }, select: accountFields });
      if (!record) throw new UnauthorizedException('Account is unavailable.');
      const { tasks, classSchedules, notificationPreference, ...data } = record;
      const privateEvents = await tx.event.findMany({ where: { sourceScope: `user:${userId}` }, select: eventFields });
      const { id, email, displayName, timeZone, createdAt, ...collections } = data;
      // Convert whitelisted Date fields; validate the complete public shape before returning it.
      return accountExportSchema.parse(JSON.parse(JSON.stringify({ format: 'campusflow-account', version: 1,
        capturedAt: stamp.at, coverage: 'server-saved', profile: { id, email, displayName, timeZone, createdAt },
        ...collections, personalTasks: tasks, classes: classSchedules, notificationPreferences: notificationPreference, privateEvents })));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }
  async delete(userId: string, currentPassword: string, source = 'unknown') {
    await this.auth.admitPassword(userId, source);
    return this.prisma.$transaction(async tx => {
      const [record] = await tx.$queryRaw<{ id: string; email: string; passwordHash: string }[]>`SELECT "id", "email", "passwordHash" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      if (!record) throw new UnauthorizedException('Account is unavailable.');
      await this.auth.confirmCurrentPassword(currentPassword, record.passwordHash);
      const recipientHash = recoveryRecipientHash(record.email);
      await tx.recoveryMail.deleteMany({ where: { recipientHash } });
      await tx.recoveryRateBucket.deleteMany({ where: { recipientHash } });
      await tx.event.deleteMany({ where: { sourceScope: `user:${userId}` } });
      await tx.user.delete({ where: { id: userId } });
      return { deleted: true as const };
    }, { timeout: 30000, maxWait: 10000 });
  }
}

@Controller('me') @UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}
  @Get('export') @Header('Cache-Control', 'private, no-store')
  export(@CurrentUser() user: RequestUser) { return this.account.export(user.id); }
  @Delete() @Header('Cache-Control', 'private, no-store')
  delete(@CurrentUser() user: RequestUser, @Body(new ZodPipe(deleteAccountSchema)) body: z.infer<typeof deleteAccountSchema>, @Req() request: SourceRequest) {
    return this.account.delete(user.id, body.currentPassword, requestSource(request));
  }
}
