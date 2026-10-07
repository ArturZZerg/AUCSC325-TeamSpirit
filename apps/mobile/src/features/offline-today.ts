import { composeToday, type TodayInput } from '@campusflow/domain';
import { dateSchema, manualAcademicSource, offlineSnapshotSchema, todayResponseSchema, type OfflineSnapshot, type TodayResponse } from '@campusflow/contracts';

/** Wire/domain mapping belongs to the consuming app, not either shared package. */
function domainInput(snapshot: OfflineSnapshot, date: string, now: string): TodayInput {
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

export function composeOfflineToday(value: unknown, accountId: string, timeZone: string, date: string, now: string): TodayResponse | undefined {
  const valid = offlineSnapshotSchema.safeParse(value);
  if (!valid.success || !dateSchema.safeParse(date).success) return undefined;
  const snapshot = valid.data;
  if (snapshot.accountId !== accountId || snapshot.timeZone !== timeZone
    || date < snapshot.coverage.from || date > snapshot.coverage.through) return undefined;
  const plan = composeToday(domainInput(snapshot, date, now));
  const events = new Map(snapshot.events.map(event => [event.id, event]));
  const itemDto = (item: (typeof plan.items)[number]) => ({ ...item,
    occurrenceKey: item.occurrenceKey ?? null, schedule: item.schedule ?? null,
    due: item.due ?? null, priority: item.priority ?? null,
    allowedActions: item.kind === 'personalTask'
      ? item.state === 'completed' ? ['uncomplete', 'open'] : ['complete', 'snooze', 'open']
      : item.kind === 'goal' && item.state !== 'completed' && item.state !== 'skipped'
        ? ['complete', 'skip', 'snooze', 'open'] : ['open'],
  });
  return todayResponseSchema.parse({ date, timeZone, generatedAt: snapshot.capturedAt,
    sourceStatus: snapshot.sourceStatus, items: plan.items.map(itemDto), upcoming: plan.upcoming.map(itemDto),
    campusEvents: plan.campusEvents.map(event => events.get(event.id)),
  });
}
