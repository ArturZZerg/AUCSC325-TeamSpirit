import { calendarEntries, monthGrid, shiftMonth } from '../src/features/month-calendar';
import type { AcademicItem, CampusEvent, PersonalTask } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

const zone = 'America/Edmonton';
const base: PersonalTask = { ...snapshotFixture().personalTasks[0], due: null, scheduled: null, recurrence: null, completedAt: null };
const task = (id: string, patch: Partial<PersonalTask>): PersonalTask => ({ ...base, id: `20000000-0000-4000-8000-${id.padStart(12, '0')}`, title: `Task ${id}`, ...patch });

describe('month grid', () => {
  it('covers whole Monday–Sunday weeks and marks the month and today', () => {
    const grid = monthGrid('2026-10-14', '2026-10-14');
    expect(grid.start).toBe('2026-09-28'); expect(grid.end).toBe('2026-11-01');
    expect(grid.weeks).toHaveLength(5); expect(grid.weeks.every(week => week.length === 7)).toBe(true);
    expect(grid.weeks[0][0]).toEqual({ date: '2026-09-28', inMonth: false, isToday: false });
    expect(grid.weeks.flat().filter(cell => cell.isToday).map(cell => cell.date)).toEqual(['2026-10-14']);
    // February 2027 starts on Monday and ends on Sunday: exactly four weeks.
    expect(monthGrid('2027-02-01', '2026-10-14').weeks).toHaveLength(4);
  });
  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-31', -1)).toBe('2025-12-01');
  });
});

describe('calendar entries (account calendar)', () => {
  it('places scheduled and deadline days separately and uses the account zone for timed values', () => {
    const tasks = [
      task('1', { scheduled: { kind: 'date', date: '2026-10-12' }, due: { kind: 'date', date: '2026-10-15' } }),
      // 05:30 UTC on the 16th is still the 15th in Edmonton.
      task('2', { due: { kind: 'instant', at: '2026-10-16T05:30:00Z' } }),
      task('3', { scheduled: { kind: 'date', date: '2026-10-15' }, due: { kind: 'date', date: '2026-10-15' } }),
      task('4', {}),
    ];
    const days = calendarEntries({ tasks, from: '2026-10-01', through: '2026-10-31', timeZone: zone });
    expect(days.get('2026-10-12')?.map(row => [row.title, row.role])).toEqual([['Task 1', 'planned']]);
    expect(days.get('2026-10-15')?.map(row => [row.title, row.role])).toEqual([['Task 2', 'due'], ['Task 1', 'due'], ['Task 3', 'due']]);
    expect([...days.values()].flat().some(row => row.title === 'Task 4')).toBe(false);
  });
  it('expands repeating tasks to their occurrences inside the range only', () => {
    const weekly = task('5', { scheduled: { kind: 'date', date: '2026-10-05' }, recurrence: { frequency: 'weekly', weekdays: [1], interval: 1 } });
    const days = calendarEntries({ tasks: [weekly], from: '2026-10-01', through: '2026-10-31', timeZone: zone });
    expect([...days.keys()].sort()).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });
  it('includes coursework deadlines and only saved events, sorting finished work last', () => {
    const academic: AcademicItem[] = [{ id: '50000000-0000-4000-8000-000000000001', courseId: null, title: 'Essay', kind: 'assignment', due: { kind: 'date', date: '2026-10-20' },
      submissionState: 'submitted', source: 'manual', externalId: 'essay', mainGoalDate: null, updatedAt: '2026-10-01T00:00:00Z' }];
    const event = (id: string, saved: boolean): CampusEvent => ({ id: `30000000-0000-4000-8000-00000000000${id}`, title: `Event ${id}`, description: null, category: null,
      source: 'fixture', externalId: id, timing: { kind: 'timed', startsAt: '2026-10-20T18:00:00Z', endsAt: null }, location: null, url: null, saved });
    const tasks = [task('6', { due: { kind: 'date', date: '2026-10-20' } })];
    const days = calendarEntries({ tasks, academic, events: [event('1', true), event('2', false)], from: '2026-10-01', through: '2026-10-31', timeZone: zone });
    expect(days.get('2026-10-20')?.map(row => [row.title, row.kind, row.done])).toEqual([
      ['Event 1', 'event', false], ['Task 6', 'personalTask', false], ['Essay', 'academic', true]]);
  });
  it('excludes everything outside the range', () => {
    expect(calendarEntries({ tasks: [task('7', { due: { kind: 'date', date: '2026-11-01' } })], from: '2026-10-01', through: '2026-10-31', timeZone: zone }).size).toBe(0);
  });
});
