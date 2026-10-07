import { buildPlannerWeek, weekStart } from '../src/features/weekly-planner';
import { accountId, snapshotFixture } from './snapshot-fixture';
import type { OfflineSnapshot } from '@campusflow/contracts';

const zone = 'America/Edmonton';
const now = '2025-03-09T18:00:00Z';
function fixture(): OfflineSnapshot {
  return { ...snapshotFixture(), coverage: { ...snapshotFixture().coverage, from: '2025-03-03', through: '2025-03-16' }, goals: [], taskCompletions: [] };
}
describe('Weekly planner (ToR 4, 17, 19)', () => {
  it.each([
    ['2025-03-09', '2025-03-03'], ['2025-11-02', '2025-10-27'],
    ['2024-02-29', '2024-02-26'], ['2026-01-01', '2025-12-29'], ['2025-03-10', '2025-03-10'],
  ])('starts %s on Monday %s without a timezone shift', (date, expected) => expect(weekStart(date)).toBe(expected));

  it('keeps seven consecutive calendar days across spring DST', () => {
    const week = buildPlannerWeek(fixture(), accountId, zone, '2025-03-03', now);
    expect(week.days.map(day => day.date)).toEqual(['2025-03-03', '2025-03-04', '2025-03-05', '2025-03-06', '2025-03-07', '2025-03-08', '2025-03-09']);
    expect(week.coveredDays).toBe(7);
  });

  it('counts repeated overdue work once for the week, while showing it in each daily plan', () => {
    const snapshot = fixture();
    snapshot.personalTasks = [{ ...snapshot.personalTasks[0], recurrence: null, due: { kind: 'date', date: '2025-03-01' } }];
    const week = buildPlannerWeek(snapshot, accountId, zone, '2025-03-03', now);
    expect(week.days.map(day => day.open)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(week.planned).toBe(1);
    expect(week.deadlines).toBe(0);
  });

  it('preserves distinct recurring occurrences and completed history', () => {
    const snapshot = fixture();
    snapshot.personalTasks[0].due = { kind: 'date', date: '2025-03-03' };
    snapshot.taskCompletions = snapshotFixture().taskCompletions;
    const week = buildPlannerWeek(snapshot, accountId, zone, '2025-03-03', now);
    expect(week.planned).toBe(7);
    expect(week.finished).toBe(1);
    expect(week.deadlines).toBe(6);
    expect(week.days[6].plan?.items[0]).toMatchObject({ occurrenceKey: '2025-03-09', state: 'completed' });
  });

  it('counts a timed deadline on its account-local date and excludes submitted work', () => {
    const snapshot = fixture(); snapshot.personalTasks = [];
    snapshot.academicItems = [
      { id: '50000000-0000-4000-8000-000000000001', courseId: null, title: 'Essay', kind: 'assignment',
        due: { kind: 'instant', at: '2025-03-10T05:30:00Z' }, submissionState: 'unsubmitted', source: 'fixture', externalId: '1', mainGoalDate: null, updatedAt: now },
      { id: '50000000-0000-4000-8000-000000000002', courseId: null, title: 'Submitted', kind: 'quiz',
        due: { kind: 'date', date: '2025-03-09' }, submissionState: 'submitted', source: 'fixture', externalId: '2', mainGoalDate: null, updatedAt: now },
    ];
    const week = buildPlannerWeek(snapshot, accountId, zone, '2025-03-03', now);
    expect(week.deadlines).toBe(1);
    expect(week.finished).toBe(1);
    expect(week.days[6].plan?.items.map(item => item.title)).toEqual(['Essay', 'Submitted']);
  });

  it('marks uncovered days unknown rather than inventing empty plans', () => {
    const week = buildPlannerWeek(snapshotFixture(), accountId, zone, '2025-03-03', now);
    expect(week.coveredDays).toBe(2);
    expect(week.days[0].plan).toBeUndefined();
    expect(week.days[0].open).toBeUndefined();
  });

  it.each([
    undefined, { ...fixture(), accountId: '10000000-0000-4000-8000-000000000002' },
    { ...fixture(), timeZone: 'UTC' }, { ...fixture(), personalTasks: [{ title: 'Corrupt' }] },
  ])('withholds absent, foreign-account, wrong-zone or corrupt data', snapshot => {
    const week = buildPlannerWeek(snapshot, accountId, zone, '2025-03-03', now);
    expect(week.coveredDays).toBe(0);
    expect(week.planned).toBe(0);
    expect(week.days.every(day => day.plan === undefined)).toBe(true);
  });
});
