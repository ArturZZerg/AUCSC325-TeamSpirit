import type { StudyPlan } from '@campusflow/contracts';
import { dayBounds, isOverdue, localDateAt } from '@campusflow/domain';
import type { AcademicItem, PersonalTask } from '@/lib/types';
import { academicAttention, academicDueDate, academicFinished } from './academic-overview';
import { sessionNeedsMoving } from './preparation-progress';

export const workloadSections = ['attention', 'unscheduled', 'coursework', 'today', 'later'] as const;
export type WorkloadSection = typeof workloadSections[number];
export type WorkloadView = 'queue' | 'today' | 'later';
export type WorkloadRow =
  | { kind: 'task'; task: PersonalTask; plan?: StudyPlan; section: WorkloadSection; readyToday: boolean; overdue: boolean; earlier: boolean; snoozed: boolean }
  | { kind: 'academic'; item: AcademicItem; plan?: StudyPlan; section: WorkloadSection; readyToday: boolean; canPrepare: boolean };
export type WorkloadInput = {
  tasks?: PersonalTask[]; academic?: AcademicItem[]; plans?: StudyPlan[]; plansCurrent: boolean;
};

/** Presentation grouping only. Records retain their own state and owning actions. */
export function workloadInbox(input: WorkloadInput, timeZone: string, now: string) {
  const today = localDateAt(now, timeZone), rows: WorkloadRow[] = [];
  const plans = [...(input.plans ?? [])].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt)
    || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const byId = new Map(plans.map(plan => [plan.id, plan]));
  let deferred = 0, recurring = 0;
  for (const task of input.tasks ?? []) {
    // A recurring task's completedAt is not its current occurrence state.
    if (task.recurrence) { recurring++; continue; }
    if (task.completedAt) continue;
    const overdue = isOverdue(task.due ?? undefined, now, timeZone);
    const snoozed = !!task.snoozedUntil && Date.parse(task.snoozedUntil) > Date.parse(now);
    if (snoozed && !overdue) { deferred++; continue; }
    const earlier = sessionNeedsMoving(task, today, now);
    const scheduledDate = task.scheduled?.kind === 'date' ? task.scheduled.date
      : task.scheduled?.kind === 'instant' ? localDateAt(task.scheduled.at, timeZone) : undefined;
    const section = overdue || earlier ? 'attention' : !task.scheduled ? 'unscheduled'
      : scheduledDate! <= today ? 'today' : 'later';
    // /tasks owns task membership and current fields; old embedded plan tasks
    // cannot resurrect a removed session or replace a newer completion.
    const plan = task.studyPlanId ? byId.get(task.studyPlanId) : undefined;
    const dueDate = task.due?.kind === 'date' ? task.due.date : task.due?.kind === 'instant' ? localDateAt(task.due.at, timeZone) : undefined;
    rows.push({ kind: 'task', task, plan, section, overdue, earlier, snoozed,
      readyToday: section === 'today' || dueDate === today || task.mainGoalDate === today });
  }
  for (const item of input.academic ?? []) {
    if (academicFinished(item)) continue;
    const plan = plans.find(value => value.academicItemId === item.id);
    const section = academicAttention(item, timeZone, now) ? 'attention' : !plan ? 'coursework'
      : academicDueDate(item, timeZone) === today ? 'today' : 'later';
    // Saved or unavailable plan lists cannot prove that no plan exists.
    rows.push({ kind: 'academic', item, plan, section, canPrepare: !plan && input.plansCurrent,
      readyToday: academicDueDate(item, timeZone) === today || item.mainGoalDate === today });
  }
  const count = (section: WorkloadSection) => rows.filter(row => row.section === section).length;
  return { rows, deferred, recurring, complete: input.tasks !== undefined && input.academic !== undefined && input.plans !== undefined,
    attention: count('attention'), unscheduled: count('unscheduled'), coursework: rows.filter(row => row.kind === 'academic' && row.canPrepare).length,
  };
}

export function filterWorkload(rows: WorkloadRow[], view: WorkloadView, search: string, timeZone: string) {
  const needle = search.trim().toLowerCase();
  const timingOrder = (row: WorkloadRow) => {
    const timing = row.kind === 'task' ? row.task.due ?? row.task.scheduled : row.item.due;
    return timing?.kind === 'instant' ? Date.parse(timing.at) : timing?.kind === 'date' ? Date.parse(dayBounds(timing.date, timeZone).start) : Infinity;
  };
  const identity = (row: WorkloadRow) => row.kind === 'task' ? row.task : row.item;
  return workloadSections.map(section => ({ section, rows: rows.filter(row => (view === 'today' ? section === 'today' && row.readyToday : row.section === section)
    && (view === 'queue' ? ['attention', 'unscheduled', 'coursework'].includes(section) : section === view)
    && (!needle || [identity(row).title, row.plan?.title, row.kind === 'task' ? row.task.category : row.item.kind]
      .some(value => value?.toLowerCase().includes(needle))))
    .sort((a, b) => timingOrder(a) - timingOrder(b) || identity(a).title.localeCompare(identity(b).title) || identity(a).id.localeCompare(identity(b).id)),
  })).filter(group => group.rows.length);
}
