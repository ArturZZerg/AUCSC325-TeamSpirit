import { dateSchema, focusHistorySchema, instantSchema } from '@campusflow/contracts';
import { addCalendarDays, localDateAt, summarizeFocusWeek } from '@campusflow/domain';

export function studyTimeLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remaining = seconds % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', remaining || (!hours && !minutes) ? `${remaining}s` : ''].filter(Boolean).join(' ');
}
/** Reports only the account/calendar window proven by a validated history read. */
export function buildStudyReport(raw: unknown, accountId: string, timeZone: string, start: string, now: string) {
  const result = focusHistorySchema.safeParse(raw);
  if (!result.success || !dateSchema.safeParse(start).success || !instantSchema.safeParse(now).success) return undefined;
  const history = result.data, through = addCalendarDays(start, 6), previousStart = addCalendarDays(start, -7);
  if (history.accountId !== accountId || history.timeZone !== timeZone || history.from > start || history.through < through
    || new Set(history.sessions.map(row => row.id)).size !== history.sessions.length
    || history.sessions.some(row => { const date = localDateAt(row.endedAt, timeZone); return date < history.from || date > history.through; })) return undefined;
  return { ...summarizeFocusWeek(history.sessions, start, timeZone, now), capturedAt: history.capturedAt,
    previous: history.from <= previousStart ? summarizeFocusWeek(history.sessions, previousStart, timeZone, now) : undefined };
}

type CourseRef = { id: string; name: string; code: string | null; color?: string | null };
type TaskRef = { id: string; courseId?: string | null; studyPlanId?: string | null };
type PlanRef = { id: string; academicItem: { courseId: string | null } | null };

/**
 * Rolls recorded per-task time up to courses: a task's own course first, otherwise
 * its study plan's coursework course. Unknown or course-less time stays in `other`.
 */
export function studyTimeByCourse<C extends CourseRef>(rows: readonly { taskId: string | null; seconds: number }[], tasks: readonly TaskRef[] | undefined,
  plans: readonly PlanRef[] | undefined, courses: readonly C[] | undefined) {
  const taskById = new Map(tasks?.map(task => [task.id, task]) ?? []), planById = new Map(plans?.map(plan => [plan.id, plan]) ?? []);
  const courseById = new Map(courses?.map(course => [course.id, course]) ?? []);
  const totals = new Map<string, number>(); let other = 0;
  for (const row of rows) {
    const task = row.taskId ? taskById.get(row.taskId) : undefined;
    const courseId = task?.courseId ?? (task?.studyPlanId ? planById.get(task.studyPlanId)?.academicItem?.courseId ?? null : null);
    if (courseId && courseById.has(courseId)) totals.set(courseId, (totals.get(courseId) ?? 0) + row.seconds);
    else other += row.seconds;
  }
  return { courses: [...totals].map(([id, seconds]) => ({ course: courseById.get(id)!, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.course.name.localeCompare(b.course.name)), other };
}
