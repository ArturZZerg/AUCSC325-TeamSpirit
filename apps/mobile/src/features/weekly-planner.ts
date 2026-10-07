import { addCalendarDays, localDateAt } from '@campusflow/domain';
import { composeOfflineToday } from './offline-today';
import type { PlanItem } from '@/lib/types';

export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addCalendarDays(date, -((weekday + 6) % 7));
}

export const calendarLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
export const isFinished = (item: PlanItem) => ['completed', 'submitted', 'graded', 'skipped'].includes(item.state);

export function buildPlannerWeek(snapshot: unknown, accountId: string, timeZone: string, start: string, now: string) {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addCalendarDays(start, offset);
    const plan = composeOfflineToday(snapshot, accountId, timeZone, date, now);
    return { date, plan, open: plan?.items.filter(item => !isFinished(item)).length };
  });
  const planned = new Set<string>();
  const finished = new Set<string>();
  const deadlines = new Set<string>();
  for (const { date, plan } of days) for (const item of plan?.items ?? []) {
    planned.add(item.key);
    if (isFinished(item)) finished.add(item.key);
    const dueDate = item.due?.kind === 'date' ? item.due.date
      : item.due?.kind === 'instant' ? localDateAt(item.due.at, timeZone) : undefined;
    if (dueDate === date && !isFinished(item)) deadlines.add(item.key);
  }
  return { days, planned: planned.size, finished: finished.size, deadlines: deadlines.size,
    coveredDays: days.filter(day => day.plan !== undefined).length };
}
