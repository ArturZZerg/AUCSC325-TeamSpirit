import type { StudyPlan } from '@campusflow/contracts';
import { dayBounds, localDateAt } from '@campusflow/domain';
import type { PersonalTask } from '@/lib/types';

export type StudyPlanView = 'active' | 'finished' | 'archived';
export function sessionNeedsMoving(task: PersonalTask, date: string, now: string): boolean {
  if (task.completedAt || !task.scheduled) return false;
  return task.scheduled.kind === 'date' ? task.scheduled.date < date
    : Date.parse(task.scheduled.at) + (task.estimatedMinutes ?? 0) * 60_000 <= Date.parse(now);
}
export function studyPlanProgress(plan: StudyPlan, timeZone: string, now: string) {
  const date = localDateAt(now, timeZone);
  const open = plan.tasks.filter(task => !task.completedAt);
  const needsMoving = open.filter(task => sessionNeedsMoving(task, date, now));
  const scheduledAt = (task: PersonalTask) => !task.scheduled ? Infinity : task.scheduled.kind === 'instant'
    ? Date.parse(task.scheduled.at) : Date.parse(dayBounds(task.scheduled.date, timeZone).start);
  const next = [...open].sort((a, b) => scheduledAt(a) - scheduledAt(b) || plan.tasks.indexOf(a) - plan.tasks.indexOf(b))[0];
  const total = plan.tasks.length, completed = total - open.length;
  return { total, completed, open, needsMoving, next, percentage: total ? Math.round(completed / total * 100) : 0,
    finished: total > 0 && !open.length,
    remainingMinutes: open.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0),
    unestimated: open.filter(task => task.estimatedMinutes === null).length,
    deadline: plan.academicItem ? plan.academicItem.due : plan.deadlineWhenPlanned,
    deadlineChanged: !!plan.academicItem && timingKey(plan.academicItem.due) !== timingKey(plan.deadlineWhenPlanned),
  };
}
const timingKey = (timing: PersonalTask['due']) => !timing ? '' : timing.kind === 'date' ? `date:${timing.date}` : `instant:${Date.parse(timing.at)}`;
export function filterStudyPlans(plans: StudyPlan[], search: string, view: StudyPlanView, timeZone: string, now: string) {
  const needle = search.trim().toLowerCase();
  return plans.filter(plan => {
    const progress = studyPlanProgress(plan, timeZone, now);
    const matchesView = view === 'archived' ? !!plan.archivedAt : !plan.archivedAt && (view === 'finished' ? progress.finished : !progress.finished);
    return matchesView && (!needle || [plan.title, plan.academicItem?.title, ...plan.tasks.map(task => task.title)].some(value => value?.toLowerCase().includes(needle)));
  });
}
