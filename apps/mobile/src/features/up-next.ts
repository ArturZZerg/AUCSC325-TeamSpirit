import { localClockAt } from '@campusflow/domain';
import type { PlanItem } from '@/lib/types';
import type { UpcomingExam } from './exams';

export type UpNext =
  | { kind: 'item'; item: PlanItem; reason: string }
  | { kind: 'exam'; exam: UpcomingExam; reason: string };

const open = (item: PlanItem) => (item.kind === 'personalTask' || item.kind === 'academic')
  && !['completed', 'submitted', 'graded', 'skipped', 'snoozed'].includes(item.state);
const clock = (at: string, timeZone: string) => new Date(at).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' });
const dueAt = (item: PlanItem) => item.due?.kind === 'instant' ? Date.parse(item.due.at) : Number.MAX_SAFE_INTEGER;
/** Local calendar order: an earlier day first, and within a day timed deadlines before date-only ones. */
const dueKey = (item: PlanItem, timeZone: string) => item.due?.kind === 'instant'
  ? (({ date, time }) => `${date}T${time}`)(localClockAt(item.due.at, timeZone)) : item.due ? `${item.due.date}T99` : '9999';

/**
 * One suggested next step for the displayed current day, in priority order:
 * overdue work, the Main Goal, a timed deadline later today, an exam within
 * three days, then anything else due today (high priority first). Routines and
 * events are excluded; nothing is suggested for other days or when all is done.
 */
export function upNext(items: readonly PlanItem[], exams: readonly UpcomingExam[], date: string, timeZone: string, now: number): UpNext | undefined {
  const candidates = items.filter(open);
  const overdue = candidates.filter(item => item.state === 'overdue').sort((a, b) => dueKey(a, timeZone).localeCompare(dueKey(b, timeZone)))[0];
  if (overdue) {
    const due = overdue.due?.kind === 'instant' ? localClockAt(overdue.due.at, timeZone).date : overdue.due?.date;
    const label = due ? new Date(`${due}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }) : undefined;
    return { kind: 'item', item: overdue, reason: label ? `Overdue since ${label}` : 'Overdue' };
  }
  const main = candidates.find(item => item.isMainGoal);
  if (main) return { kind: 'item', item: main, reason: 'Your Main Goal for today' };
  const timed = candidates.filter(item => item.due?.kind === 'instant' && Date.parse(item.due.at) > now
    && localClockAt(item.due.at, timeZone).date === date).sort((a, b) => dueAt(a) - dueAt(b))[0];
  if (timed && timed.due?.kind === 'instant') return { kind: 'item', item: timed, reason: `Due today at ${clock(timed.due.at, timeZone)}` };
  const exam = exams.find(row => row.daysLeft <= 3);
  if (exam) return { kind: 'exam', exam, reason: exam.daysLeft === 0 ? 'Exam today' : exam.daysLeft === 1 ? 'Exam tomorrow' : `Exam in ${exam.daysLeft} days` };
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const dueToday = candidates.filter(item => item.due?.kind === 'date' && item.due.date === date)
    .sort((a, b) => rank[a.priority ?? 'medium'] - rank[b.priority ?? 'medium'] || a.title.localeCompare(b.title))[0];
  if (dueToday) return { kind: 'item', item: dueToday, reason: dueToday.priority === 'high' ? 'High priority, due today' : 'Due today' };
  const planned = candidates.filter(item => item.kind === 'personalTask')
    .sort((a, b) => rank[a.priority ?? 'medium'] - rank[b.priority ?? 'medium'] || a.title.localeCompare(b.title))[0];
  return planned ? { kind: 'item', item: planned, reason: planned.priority === 'high' ? 'High priority in today’s plan' : 'Next in today’s plan' } : undefined;
}
