import { greeting, groupPlan, planProgress, planStateLabel, planTimingLabel } from '../src/features/today-plan';
import type { PlanItem } from '../src/lib/types';

const date = '2026-10-14', zone = 'America/Edmonton';
const base: PlanItem = { key: 'a', kind: 'personalTask', entityId: '10000000-0000-4000-8000-000000000001', occurrenceKey: null, title: 'Read',
  schedule: null, due: null, state: 'today', isMainGoal: false, priority: 'medium', allowedActions: ['complete'] };
const item = (patch: Partial<PlanItem>): PlanItem => ({ ...base, ...patch });

describe('Today plan presentation', () => {
  it('puts main goals, then overdue work, first and keeps server order otherwise', () => {
    const rows = [item({ key: '1' }), item({ key: '2', state: 'overdue' }), item({ key: '3', isMainGoal: true }), item({ key: '4' }), item({ key: '5', state: 'completed' })];
    const groups = groupPlan(rows);
    expect(groups.open.map(row => row.key)).toEqual(['3', '2', '1', '4']);
    expect(groups.done.map(row => row.key)).toEqual(['5']);
  });

  it('counts work only: events are excluded and skipped routines leave the denominator', () => {
    expect(planProgress([item({ state: 'completed' }), item({ kind: 'academic', state: 'submitted' }), item({}),
      item({ kind: 'goal', state: 'skipped' }), item({ kind: 'event' })])).toEqual({ done: 2, total: 3, ratio: 2 / 3 });
    expect(planProgress([])).toEqual({ done: 0, total: 0, ratio: 0 });
  });

  it('labels only meaningful states', () => {
    expect(planStateLabel(item({ state: 'today' }))).toBeUndefined();
    expect(planStateLabel(item({ state: 'overdue' }))).toBe('Overdue');
  });

  it('describes date-only and timed values relative to the displayed day in the account zone', () => {
    expect(planTimingLabel(item({ due: { kind: 'date', date } }), zone, date)).toBe('Due today');
    expect(planTimingLabel(item({ due: { kind: 'date', date: '2026-10-15' } }), zone, date)).toBe('Due tomorrow');
    expect(planTimingLabel(item({ schedule: { kind: 'date', date } }), zone, date)).toBe('Planned for today');
    // 05:59 UTC on the 15th is still 23:59 on the 14th in Edmonton.
    expect(planTimingLabel(item({ due: { kind: 'instant', at: '2026-10-15T05:59:00Z' } }), zone, date)).toMatch(/^Due 11:59/);
    expect(planTimingLabel(item({ due: { kind: 'instant', at: '2026-10-15T06:30:00Z' } }), zone, date)).toMatch(/^Due tomorrow, 12:30/);
    expect(planTimingLabel(item({ schedule: { kind: 'instant', at: '2026-10-14T21:00:00Z' }, due: { kind: 'date', date: '2026-10-20' } }), zone, date))
      .toMatch(/^Planned 3:00.*· Due Tue, Oct 20$/);
    expect(planTimingLabel(item({}), zone, date)).toBeUndefined();
  });

  it('greets by the account zone hour rather than the device', () => {
    expect(greeting(Date.parse('2026-10-14T15:00:00Z'), zone)).toBe('Good morning');
    expect(greeting(Date.parse('2026-10-14T21:00:00Z'), zone)).toBe('Good afternoon');
    expect(greeting(Date.parse('2026-10-15T03:00:00Z'), zone)).toBe('Good evening');
  });
});
