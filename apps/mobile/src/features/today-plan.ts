import { localClockAt, localDateAt } from '@campusflow/domain';
import type { PlanItem } from '@/lib/types';

/** Presentation-only view of the derived Today read model. Never persisted. */
export type PlanGroups = { open: PlanItem[]; done: PlanItem[] };

const finished = new Set<PlanItem['state']>(['completed', 'submitted', 'graded']);
export const isPlanItemDone = (item: PlanItem) => finished.has(item.state);

/** Main goals first, then overdue work; otherwise the server order is kept. */
export function groupPlan(items: PlanItem[]): PlanGroups {
  const rank = (item: PlanItem) => item.isMainGoal ? 0 : item.state === 'overdue' ? 1 : 2;
  const open = items.filter(item => !isPlanItemDone(item) && item.state !== 'skipped')
    .map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(row => row.item);
  return { open, done: items.filter(item => isPlanItemDone(item) || item.state === 'skipped') };
}

/** Events are information, not work; skipped routines leave the denominator. */
export function planProgress(items: PlanItem[]) {
  const work = items.filter(item => item.kind !== 'event' && item.state !== 'skipped');
  const done = work.filter(isPlanItemDone).length;
  return { done, total: work.length, ratio: work.length ? done / work.length : 0 };
}

export const kindLabels: Record<PlanItem['kind'], string> = { academic: 'Coursework', personalTask: 'Task', goal: 'Routine', event: 'Event' };

const stateLabels: Partial<Record<PlanItem['state'], string>> = {
  overdue: 'Overdue', snoozed: 'Snoozed', skipped: 'Skipped', submitted: 'Submitted', graded: 'Graded', completed: 'Done',
};
export const planStateLabel = (item: PlanItem) => stateLabels[item.state];

function dayName(date: string, today: string) {
  if (date === today) return 'today';
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
}
function clock(at: string, timeZone: string) {
  return new Date(at).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' });
}
function when(value: NonNullable<PlanItem['due']>, timeZone: string, date: string) {
  if (value.kind === 'date') return dayName(value.date, date);
  const local = localClockAt(value.at, timeZone).date;
  return local === date ? clock(value.at, timeZone) : `${dayName(local, date)}, ${clock(value.at, timeZone)}`;
}

/** "Due tomorrow, 11:59 p.m." style deadline text relative to `date` in the account zone. */
export function dueLabel(value: PlanItem['due'], timeZone: string, date: string): string {
  return value ? `Due ${when(value, timeZone, date)}` : 'No deadline';
}

/** Short human timing for one row, relative to the displayed plan date in the account zone. */
export function planTimingLabel(item: Pick<PlanItem, 'kind' | 'schedule' | 'due'>, timeZone: string, date: string): string | undefined {
  const parts: string[] = [];
  if (item.schedule && !(item.schedule.kind === 'date' && item.schedule.date === date)) {
    parts.push(`${item.kind === 'event' ? 'Starts' : 'Planned'} ${when(item.schedule, timeZone, date)}`);
  } else if (item.schedule?.kind === 'date' && !item.due) parts.push('Planned for today');
  if (item.due) parts.push(`${item.kind === 'event' ? 'Ends' : 'Due'} ${when(item.due, timeZone, date)}`);
  const text = parts.join(' · ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : undefined;
}

/** Greeting follows the account zone so travel or device settings don't change it. */
export function greeting(now: number, timeZone: string) {
  const hour = Number(new Date(now).toLocaleString('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }));
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export const isAccountToday = (date: string, timeZone: string, now: number) => date === localDateAt(new Date(now).toISOString(), timeZone);
