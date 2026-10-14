import { Temporal } from '@js-temporal/polyfill';

type DateOnly = string;
type Schedule = { kind: 'daily' } | { kind: 'weekly'; weekdays: number[] } | { kind: 'weeklyTarget'; target: number };
type CompletionRecord = { goalId: string; occurrenceKey: DateOnly; state: 'completed' | 'skipped' };
export type GoalDayStatus = 'done' | 'skipped' | 'missed' | 'open' | 'rest' | 'before';
export type GoalStreak = { unit: 'day' | 'week'; current: number; best: number };

/** History older than this is not walked; streaks are capped rather than unbounded. */
const lookbackDays = 730;
const day = (date: DateOnly) => Temporal.PlainDate.from(date);
const monday = (date: Temporal.PlainDate) => date.subtract({ days: date.dayOfWeek - 1 });

function index(goalId: string, history: readonly CompletionRecord[]) {
  const states = new Map<DateOnly, CompletionRecord['state']>();
  for (const row of history) if (row.goalId === goalId) states.set(row.occurrenceKey, row.state);
  return states;
}
const scheduledOn = (schedule: Schedule, date: Temporal.PlainDate) =>
  schedule.kind === 'daily' || (schedule.kind === 'weekly' && schedule.weekdays.includes(date.dayOfWeek));
/** Walk from goal creation, or an earlier recorded occurrence, bounded by the lookback. */
const startOf = (date: DateOnly, since: DateOnly | undefined, states: Map<DateOnly, unknown>) => {
  const floor = day(date).subtract({ days: lookbackDays });
  const first = [since, ...states.keys()].filter((value): value is DateOnly => !!value).sort()[0];
  return first && Temporal.PlainDate.compare(day(first), floor) > 0 ? day(first) : floor;
};

/**
 * Per-day status for the `count` goal-local days ending on `date`.
 * The current day is `open` until recorded; days before `since` are `before`;
 * weekly targets have no required day, so unrecorded days are `rest`, never `missed`.
 */
export function goalRecentDays(goal: { id: string; schedule: Schedule }, history: readonly CompletionRecord[], date: DateOnly, since?: DateOnly, count = 7) {
  const states = index(goal.id, history), today = day(date);
  return Array.from({ length: count }, (_, offset) => {
    const current = today.subtract({ days: count - 1 - offset }), key = current.toString(), state = states.get(key);
    const status: GoalDayStatus = since && Temporal.PlainDate.compare(current, day(since)) < 0 && !state ? 'before'
      : state === 'completed' ? 'done' : state === 'skipped' ? 'skipped'
        : goal.schedule.kind === 'weeklyTarget' || !scheduledOn(goal.schedule, current) ? 'rest'
          : key === date ? 'open' : 'missed';
    return { date: key, weekday: current.dayOfWeek, status };
  });
}

/**
 * Consecutive completed occurrences in the goal's own calendar. Skips are neutral:
 * they neither break nor extend a streak. Today's unrecorded occurrence never
 * breaks it. Weekly targets count consecutive weeks reaching the target.
 */
export function goalStreak(goal: { id: string; schedule: Schedule }, history: readonly CompletionRecord[], date: DateOnly, since?: DateOnly): GoalStreak {
  const states = index(goal.id, history), end = day(date), start = startOf(date, since, states);
  if (goal.schedule.kind === 'weeklyTarget') {
    const target = goal.schedule.target, weeks: boolean[] = [];
    for (let week = monday(start); Temporal.PlainDate.compare(week, end) <= 0; week = week.add({ days: 7 })) {
      let completed = 0;
      for (let offset = 0; offset < 7; offset++) {
        const current = week.add({ days: offset });
        if (Temporal.PlainDate.compare(current, end) <= 0 && states.get(current.toString()) === 'completed') completed++;
      }
      weeks.push(completed >= target);
    }
    // The current week is still in progress: reaching it counts, not reaching it yet doesn't break.
    const inProgress = weeks.pop() ?? false;
    return { unit: 'week', ...runs([...weeks.map(reached => reached ? 'hit' as const : 'miss' as const), inProgress ? 'hit' : 'skip']) };
  }
  const marks: ('hit' | 'miss' | 'skip')[] = [];
  for (let current = start; Temporal.PlainDate.compare(current, end) <= 0; current = current.add({ days: 1 })) {
    if (!scheduledOn(goal.schedule, current)) continue;
    const state = states.get(current.toString());
    marks.push(state === 'completed' ? 'hit' : state === 'skipped' || current.equals(end) ? 'skip' : 'miss');
  }
  return { unit: 'day', ...runs(marks) };
}

function runs(marks: readonly ('hit' | 'miss' | 'skip')[]) {
  let best = 0, run = 0;
  for (const mark of marks) {
    if (mark === 'hit') best = Math.max(best, ++run);
    else if (mark === 'miss') run = 0;
  }
  return { current: run, best };
}
