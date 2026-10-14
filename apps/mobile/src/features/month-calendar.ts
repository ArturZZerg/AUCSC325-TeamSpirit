import { addCalendarDays, localDateAt, taskOccursOn, taskOccurrenceTiming } from '@campusflow/domain';
import type { AcademicItem, CampusEvent, PersonalTask } from '@/lib/types';

export type CalendarKind = 'academic' | 'personalTask' | 'event';
export type CalendarEntry = {
  key: string; kind: CalendarKind; title: string; date: string; done: boolean;
  /** Sort key within the day: timed values by instant, date-only values last. */
  at: number; role: 'due' | 'planned' | 'starts';
  timing: { kind: 'date' } | { kind: 'instant'; at: string };
};

const dateOf = (value: { kind: 'date'; date: string } | { kind: 'instant'; at: string }, timeZone: string) =>
  value.kind === 'date' ? value.date : localDateAt(value.at, timeZone);
const sortAt = (value: { kind: 'date'; date: string } | { kind: 'instant'; at: string }) => value.kind === 'instant' ? Date.parse(value.at) : Number.MAX_SAFE_INTEGER;

/** Whole Monday–Sunday weeks covering the month of `month` (any date in it). */
export function monthGrid(month: string, today: string) {
  const first = `${month.slice(0, 7)}-01`, last = addCalendarDays(shiftMonth(first, 1), -1);
  const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const start = addCalendarDays(first, 1 - weekday(first)), end = addCalendarDays(last, 7 - weekday(last));
  const weeks: { date: string; inMonth: boolean; isToday: boolean }[][] = [];
  for (let cursor = start; cursor <= end; cursor = addCalendarDays(cursor, 1)) {
    if (weekday(cursor) === 1) weeks.push([]);
    weeks.at(-1)!.push({ date: cursor, inMonth: cursor.slice(0, 7) === first.slice(0, 7), isToday: cursor === today });
  }
  return { start, end, weeks };
}

export const shiftMonth = (month: string, months: number) => {
  const [year, value] = month.split('-').map(Number);
  const index = year * 12 + value - 1 + months;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`;
};

/**
 * Dated entries between `from` and `through` (inclusive, account calendar).
 * One-time tasks appear on their scheduled day and their deadline day; repeating
 * tasks on each occurrence; coursework on its deadline; saved events on their start.
 * Routines are excluded: they would mark nearly every day.
 */
export function calendarEntries({ tasks, academic, events, from, through, timeZone }: {
  tasks?: readonly PersonalTask[]; academic?: readonly AcademicItem[]; events?: readonly CampusEvent[]; from: string; through: string; timeZone: string;
}) {
  const entries: CalendarEntry[] = [];
  const inRange = (date: string) => date >= from && date <= through;
  for (const task of tasks ?? []) {
    if (task.recurrence) {
      for (let date = from; date <= through; date = addCalendarDays(date, 1)) {
        if (!taskOccursOn({ recurrence: task.recurrence, due: task.due ?? undefined, scheduled: task.scheduled ?? undefined }, date, timeZone)) continue;
        const timing = taskOccurrenceTiming({ ...task, due: task.due ?? undefined, scheduled: task.scheduled ?? undefined, recurrence: task.recurrence,
          completedAt: undefined, snoozedUntil: undefined, mainGoalDate: undefined }, date, timeZone);
        const value = timing.scheduled ?? timing.due;
        entries.push({ key: `task:${task.id}:${date}`, kind: 'personalTask', title: task.title, date, done: false, at: value ? sortAt(value) : Number.MAX_SAFE_INTEGER,
          role: timing.scheduled ? 'planned' : 'due', timing: value ?? { kind: 'date' } });
      }
      continue;
    }
    const scheduled = task.scheduled ? dateOf(task.scheduled, timeZone) : undefined, due = task.due ? dateOf(task.due, timeZone) : undefined;
    if (task.scheduled && scheduled && inRange(scheduled) && scheduled !== due) entries.push({ key: `task:${task.id}:planned`, kind: 'personalTask', title: task.title,
      date: scheduled, done: !!task.completedAt, at: sortAt(task.scheduled), role: 'planned', timing: task.scheduled });
    if (task.due && due && inRange(due)) entries.push({ key: `task:${task.id}:due`, kind: 'personalTask', title: task.title,
      date: due, done: !!task.completedAt, at: sortAt(task.due), role: 'due', timing: task.due });
  }
  for (const item of academic ?? []) {
    const due = item.due ? dateOf(item.due, timeZone) : undefined;
    if (item.due && due && inRange(due)) entries.push({ key: `academic:${item.id}`, kind: 'academic', title: item.title, date: due,
      done: item.submissionState === 'submitted' || item.submissionState === 'graded', at: sortAt(item.due), role: 'due', timing: item.due });
  }
  for (const event of events ?? []) {
    if (event.saved !== true) continue;
    const timing = event.timing.kind === 'timed' ? { kind: 'instant' as const, at: event.timing.startsAt } : { kind: 'date' as const, date: event.timing.startDate };
    const date = dateOf(timing, timeZone);
    if (inRange(date)) entries.push({ key: `event:${event.id}`, kind: 'event', title: event.title, date, done: false, at: sortAt(timing), role: 'starts', timing });
  }
  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
  for (const list of byDate.values()) list.sort((a, b) => Number(a.done) - Number(b.done) || a.at - b.at || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
  return byDate;
}
