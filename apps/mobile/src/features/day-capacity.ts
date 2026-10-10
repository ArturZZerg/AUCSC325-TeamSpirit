import { classScheduleSchema, dateSchema, offlineSnapshotSchema } from '@campusflow/contracts';
import { addCalendarDays, allDayEventOverlapsDay, classesOnDay, dayBounds, localClockAt,
  overlapsDay, studyWindows, taskOccurrenceTiming, taskOccursOn, type BusyInterval, type ClassOccurrence, type StudyWindow } from '@campusflow/domain';
import type { TaskFormValues } from './task-form';

export type CapacityStatus = 'ready' | 'unavailable' | 'clockChange' | 'missingDuration';
export interface DayCapacity {
  classes: ClassOccurrence[]; classesLoaded: boolean; classIssues: string[];
  status: CapacityStatus; windows: StudyWindow[];
}

/** Mobile mapping over validated account records; absent coverage is never free time. */
export function buildDayCapacity(snapshotValue: unknown, classesValue: unknown, accountId: string,
  timeZone: string, date: string, now: string, minimumMinutes = 30): DayCapacity {
  const schedules = classScheduleSchema.array().safeParse(classesValue);
  const result: DayCapacity = { classes: [], classesLoaded: schedules.success, classIssues: [], status: 'unavailable', windows: [] };
  if (!dateSchema.safeParse(date).success) return result;
  if (schedules.success) {
    const day = classesOnDay(schedules.data, date, timeZone);
    result.classes = day.occurrences; result.classIssues = day.issues.map(issue => issue.title);
  }
  const valid = offlineSnapshotSchema.safeParse(snapshotValue);
  if (!schedules.success || !valid.success || valid.data.accountId !== accountId || valid.data.timeZone !== timeZone
    || date < valid.data.coverage.from || date > valid.data.coverage.through) return result;
  if (result.classIssues.length) return { ...result, status: 'clockChange' };
  const snapshot = valid.data; const bounds = dayBounds(date, timeZone);
  const busy: BusyInterval[] = result.classes.map(item => ({ startsAt: item.startsAt, endsAt: item.endsAt }));
  let missingDuration = false;
  for (const task of snapshot.personalTasks) {
    if (!task.scheduled || (!task.recurrence && task.completedAt)) continue;
    const pattern = { id: task.id, title: task.title, priority: task.priority, scheduled: task.scheduled, due: task.due ?? undefined,
      recurrence: task.recurrence ?? undefined };
    // A 24-hour estimate can span two local midnights across a spring DST change.
    const dates = task.recurrence ? [-2, -1, 0].map(offset => addCalendarDays(date, offset)) : [date];
    for (const occurrence of dates) {
      if (task.recurrence && (!taskOccursOn(pattern, occurrence, timeZone)
        || snapshot.taskCompletions.some(row => row.taskId === task.id && row.occurrenceKey === occurrence))) continue;
      const timing = task.recurrence ? taskOccurrenceTiming(pattern, occurrence, timeZone).scheduled : task.scheduled;
      if (timing?.kind !== 'instant') continue;
      if (task.estimatedMinutes === null) {
        // A task may continue from yesterday. Do not expose a free window while
        // its supported (up to 1440-minute) duration could overlap this day.
        const latestEnd = new Date(Date.parse(timing.at) + 1440 * 60000).toISOString();
        if (overlapsDay(timing.at, latestEnd, date, timeZone)) missingDuration = true;
        continue;
      }
      const endsAt = new Date(Date.parse(timing.at) + task.estimatedMinutes * 60000).toISOString();
      if (overlapsDay(timing.at, endsAt, date, timeZone)) busy.push({ startsAt: timing.at, endsAt });
    }
  }
  const plannedEvents = new Set(snapshot.savedEvents.filter(event => event.includedInPlan).map(event => event.eventId));
  for (const event of snapshot.events) {
    if (!plannedEvents.has(event.id)) continue;
    if (event.timing.kind === 'allDay') {
      if (allDayEventOverlapsDay(event.timing.startDate, event.timing.endDateExclusive, date)) busy.push({ startsAt: bounds.start, endsAt: bounds.end });
    } else {
      const { startsAt, endsAt } = event.timing;
      if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) missingDuration = true;
      else if (overlapsDay(startsAt, endsAt ?? undefined, date, timeZone)) {
        if (!endsAt) missingDuration = true; else busy.push({ startsAt, endsAt });
      }
    }
  }
  if (missingDuration) return { ...result, status: 'missingDuration' };
  try { return { ...result, status: 'ready', windows: studyWindows({ date, timeZone, now, busy, minimumMinutes }) }; }
  catch { return { ...result, status: 'clockChange' }; }
}

export function studyTaskDefaults(startsAt: string, minutes: number, timeZone: string): Partial<TaskFormValues> {
  const local = localClockAt(startsAt, timeZone);
  return { title: 'Study block', category: 'university', scheduledMode: 'instant',
    scheduledDate: local.date, scheduledTime: local.time, estimatedMinutes: String(minutes) };
}
