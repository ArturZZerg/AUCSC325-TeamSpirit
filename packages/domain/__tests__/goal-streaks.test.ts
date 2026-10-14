import { goalRecentDays, goalStreak } from '../src';

const id = 'goal-1';
const done = (...days: string[]) => days.map(occurrenceKey => ({ goalId: id, occurrenceKey, state: 'completed' as const }));
const skipped = (...days: string[]) => days.map(occurrenceKey => ({ goalId: id, occurrenceKey, state: 'skipped' as const }));
const daily = { id, schedule: { kind: 'daily' as const } };

describe('goal streaks (goal-local calendar)', () => {
  it('counts consecutive completed days and keeps an unrecorded today from breaking the run', () => {
    const history = done('2026-10-11', '2026-10-12', '2026-10-13');
    expect(goalStreak(daily, history, '2026-10-14', '2026-10-01')).toEqual({ unit: 'day', current: 3, best: 3 });
    expect(goalStreak(daily, [...history, ...done('2026-10-14')], '2026-10-14', '2026-10-01').current).toBe(4);
  });

  it('breaks on a missed scheduled day, treats skips as neutral and remembers the best run', () => {
    const history = [...done('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'), ...done('2026-10-06'),
      ...skipped('2026-10-07'), ...done('2026-10-08')];
    expect(goalStreak(daily, history, '2026-10-08', '2026-10-01')).toEqual({ unit: 'day', current: 2, best: 4 });
  });

  it('only considers selected weekdays for weekly goals', () => {
    const weekly = { id, schedule: { kind: 'weekly' as const, weekdays: [1, 3, 5] } };
    // Mon 5, Wed 7, Fri 9, Mon 12 completed; unscheduled days in between do not break the run.
    expect(goalStreak(weekly, done('2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'), '2026-10-13', '2026-10-01').current).toBe(4);
    expect(goalStreak(weekly, done('2026-10-05', '2026-10-09', '2026-10-12'), '2026-10-13', '2026-10-01').current).toBe(2);
  });

  it('counts weeks that reached a weekly target; an unfinished current week never breaks it', () => {
    const target = { id, schedule: { kind: 'weeklyTarget' as const, target: 2 } };
    const history = done('2026-09-29', '2026-09-30', '2026-10-06', '2026-10-08');
    expect(goalStreak(target, history, '2026-10-13', '2026-09-28')).toEqual({ unit: 'week', current: 2, best: 2 });
    expect(goalStreak(target, [...history, ...done('2026-10-13', '2026-10-14')], '2026-10-14', '2026-09-28').current).toBe(3);
    expect(goalStreak(target, done('2026-09-29', '2026-10-13', '2026-10-14'), '2026-10-14', '2026-09-28')).toEqual({ unit: 'week', current: 1, best: 1 });
  });

  it('counts occurrences recorded before the goal creation day', () => {
    expect(goalStreak(daily, done('2026-10-12', '2026-10-13'), '2026-10-14', '2026-10-14').current).toBe(2);
  });

  it('ignores other goals and returns zero for an empty history', () => {
    expect(goalStreak(daily, [{ goalId: 'other', occurrenceKey: '2026-10-13', state: 'completed' }], '2026-10-14')).toEqual({ unit: 'day', current: 0, best: 0 });
  });
});

describe('recent goal days', () => {
  it('distinguishes done, skipped, missed, open, rest and before-creation days', () => {
    const weekly = { id, schedule: { kind: 'weekly' as const, weekdays: [1, 2, 3, 4, 5] } };
    const days = goalRecentDays(weekly, [...done('2026-10-12'), ...skipped('2026-10-13')], '2026-10-14', '2026-10-09');
    expect(days.map(row => [row.date, row.status])).toEqual([
      ['2026-10-08', 'before'], ['2026-10-09', 'missed'], ['2026-10-10', 'rest'], ['2026-10-11', 'rest'],
      ['2026-10-12', 'done'], ['2026-10-13', 'skipped'], ['2026-10-14', 'open']]);
    expect(days[6].weekday).toBe(3);
  });
  it('never marks weekly-target days as missed', () => {
    const target = { id, schedule: { kind: 'weeklyTarget' as const, target: 3 } };
    expect(goalRecentDays(target, [], '2026-10-14', '2026-10-01').every(row => row.status === 'rest')).toBe(true);
  });
});
