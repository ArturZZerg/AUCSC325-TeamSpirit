import { Temporal } from '@js-temporal/polyfill';

export type DateOnly = string;
export type TimedOrDate = { kind: 'instant'; at: string } | { kind: 'date'; date: DateOnly };
export type Priority = 'low' | 'medium' | 'high';
export type TaskState = 'upcoming' | 'today' | 'completed' | 'overdue' | 'skipped' | 'snoozed' | 'submitted' | 'graded';
export type Recurrence = { frequency: 'daily'; interval?: number } | { frequency: 'weekly'; weekdays: number[]; interval?: number };
export type GoalSchedule = { kind: 'daily' } | { kind: 'weekly'; weekdays: number[] } | { kind: 'weeklyTarget'; target: number };
export interface PersonalTask { id: string; title: string; priority: Priority; due?: TimedOrDate; scheduled?: TimedOrDate; recurrence?: Recurrence; completedAt?: string; completedOccurrenceKeys?: DateOnly[]; snoozedUntil?: string; mainGoalDate?: DateOnly; }
export interface AcademicItem { id: string; title: string; due?: TimedOrDate; submissionState?: 'unsubmitted' | 'submitted' | 'graded' | 'missing'; mainGoalDate?: DateOnly; }
export interface Goal { id: string; title: string; priority?: Priority; schedule: GoalSchedule; timeZone: string; pausedAt?: string; snoozedUntil?: string; }
export interface GoalCompletion { goalId: string; occurrenceKey: DateOnly; state: 'completed' | 'skipped'; completedAt?: string; }
export type EventTiming = { kind: 'timed'; startsAt: string; endsAt?: string } | { kind: 'allDay'; startDate: DateOnly; endDateExclusive: DateOnly };
export interface Event { id: string; title: string; timing: EventTiming; }
export interface SavedEvent { eventId: string; includedInPlan: boolean; }
export interface PlanItem { key: string; kind: 'academic' | 'personalTask' | 'goal' | 'event'; entityId: string; occurrenceKey?: DateOnly; title: string; schedule?: TimedOrDate; due?: TimedOrDate; state: TaskState; isMainGoal: boolean; priority?: Priority; }
export interface TodayInput { date: DateOnly; timeZone: string; now: string; personalTasks: PersonalTask[]; academicItems: AcademicItem[]; goals: Goal[]; goalCompletions: GoalCompletion[]; events: Event[]; savedEvents: SavedEvent[]; }
export interface TodayPlan { items: PlanItem[]; upcoming: PlanItem[]; campusEvents: Event[]; }

const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const plainDate = (date: DateOnly) => Temporal.PlainDate.from(date);
const zonedStart = (date: DateOnly, timeZone: string) => plainDate(date).toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from('00:00') });
export const dayBounds = (date: DateOnly, timeZone: string): { start: string; end: string } => { const start = zonedStart(date, timeZone); return { start: start.toInstant().toString(), end: start.add({ days: 1 }).toInstant().toString() }; };
export const localDateAt = (instant: string, timeZone: string): DateOnly => Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDate().toString();
export const overlapsDay = (startAt: string, endAt: string | undefined, date: DateOnly, timeZone: string): boolean => {
  const bounds = dayBounds(date, timeZone); const start = Temporal.Instant.from(startAt); const end = Temporal.Instant.from(endAt ?? startAt);
  if (Temporal.Instant.compare(start, end) === 0) return Temporal.Instant.compare(start, Temporal.Instant.from(bounds.start)) >= 0 && Temporal.Instant.compare(start, Temporal.Instant.from(bounds.end)) < 0;
  return Temporal.Instant.compare(start, Temporal.Instant.from(bounds.end)) < 0 && Temporal.Instant.compare(end, Temporal.Instant.from(bounds.start)) > 0;
};
const compareDate = (a: DateOnly, b: DateOnly) => Temporal.PlainDate.compare(plainDate(a), plainDate(b));
const occursOn = (recurrence: Recurrence | undefined, anchor: DateOnly | undefined, date: DateOnly): boolean => {
  if (!recurrence) return anchor === date;
  if (!anchor || compareDate(date, anchor) < 0) return false;
  if (recurrence.frequency === 'daily') return plainDate(anchor).until(plainDate(date), { largestUnit: 'days' }).days % (recurrence.interval ?? 1) === 0;
  const days = plainDate(anchor).until(plainDate(date), { largestUnit: 'days' }).days;
  return recurrence.weekdays.includes(plainDate(date).dayOfWeek) && Math.floor(days / 7) % (recurrence.interval ?? 1) === 0;
};
export const goalOccursOn = (goal: Goal, date: DateOnly): boolean => goal.schedule.kind === 'daily' ? true : goal.schedule.kind === 'weekly' ? goal.schedule.weekdays.includes(plainDate(date).dayOfWeek) : false;
export const isOverdue = (due: TimedOrDate | undefined, now: string, timeZone: string, terminal = false): boolean => {
  if (!due || terminal) return false;
  if (due.kind === 'instant') return Temporal.Instant.compare(Temporal.Instant.from(due.at), Temporal.Instant.from(now)) < 0;
  return compareDate(due.date, localDateAt(now, timeZone)) < 0;
};
export const wasOverdueBeforeDay = (due: TimedOrDate | undefined, date: DateOnly, timeZone: string): boolean => {
  if (!due) return false;
  return compareDate(due.kind === 'date' ? due.date : localDateAt(due.at, timeZone), date) < 0;
};
export const temporalState = (input: { due?: TimedOrDate; scheduled?: TimedOrDate; completedAt?: string; snoozedUntil?: string; submissionState?: AcademicItem['submissionState']; now: string; date: DateOnly; timeZone: string }): TaskState => {
  if (input.completedAt) return 'completed'; if (input.submissionState === 'graded') return 'graded'; if (input.submissionState === 'submitted') return 'submitted';
  if (isOverdue(input.due, input.now, input.timeZone, false)) return 'overdue';
  if (input.snoozedUntil && Temporal.Instant.compare(Temporal.Instant.from(input.snoozedUntil), Temporal.Instant.from(input.now)) > 0) return 'snoozed';
  const relevant = input.scheduled ?? input.due;
  return relevant && (relevant.kind === 'date' ? relevant.date === input.date : localDateAt(relevant.at, input.timeZone) === input.date) ? 'today' : 'upcoming';
};
export const reminderFireAt = (target: TimedOrDate, leadMinutes: number, timeZone: string): string => {
  const occurrence = target.kind === 'instant' ? Temporal.Instant.from(target.at) : zonedStart(target.date, timeZone).toInstant();
  return occurrence.subtract({ minutes: leadMinutes }).toString();
};
export const allDayEventOverlapsDay = (startDate: DateOnly, endDateExclusive: DateOnly, date: DateOnly): boolean => compareDate(startDate, date) <= 0 && compareDate(date, endDateExclusive) < 0;
const inDay = (value: TimedOrDate | undefined, date: DateOnly, zone: string) => value ? value.kind === 'date' ? value.date === date : localDateAt(value.at, zone) === date : false;
const timestamp = (item: PlanItem, zone: string): string | undefined => { const value = item.schedule ?? item.due; return value?.kind === 'instant' ? value.at : value?.kind === 'date' ? zonedStart(value.date, zone).toInstant().toString() : undefined; };
const sortItems = (zone: string) => (a: PlanItem, b: PlanItem): number => {
  if (a.isMainGoal !== b.isMainGoal) return a.isMainGoal ? -1 : 1;
  if ((a.state === 'overdue') !== (b.state === 'overdue')) return a.state === 'overdue' ? -1 : 1;
  const aTimed = (a.schedule ?? a.due)?.kind === 'instant', bTimed = (b.schedule ?? b.due)?.kind === 'instant';
  if (aTimed !== bTimed) return aTimed ? -1 : 1;
  const at = timestamp(a, zone), bt = timestamp(b, zone); if (at && bt && at !== bt) return at.localeCompare(bt);
  const p = (a.priority ? priorityRank[a.priority] : 3) - (b.priority ? priorityRank[b.priority] : 3); return p || a.key.localeCompare(b.key);
};
export const composeToday = (input: TodayInput): TodayPlan => {
  const items: PlanItem[] = [];
  const upcoming: PlanItem[] = [];
  const add = (item: PlanItem, today: boolean) => (today ? items : upcoming).push(item);
  for (const task of input.personalTasks) {
    const anchor = task.scheduled?.kind === 'instant' ? localDateAt(task.scheduled.at, input.timeZone) : task.scheduled?.kind === 'date' ? task.scheduled.date : task.due?.kind === 'instant' ? localDateAt(task.due.at, input.timeZone) : task.due?.kind === 'date' ? task.due.date : undefined;
    const recurringToday = occursOn(task.recurrence, anchor, input.date);
    const completed = task.recurrence ? task.completedOccurrenceKeys?.includes(input.date) : Boolean(task.completedAt);
    const today = recurringToday || inDay(task.scheduled, input.date, input.timeZone) || inDay(task.due, input.date, input.timeZone) || task.mainGoalDate === input.date || Boolean(task.completedAt && localDateAt(task.completedAt, input.timeZone) === input.date) || (!completed && wasOverdueBeforeDay(task.due, input.date, input.timeZone));
    const occurrenceSchedule = task.recurrence ? { kind: 'date' as const, date: input.date } : task.scheduled;
    const item: PlanItem = { key: `personalTask:${task.id}${task.recurrence ? `:${input.date}` : ''}`, kind: 'personalTask', entityId: task.id, occurrenceKey: task.recurrence ? input.date : undefined, title: task.title, schedule: occurrenceSchedule, due: task.due, state: temporalState({ ...task, scheduled: occurrenceSchedule, completedAt: completed ? task.completedAt ?? input.now : undefined, now: input.now, date: input.date, timeZone: input.timeZone }), isMainGoal: task.mainGoalDate === input.date, priority: task.priority };
    add(item, today);
  }
  for (const academic of input.academicItems) {
    const terminal = academic.submissionState === 'submitted' || academic.submissionState === 'graded';
    const today = inDay(academic.due, input.date, input.timeZone) || (!terminal && wasOverdueBeforeDay(academic.due, input.date, input.timeZone)) || academic.mainGoalDate === input.date;
    add({ key: `academic:${academic.id}`, kind: 'academic', entityId: academic.id, title: academic.title, due: academic.due, state: temporalState({ ...academic, now: input.now, date: input.date, timeZone: input.timeZone }), isMainGoal: academic.mainGoalDate === input.date }, today);
  }
  for (const goal of input.goals) {
    const goalDate = localDateAt(zonedStart(input.date, input.timeZone).toInstant().toString(), goal.timeZone);
    if (!goal.pausedAt && goalOccursOn(goal, goalDate)) {
      const completion = input.goalCompletions.find(c => c.goalId === goal.id && c.occurrenceKey === goalDate);
      const snoozed = Boolean(goal.snoozedUntil && Temporal.Instant.compare(Temporal.Instant.from(goal.snoozedUntil), Temporal.Instant.from(input.now)) > 0);
      items.push({ key: `goal:${goal.id}:${goalDate}`, kind: 'goal', entityId: goal.id, occurrenceKey: goalDate, title: goal.title, state: completion?.state === 'completed' ? 'completed' : completion?.state === 'skipped' ? 'skipped' : snoozed ? 'snoozed' : 'today', isMainGoal: false, priority: goal.priority });
    }
  }
  const savedIds = new Set(input.savedEvents.filter(s => s.includedInPlan).map(s => s.eventId)); const campusEvents: Event[] = [];
  for (const event of input.events) { const overlaps = event.timing.kind === 'timed' ? overlapsDay(event.timing.startsAt, event.timing.endsAt, input.date, input.timeZone) : allDayEventOverlapsDay(event.timing.startDate, event.timing.endDateExclusive, input.date); if (overlaps) { if (savedIds.has(event.id)) items.push({ key: `event:${event.id}`, kind: 'event', entityId: event.id, title: event.title, schedule: event.timing.kind === 'timed' ? { kind: 'instant', at: event.timing.startsAt } : { kind: 'date', date: event.timing.startDate }, state: 'today', isMainGoal: false }); else campusEvents.push(event); } }
  const latestUpcoming = plainDate(input.date).add({ days: 7 });
  const upcomingSort = (a: PlanItem, b: PlanItem) => (a.due ? timestamp({ ...a, schedule: a.due, due: undefined }, input.timeZone) ?? '' : '').localeCompare(b.due ? timestamp({ ...b, schedule: b.due, due: undefined }, input.timeZone) ?? '' : '') || a.key.localeCompare(b.key);
  return { items: items.sort(sortItems(input.timeZone)), upcoming: upcoming.filter(x => x.state === 'upcoming' && (() => { const value = x.due ?? x.schedule; const dueDate = value?.kind === 'date' ? plainDate(value.date) : value?.kind === 'instant' ? plainDate(localDateAt(value.at, input.timeZone)) : undefined; return !!dueDate && Temporal.PlainDate.compare(dueDate, plainDate(input.date)) > 0 && Temporal.PlainDate.compare(dueDate, latestUpcoming) <= 0; })()).sort(upcomingSort), campusEvents: campusEvents.sort((a, b) => { const left = a.timing.kind === 'timed' ? a.timing.startsAt : a.timing.startDate; const right = b.timing.kind === 'timed' ? b.timing.startsAt : b.timing.startDate; return left.localeCompare(right) || a.id.localeCompare(b.id); }) };
};
