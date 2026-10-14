import { dateSchema, focusHistorySchema, instantSchema, offlineSnapshotSchema } from '@campusflow/contracts';
import { localDateAt, summarizeFocusWeek } from '@campusflow/domain';
import { composeOfflineToday } from './offline-today';
import { isFinished, weekStart } from './weekly-planner';
import { buildWeeklyReview } from './weekly-review';

/** Recorded completions and the latest saved plan remain separate views. */
export function buildDayReview(raw: unknown, accountId: string, timeZone: string, date: string, now: string) {
  const parsed = offlineSnapshotSchema.safeParse(raw);
  if (!parsed.success || parsed.data.accountId !== accountId || parsed.data.timeZone !== timeZone
    || !dateSchema.safeParse(date).success || !instantSchema.safeParse(now).success || date > localDateAt(now, timeZone)) return undefined;
  const weekly = buildWeeklyReview(raw, accountId, timeZone, weekStart(date), now);
  const day = weekly?.days.find(row => row.date === date);
  if (!weekly || day?.status !== 'available') return undefined;
  const snapshot = parsed.data;
  const plan = composeOfflineToday(snapshot, accountId, timeZone, date, now);
  if (!plan) return undefined;
  const open = new Set(plan.items.filter(item => item.kind === 'personalTask' && item.occurrenceKey === null && !isFinished(item)).map(item => item.entityId));
  return { date, tasks: day.tasks, routines: day.routines,
    completed: weekly.taskCompletions.filter(row => row.date === date),
    carryover: snapshot.personalTasks.filter(task => open.has(task.id) && !task.recurrence && !task.completedAt)
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
    capturedAt: weekly.capturedAt, sourceStatus: weekly.sourceStatus };
}

/** Unknown, foreign or missing calendar coverage never becomes zero study time. */
export function buildDayStudy(raw: unknown, accountId: string, timeZone: string, date: string, now: string) {
  const parsed = focusHistorySchema.safeParse(raw);
  if (!parsed.success || !dateSchema.safeParse(date).success || !instantSchema.safeParse(now).success) return undefined;
  const history = parsed.data, cutoff = new Date(Math.min(Date.parse(now), Date.parse(history.capturedAt))).toISOString();
  if (history.accountId !== accountId || history.timeZone !== timeZone || history.from > date || history.through < date
    || date > localDateAt(cutoff, timeZone) || new Set(history.sessions.map(row => row.id)).size !== history.sessions.length
    || history.sessions.some(row => { const day = localDateAt(row.endedAt, timeZone); return day < history.from || day > history.through; })) return undefined;
  const sessions = history.sessions.filter(row => localDateAt(row.endedAt, timeZone) === date
    && Date.parse(row.endedAt) <= Date.parse(cutoff) && Date.parse(row.createdAt) <= Date.parse(cutoff));
  const report = summarizeFocusWeek(sessions, date, timeZone, cutoff);
  return { seconds: report.seconds, blocks: report.blocks, completedBlocks: report.completedBlocks,
    interruptedBlocks: report.blocks - report.completedBlocks, capturedAt: history.capturedAt };
}
