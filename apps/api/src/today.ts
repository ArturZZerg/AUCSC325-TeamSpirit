import { Controller, Get, Injectable, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { composeToday, type AcademicItem as DomainAcademicItem, type Event as DomainEvent, type Goal as DomainGoal, type GoalCompletion as DomainGoalCompletion, type PersonalTask as DomainPersonalTask } from '@campusflow/domain';
import { dateSchema, offlineSnapshotSchema, todayQuerySchema, todayResponseSchema } from '@campusflow/contracts';
import { AuthGuard, CurrentUser, RequestUser, ZodPipe, toIso } from './common';
import { PrismaService } from './prisma.service';

const jsonRecord = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const currentDate = (timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const actionsFor = (kind: 'academic' | 'personalTask' | 'goal' | 'event', state: string): Array<'complete' | 'uncomplete' | 'skip' | 'snooze' | 'open' | 'save'> => {
  if (kind === 'personalTask') return state === 'completed' ? ['uncomplete', 'open'] : ['complete', 'snooze', 'open'];
  if (kind === 'goal') return state === 'completed' || state === 'skipped' ? ['open'] : ['complete', 'skip', 'snooze', 'open'];
  return kind === 'event' ? ['open'] : ['open'];
};

@Injectable()
export class TodayService {
  constructor(private readonly prisma: PrismaService) {}

  async read(user: RequestUser, date: string) {
    const [tasks, academics, goals, completions, events, savedEvents, canvas] = await Promise.all([
      this.prisma.personalTask.findMany({ where: { userId: user.id }, include: { completions: true } }),
      this.prisma.academicItem.findMany({ where: { userId: user.id } }),
      this.prisma.goal.findMany({ where: { userId: user.id } }),
      this.prisma.goalCompletion.findMany({ where: { userId: user.id } }),
      this.prisma.event.findMany({ where: { OR: [{ sourceScope: 'public' }, { sourceScope: `user:${user.id}` }] } }),
      this.prisma.savedEvent.findMany({ where: { userId: user.id } }),
      this.prisma.canvasConnection.findUnique({ where: { userId: user.id } }),
    ]);
    const plan = composeToday({
      date, timeZone: user.timeZone, now: new Date().toISOString(),
      personalTasks: tasks.map(task => ({ id: task.id, title: task.title, priority: task.priority as DomainPersonalTask['priority'], due: jsonRecord(task.due) as DomainPersonalTask['due'], scheduled: jsonRecord(task.scheduled) as DomainPersonalTask['scheduled'], recurrence: jsonRecord(task.recurrence) as DomainPersonalTask['recurrence'], completedAt: task.completedAt?.toISOString(), completedOccurrenceKeys: task.completions.map(completion => completion.occurrenceKey), snoozedUntil: task.snoozedUntil?.toISOString(), mainGoalDate: task.mainGoalDate ?? undefined })),
      academicItems: academics.map(item => ({ id: item.id, title: item.title, due: jsonRecord(item.due) as DomainAcademicItem['due'], submissionState: item.submissionState as DomainAcademicItem['submissionState'], mainGoalDate: item.mainGoalDate ?? undefined })),
      goals: goals.map(goal => ({ id: goal.id, title: goal.title, schedule: jsonRecord(goal.schedule) as DomainGoal['schedule'], timeZone: goal.timeZone, pausedAt: goal.pausedAt?.toISOString(), snoozedUntil: goal.snoozedUntil?.toISOString() })),
      goalCompletions: completions.map(completion => ({ goalId: completion.goalId, occurrenceKey: completion.occurrenceKey, state: completion.state as DomainGoalCompletion['state'], completedAt: completion.completedAt?.toISOString() })),
      events: events.map(event => ({ id: event.id, title: event.title, timing: jsonRecord(event.timing) as DomainEvent['timing'] })),
      savedEvents: savedEvents.map(event => ({ eventId: event.eventId, includedInPlan: event.includedInPlan })),
    });
    const sourceStatus = canvas ? {
      lastSuccessfulSyncAt: canvas.lastSuccessfulSyncAt?.toISOString() ?? null,
      availability: canvas.lastError ? 'unavailable' as const : canvas.lastSuccessfulSyncAt ? 'available' as const : 'stale' as const,
      coveredFrom: canvas.coveredFrom ?? null, coveredThrough: canvas.coveredThrough ?? null,
    } : { lastSuccessfulSyncAt: null, availability: 'notConnected' as const, coveredFrom: null, coveredThrough: null };
    return todayResponseSchema.parse({ date, timeZone: user.timeZone, generatedAt: new Date().toISOString(), sourceStatus,
      items: plan.items.map(item => ({ ...item, occurrenceKey: item.occurrenceKey ?? null, schedule: item.schedule ?? null, due: item.due ?? null, priority: item.priority ?? null, allowedActions: actionsFor(item.kind, item.state) })),
      upcoming: plan.upcoming.map(item => ({ ...item, occurrenceKey: item.occurrenceKey ?? null, schedule: item.schedule ?? null, due: item.due ?? null, priority: item.priority ?? null, allowedActions: actionsFor(item.kind, item.state) })),
      campusEvents: events.filter(event => !savedEvents.some(saved => saved.eventId === event.id && saved.includedInPlan)).map(event => ({ id: event.id, title: event.title, description: event.description, category: event.category, source: event.source, externalId: event.externalId, timing: event.timing, location: event.location, url: event.url })),
    });
  }

  async snapshot(user: RequestUser) {
    const date = currentDate(user.timeZone);
    const today = await this.read(user, date);
    const [tasks, courses, academics, goals, completions, events, saved] = await Promise.all([
      this.prisma.personalTask.findMany({ where: { userId: user.id } }), this.prisma.course.findMany({ where: { userId: user.id } }), this.prisma.academicItem.findMany({ where: { userId: user.id } }), this.prisma.goal.findMany({ where: { userId: user.id } }), this.prisma.goalCompletion.findMany({ where: { userId: user.id } }), this.prisma.event.findMany({ where: { sourceScope: 'public' } }), this.prisma.savedEvent.findMany({ where: { userId: user.id } }),
    ]);
    return offlineSnapshotSchema.parse({ capturedAt: new Date().toISOString(), timeZone: user.timeZone, sourceStatus: today.sourceStatus, courses, academicItems: academics.map(item => ({ ...item, due: item.due ?? null, updatedAt: toIso(item.updatedAt) })), personalTasks: tasks.map(task => ({ ...task, due: task.due ?? null, scheduled: task.scheduled ?? null, recurrence: task.recurrence ?? null, completedAt: task.completedAt?.toISOString() ?? null, snoozedUntil: task.snoozedUntil?.toISOString() ?? null, mainGoalDate: task.mainGoalDate ?? null, createdAt: toIso(task.createdAt), updatedAt: toIso(task.updatedAt) })), goals: goals.map(goal => ({ ...goal, reminder: goal.reminder ?? null, pausedAt: goal.pausedAt?.toISOString() ?? null, snoozedUntil: goal.snoozedUntil?.toISOString() ?? null, createdAt: toIso(goal.createdAt), updatedAt: toIso(goal.updatedAt) })), goalCompletions: completions.map(completion => ({ ...completion, completedAt: completion.completedAt?.toISOString() ?? null, createdAt: toIso(completion.createdAt) })), events: events.map(event => ({ ...event, timing: event.timing })), savedEvents: saved.map(event => ({ ...event, reminder: event.reminder ?? null, savedAt: toIso(event.savedAt) })) });
  }
}

@Controller()
@UseGuards(AuthGuard)
export class TodayController {
  constructor(private readonly today: TodayService) {}
  @Get('today') read(@CurrentUser() user: RequestUser, @Query(new ZodPipe(todayQuerySchema)) query: { date?: string }) { const date = query.date ?? currentDate(user.timeZone); return this.today.read(user, dateSchema.parse(date)); }
  @Get('snapshot') snapshot(@CurrentUser() user: RequestUser) { return this.today.snapshot(user); }
}

@Controller('canvas')
@UseGuards(AuthGuard)
export class CanvasController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('status') async status(@CurrentUser() user: RequestUser) { const connection = await this.prisma.canvasConnection.findUnique({ where: { userId: user.id } }); return { connected: Boolean(connection), baseUrl: connection?.baseUrl ?? null, externalAccountId: connection?.externalAccountId ?? null, lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt?.toISOString() ?? null, lastSyncAttemptAt: connection?.lastSyncAttemptAt?.toISOString() ?? null, lastError: connection?.lastError ?? null }; }
  @Get('connect/start') connect(): never { throw new ServiceUnavailableException('Canvas OAuth is disabled until this deployment has an institution-approved developer key and HTTPS callback.'); }
}
