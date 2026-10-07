import { Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addCalendarDays, composeToday, localDateAt, type TodayInput } from '@campusflow/domain';
import { manualAcademicSource, offlineSnapshotSchema, todayQuerySchema, todayResponseSchema, type OfflineSnapshot } from '@campusflow/contracts';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, toIso } from './common';
import { PrismaService } from './prisma.service';

/** App-level wire/domain mapping; shared packages remain independent. */
export function snapshotToDomainInput(snapshot: OfflineSnapshot, date: string, now: string): TodayInput {
  return {
    date, now, timeZone: snapshot.timeZone,
    personalTasks: snapshot.personalTasks.map(task => ({
      id: task.id, title: task.title, priority: task.priority, due: task.due ?? undefined,
      scheduled: task.scheduled ?? undefined, recurrence: task.recurrence ?? undefined,
      completedAt: task.completedAt ?? undefined, snoozedUntil: task.snoozedUntil ?? undefined,
      mainGoalDate: task.mainGoalDate ?? undefined,
      completedOccurrenceKeys: snapshot.taskCompletions.filter(row => row.taskId === task.id).map(row => row.occurrenceKey),
    })),
    academicItems: snapshot.academicItems.map(item => ({ id: item.id, title: item.title, due: item.due ?? undefined,
      submissionState: item.source === manualAcademicSource ? undefined : item.submissionState ?? undefined,
      completed: item.source === manualAcademicSource && item.submissionState === 'submitted', mainGoalDate: item.mainGoalDate ?? undefined })),
    goals: snapshot.goals.map(goal => ({ id: goal.id, title: goal.title, schedule: goal.schedule, timeZone: goal.timeZone,
      pausedAt: goal.pausedAt ?? undefined, snoozedUntil: goal.snoozedUntil ?? undefined })),
    goalCompletions: snapshot.goalCompletions.map(row => ({ ...row, completedAt: row.completedAt ?? undefined })),
    events: snapshot.events.map(event => ({ id: event.id, title: event.title,
      timing: event.timing.kind === 'timed' ? { ...event.timing, endsAt: event.timing.endsAt ?? undefined } : event.timing })),
    savedEvents: snapshot.savedEvents.map(row => ({ eventId: row.eventId, includedInPlan: row.includedInPlan })),
  };
}

const actionsFor = (kind: 'academic' | 'personalTask' | 'goal' | 'event', state: string): Array<'complete' | 'uncomplete' | 'skip' | 'snooze' | 'open' | 'save'> => {
  if (kind === 'personalTask') return state === 'completed' ? ['uncomplete', 'open'] : ['complete', 'snooze', 'open'];
  if (kind === 'goal') return state === 'completed' || state === 'skipped' ? ['open'] : ['complete', 'skip', 'snooze', 'open'];
  return ['open'];
};

@Injectable()
export class TodayService {
  constructor(private readonly prisma: PrismaService) {}

  async read(user: RequestUser, date: string) {
    const snapshot = await this.snapshot(user, date);
    const plan = composeToday(snapshotToDomainInput(snapshot, date, snapshot.capturedAt));
    const eventsById = new Map(snapshot.events.map(event => [event.id, event]));
    const itemDto = (item: (typeof plan.items)[number]) => ({ ...item,
      occurrenceKey: item.occurrenceKey ?? null, schedule: item.schedule ?? null,
      due: item.due ?? null, priority: item.priority ?? null, allowedActions: actionsFor(item.kind, item.state) });
    return todayResponseSchema.parse({ date, timeZone: snapshot.timeZone, generatedAt: snapshot.capturedAt,
      sourceStatus: snapshot.sourceStatus, items: plan.items.map(itemDto), upcoming: plan.upcoming.map(itemDto),
      campusEvents: plan.campusEvents.map(event => eventsById.get(event.id)),
    });
  }

  async snapshot(user: RequestUser, date?: string): Promise<OfflineSnapshot> {
    // A consistent persisted read: concurrent completion/import writes cannot mix
    // old entity records with new completion rows inside one snapshot.
    return this.prisma.$transaction(async tx => {
      const capturedAt = new Date().toISOString();
      const from = date ?? localDateAt(capturedAt, user.timeZone);
      const visibility = { OR: [{ sourceScope: 'public' }, { sourceScope: `user:${user.id}` }] };
      const [tasks, taskCompletions, courses, academics, goals, completions, events, saved, canvas] = await Promise.all([
        tx.personalTask.findMany({ where: { userId: user.id } }),
        tx.taskCompletion.findMany({ where: { userId: user.id, task: { userId: user.id } } }),
        tx.course.findMany({ where: { userId: user.id } }),
        tx.academicItem.findMany({ where: { userId: user.id } }),
        tx.goal.findMany({ where: { userId: user.id } }),
        tx.goalCompletion.findMany({ where: { userId: user.id, goal: { userId: user.id } } }),
        tx.event.findMany({ where: visibility }),
        tx.savedEvent.findMany({ where: { userId: user.id, event: visibility } }),
        tx.canvasConnection.findUnique({ where: { userId: user.id } }),
      ]);
      const sourceStatus = canvas ? {
        lastSuccessfulSyncAt: canvas.lastSuccessfulSyncAt?.toISOString() ?? null,
        availability: canvas.lastError ? 'unavailable' : canvas.lastSuccessfulSyncAt ? 'available' : 'stale',
        coveredFrom: canvas.coveredFrom ?? null, coveredThrough: canvas.coveredThrough ?? null,
      } : { lastSuccessfulSyncAt: null, availability: 'notConnected', coveredFrom: null, coveredThrough: null };
      // Currently load all persisted records, including overdue work and future
      // deadlines. Advertise only an eight-day plan window; each day also has its
      // seven-day upcoming data. Source coverage is independent of this window.
      return offlineSnapshotSchema.parse({ accountId: user.id, capturedAt, timeZone: user.timeZone,
        coverage: { from, through: addCalendarDays(from, 7), includesOverdue: true, basis: 'persisted' }, sourceStatus,
        courses,
        academicItems: academics.map(item => ({ ...item, updatedAt: toIso(item.updatedAt) })),
        personalTasks: tasks.map(task => ({ ...task, completedAt: task.completedAt?.toISOString() ?? null,
          snoozedUntil: task.snoozedUntil?.toISOString() ?? null, createdAt: toIso(task.createdAt), updatedAt: toIso(task.updatedAt) })),
        taskCompletions: taskCompletions.map(row => ({ taskId: row.taskId, occurrenceKey: row.occurrenceKey, completedAt: toIso(row.completedAt) })),
        goals: goals.map(goal => ({ ...goal, pausedAt: goal.pausedAt?.toISOString() ?? null,
          snoozedUntil: goal.snoozedUntil?.toISOString() ?? null, createdAt: toIso(goal.createdAt), updatedAt: toIso(goal.updatedAt) })),
        goalCompletions: completions.map(row => ({ ...row, completedAt: row.completedAt?.toISOString() ?? null, createdAt: toIso(row.createdAt) })),
        events,
        savedEvents: saved.map(row => ({ ...row, savedAt: toIso(row.savedAt) })),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

@Controller()
@UseGuards(AuthGuard)
export class TodayController {
  constructor(private readonly today: TodayService) {}
  @Get('today') read(@CurrentUser() user: RequestUser, @Query(new ZodPipe(todayQuerySchema)) query: { date?: string }) {
    return this.today.read(user, query.date ?? localDateAt(new Date().toISOString(), user.timeZone));
  }
  @Get('snapshot') snapshot(@CurrentUser() user: RequestUser, @Query(new ZodPipe(todayQuerySchema)) query: { date?: string }) {
    return this.today.snapshot(user, query.date);
  }
}
