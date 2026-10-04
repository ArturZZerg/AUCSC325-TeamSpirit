import { localDateAt, weeklyGoalProgress } from '../src';
import type { Goal, GoalCompletion } from '../src';
const goal: Goal = { id: 'goal', title: 'Gym', timeZone: 'America/Edmonton', schedule: { kind: 'weeklyTarget', target: 3 } };
const row = (occurrenceKey: string, state: GoalCompletion['state'] = 'completed', goalId = goal.id): GoalCompletion => ({ goalId, occurrenceKey, state });
describe('weekly target progress (ToR 3.4, 5)', () => {
  it.each([
    ['2025-03-03', '2025-03-03', '2025-03-10'],
    ['2025-03-09', '2025-03-03', '2025-03-10'],
    ['2025-03-10', '2025-03-10', '2025-03-17'],
    ['2025-01-01', '2024-12-30', '2025-01-06'],
    ['2024-03-01', '2024-02-26', '2024-03-04'],
  ])('uses a calendar week containing %s', (date, weekStart, endExclusive) => {
    expect(weeklyGoalProgress(goal, [], date)).toEqual({ weekStart, endExclusive, completed: 0, target: 3, reached: false });
  });
  it('counts unique completed dates through today, excluding skips, other goals and dates outside the week', () => {
    const history = [row('2025-03-02'), row('2025-03-03'), row('2025-03-03'), row('2025-03-04', 'skipped'), row('2025-03-05', 'completed', 'other'), row('2025-03-06'), row('2025-03-07'), row('2025-03-10')];
    expect(weeklyGoalProgress(goal, history, '2025-03-06')).toMatchObject({ completed: 2, reached: false });
  });
  it('uses occurrence dates even when the recording instant is in another week', () => {
    const recorded: GoalCompletion = { ...row('2025-03-03'), completedAt: '2025-03-10T10:00:00Z' };
    expect(weeklyGoalProgress(goal, [recorded], '2025-03-09')).toMatchObject({ completed: 1 });
  });
  it('marks a reached target and retains additional completions', () => {
    const history = ['03', '04', '05', '06'].map(day => row(`2025-03-${day}`));
    expect(weeklyGoalProgress(goal, history, '2025-03-05')).toMatchObject({ completed: 3, reached: true });
    expect(weeklyGoalProgress(goal, history, '2025-03-06')).toMatchObject({ completed: 4, reached: true });
  });
  it.each(['2025-03-10T05:59:59Z', '2025-11-03T06:59:59Z'])('uses goal-local week boundaries across DST at %s', now => {
    const date = localDateAt(now, goal.timeZone);
    const monday = localDateAt(new Date(Date.parse(now) + 1000).toISOString(), goal.timeZone);
    expect(weeklyGoalProgress(goal, [row(date)], date)?.completed).toBe(1);
    expect(weeklyGoalProgress(goal, [row(date)], monday)?.completed).toBe(0);
  });
  it.each([{ kind: 'daily' as const }, { kind: 'weekly' as const, weekdays: [1] }])('does not assign a target to $kind schedules', schedule => {
    expect(weeklyGoalProgress({ ...goal, schedule }, [], '2025-03-03')).toBeUndefined();
  });
});
