import { dateSchema, instantSchema, manualAcademicSource, offlineSnapshotSchema } from '@campusflow/contracts';
import { addCalendarDays, localDateAt } from '@campusflow/domain';
import type { AcademicItem } from '@/lib/types';
import { weekStart } from './weekly-planner';

export type RecordedCompletion = { key: string; entityId: string; title: string; at: string; date: string; occurrenceKey: string | null };
export const courseworkReviewState = (item: AcademicItem) => item.source === manualAcademicSource && item.submissionState === 'submitted'
  ? 'Done' : item.submissionState === 'submitted' ? 'Submitted' : item.submissionState === 'graded' ? 'Graded'
    : item.submissionState === 'missing' ? 'Missing' : item.submissionState === 'unsubmitted' ? 'Open' : 'Status unavailable';

/** Recorded work, not a reconstruction of historical schedules or submission times. */
export function buildWeeklyReview(value: unknown, accountId: string, timeZone: string, start: string, now: string) {
  const parsed = offlineSnapshotSchema.safeParse(value);
  if (!parsed.success || !dateSchema.safeParse(start).success || !instantSchema.safeParse(now).success || weekStart(start) !== start) return undefined;
  const snapshot = parsed.data;
  if (snapshot.accountId !== accountId || snapshot.timeZone !== timeZone) return undefined;
  const cutoff = Math.min(Date.parse(now), Date.parse(snapshot.capturedAt));
  const currentDate = localDateAt(now, timeZone);
  const capturedDate = localDateAt(new Date(cutoff).toISOString(), timeZone);
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addCalendarDays(start, offset);
    const status = date > currentDate ? 'future' as const : date > capturedDate || date < snapshot.coverage.from || date > snapshot.coverage.through
      ? 'unavailable' as const : 'available' as const;
    return { date, status, tasks: 0, routines: 0 };
  });
  const available = new Set(days.filter(day => day.status === 'available').map(day => day.date));
  const eligibleDate = (at: string) => Date.parse(at) <= cutoff && available.has(localDateAt(at, timeZone));
  const taskById = new Map(snapshot.personalTasks.map(task => [task.id, task]));
  const tasks = new Map<string, RecordedCompletion>();
  for (const task of snapshot.personalTasks) if (!task.recurrence && task.completedAt && eligibleDate(task.completedAt)) {
    tasks.set(task.id, { key: task.id, entityId: task.id, title: task.title, at: task.completedAt, date: localDateAt(task.completedAt, timeZone), occurrenceKey: null });
  }
  for (const row of snapshot.taskCompletions) {
    const task = taskById.get(row.taskId);
    if (!task || !eligibleDate(row.completedAt)) continue;
    const key = `${task.id}:${row.occurrenceKey}`;
    tasks.set(key, { key, entityId: task.id, title: task.title, at: row.completedAt, date: localDateAt(row.completedAt, timeZone), occurrenceKey: row.occurrenceKey });
  }
  const goalById = new Map(snapshot.goals.map(goal => [goal.id, goal]));
  const checkIns = new Map<string, RecordedCompletion>();
  for (const row of snapshot.goalCompletions) {
    const goal = goalById.get(row.goalId);
    if (!goal || row.state !== 'completed' || !row.completedAt || !eligibleDate(row.completedAt)) continue;
    const key = `${goal.id}:${row.occurrenceKey}`;
    checkIns.set(key, { key, entityId: goal.id, title: goal.title, at: row.completedAt, date: localDateAt(row.completedAt, timeZone), occurrenceKey: row.occurrenceKey });
  }
  for (const day of days) {
    day.tasks = [...tasks.values()].filter(row => row.date === day.date).length;
    day.routines = [...checkIns.values()].filter(row => row.date === day.date).length;
  }
  const routines = snapshot.goals.flatMap(goal => {
    const completed = [...checkIns.values()].filter(row => row.entityId === goal.id).length;
    return completed ? [{ goal, completed }] : [];
  }).sort((a, b) => b.completed - a.completed || a.goal.title.localeCompare(b.goal.title));
  const coursework = snapshot.academicItems.flatMap(item => {
    const date = item.due?.kind === 'date' ? item.due.date : item.due?.kind === 'instant' ? localDateAt(item.due.at, timeZone) : undefined;
    return date && available.has(date) && !item.source.includes('fixture') ? [{ item, date, state: courseworkReviewState(item) }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.item.title.localeCompare(b.item.title));
  return { days, taskCompletions: [...tasks.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key)),
    routineCompletions: checkIns.size, routines, coursework,
    settledCoursework: coursework.filter(row => ['Done', 'Submitted', 'Graded'].includes(row.state)).length,
    coveredDays: available.size, elapsedDays: days.filter(day => day.status !== 'future').length,
    capturedAt: snapshot.capturedAt, sourceStatus: snapshot.sourceStatus,
    hasDemoCoursework: snapshot.academicItems.some(item => item.source.includes('fixture')) };
}
