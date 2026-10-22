import { addCalendarDays, localDateAt } from '@campusflow/domain';
import type { PersonalTask } from '@/lib/types';

export type TaskBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday' | 'repeating' | 'completed';
export const bucketTitles: Record<TaskBucket, string> = {
  overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', week: 'Next 7 days', later: 'Later',
  someday: 'No date', repeating: 'Repeating', completed: 'Completed',
};
const order: TaskBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'someday', 'repeating', 'completed'];

const valueDate = (value: PersonalTask['due'], timeZone: string) => !value ? undefined : value.kind === 'date' ? value.date : localDateAt(value.at, timeZone);
const valueTime = (value: PersonalTask['due']) => !value ? Infinity : Date.parse(value.kind === 'date' ? `${value.date}T23:59:59Z` : value.at);

/**
 * Account-zone bucket for one task. A passed deadline is overdue; otherwise the
 * earlier of the scheduled day and deadline decides when the work appears.
 */
export function taskBucket(task: PersonalTask, today: string, timeZone: string, now: number): TaskBucket {
  if (task.completedAt) return 'completed';
  if (task.recurrence) return 'repeating';
  const due = valueDate(task.due, timeZone), scheduled = valueDate(task.scheduled, timeZone);
  if (due && (due < today || (task.due?.kind === 'instant' && Date.parse(task.due.at) < now && due === today))) return 'overdue';
  const anchor = [due, scheduled].filter((value): value is string => !!value).sort()[0];
  if (!anchor) return 'someday';
  if (anchor <= today) return 'today';
  if (anchor === addCalendarDays(today, 1)) return 'tomorrow';
  return anchor <= addCalendarDays(today, 7) ? 'week' : 'later';
}

const priorityRank = { high: 0, medium: 1, low: 2 } as const;

/** Stable, non-mutating grouping; empty buckets are omitted. */
export function groupTasks(tasks: readonly PersonalTask[], today: string, timeZone: string, now: number) {
  const groups = new Map<TaskBucket, PersonalTask[]>();
  for (const task of tasks) {
    const bucket = taskBucket(task, today, timeZone, now);
    groups.set(bucket, [...(groups.get(bucket) ?? []), task]);
  }
  const anchor = (task: PersonalTask) => Math.min(valueTime(task.due), valueTime(task.scheduled));
  return order.filter(bucket => groups.has(bucket)).map(bucket => ({ bucket, title: bucketTitles[bucket], tasks: [...groups.get(bucket)!].sort((a, b) =>
    bucket === 'completed' ? Date.parse(b.completedAt!) - Date.parse(a.completedAt!) || a.id.localeCompare(b.id)
      : anchor(a) - anchor(b) || priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)) }));
}

export function taskSummary(tasks: readonly PersonalTask[], today: string, timeZone: string, now: number) {
  const open = tasks.filter(task => !task.completedAt);
  return { open: open.length, overdue: open.filter(task => taskBucket(task, today, timeZone, now) === 'overdue').length };
}

/** "2 personal · 40 coursework open": the University list is part of this tab, so count it too. */
export function tasksSummaryLabel(summary: { open: number; overdue: number }, coursework: number | undefined) {
  const parts = [coursework ? `${summary.open} personal · ${coursework} coursework open` : `${summary.open} open`];
  if (summary.overdue) parts.push(`${summary.overdue} overdue`);
  return parts.join(' · ');
}
