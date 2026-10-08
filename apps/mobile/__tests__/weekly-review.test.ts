import type { OfflineSnapshot } from '@campusflow/contracts';
import { buildWeeklyReview } from '../src/features/weekly-review';
import { accountId, goalId, snapshotFixture, taskId } from './snapshot-fixture';

const zone = 'America/Edmonton'; const start = '2025-03-03'; const now = '2025-03-10T05:59:59.999Z';
const secondTask = '20000000-0000-4000-8000-000000000002';
function fixture(): OfflineSnapshot {
  return { ...snapshotFixture(), capturedAt: now, coverage: { from: start, through: '2025-03-10', includesOverdue: true, basis: 'persisted' },
    personalTasks: [], taskCompletions: [], goals: [], goalCompletions: [] };
}
const task = () => ({ ...snapshotFixture().personalTasks[0], recurrence: null });
const academic = () => ({ id: '50000000-0000-4000-8000-000000000001', courseId: null, title: 'Essay', kind: 'assignment' as const,
  due: { kind: 'date' as const, date: '2025-03-09' }, submissionState: 'unsubmitted' as const, source: 'manual', externalId: 'essay', mainGoalDate: null, updatedAt: now });
const build = (snapshot: unknown) => buildWeeklyReview(snapshot, accountId, zone, start, now)!;

describe('Weekly review recorded work (ToR 3.4, 4, 17, 19)', () => {
  it('counts a completed task by completion time even when its deadline belongs to another week', () => {
    const snapshot = fixture(); snapshot.personalTasks = [{ ...task(), due: { kind: 'date', date: '2025-02-01' }, completedAt: '2025-03-09T12:00:00Z' },
      { ...task(), id: secondTask, due: { kind: 'date', date: '2025-03-09' }, completedAt: '2025-03-01T12:00:00Z' }];
    expect(build(snapshot).taskCompletions).toEqual([expect.objectContaining({ title: 'Daily reading', date: '2025-03-09' })]);
    expect(build(snapshot).days[6]).toMatchObject({ tasks: 1, routines: 0 });
  });
  it('counts distinct repeating completions by recorded instant, deduplicates occurrences and rejects orphan rows', () => {
    const snapshot = fixture(); snapshot.personalTasks = [snapshotFixture().personalTasks[0]];
    const row = { taskId, occurrenceKey: '2025-02-28', completedAt: '2025-03-09T12:00:00Z' };
    snapshot.taskCompletions = [row, row, { ...row, occurrenceKey: '2025-03-08' }, { ...row, taskId: secondTask }];
    expect(build(snapshot).taskCompletions).toHaveLength(2);
    expect(build(snapshot).days[6].tasks).toBe(2);
  });
  it('uses completion instants for routine activity, retains paused history and excludes skips or missing times', () => {
    const snapshot = fixture(); snapshot.goals = [{ ...snapshotFixture().goals[0], pausedAt: now, schedule: { kind: 'weeklyTarget', target: 3 } }];
    const row = { ...snapshotFixture().goalCompletions[0], occurrenceKey: '2025-03-08', state: 'completed' as const, completedAt: '2025-03-09T12:00:00Z' };
    snapshot.goalCompletions = [row, row, { ...row, id: secondTask, occurrenceKey: '2025-03-07', state: 'skipped' },
      { ...row, id: taskId, occurrenceKey: '2025-03-06', completedAt: null }, { ...row, goalId: taskId }];
    expect(build(snapshot).routineCompletions).toBe(1); expect(build(snapshot).days[6].routines).toBe(1);
    expect(build(snapshot).routines[0]).toMatchObject({ completed: 1, goal: { id: goalId, pausedAt: now } });
  });
  it('keeps saved repeating occurrences when a task no longer repeats', () => {
    const snapshot = fixture(); snapshot.personalTasks = [task()];
    snapshot.taskCompletions = [{ taskId, occurrenceKey: '2025-03-08', completedAt: '2025-03-09T12:00:00Z' }];
    expect(build(snapshot).taskCompletions).toHaveLength(1);
  });
  it('preserves recorded activity after a goal schedule change without inventing historical expected days', () => {
    const snapshot = fixture(); snapshot.goals = [{ ...snapshotFixture().goals[0], schedule: { kind: 'weekly', weekdays: [1] } }];
    snapshot.goalCompletions = [{ ...snapshotFixture().goalCompletions[0], state: 'completed', completedAt: '2025-03-09T12:00:00Z' }];
    expect(build(snapshot).routines[0].completed).toBe(1);
  });
  it('groups manual Done and imported submission states by deadline, without using updatedAt as a submission date', () => {
    const snapshot = fixture(); snapshot.academicItems = [
      { ...academic(), submissionState: 'submitted', updatedAt: '2025-02-01T12:00:00Z' },
      { ...academic(), id: taskId, source: 'canvas', submissionState: 'graded' },
      { ...academic(), id: secondTask, submissionState: 'missing' },
      { ...academic(), id: goalId, submissionState: null },
      { ...academic(), id: accountId, source: 'canvas:fixture', submissionState: 'submitted' },
    ];
    const review = build(snapshot); expect(review.coursework.map(row => row.state)).toEqual(expect.arrayContaining(['Done', 'Graded', 'Missing', 'Status unavailable']));
    expect(review.coursework).toHaveLength(4); expect(review.settledCoursework).toBe(2); expect(review.hasDemoCoursework).toBe(true);
  });
  it('assigns timed coursework to the local deadline date and excludes missing or outside-week dates', () => {
    const snapshot = fixture(); snapshot.academicItems = [{ ...academic(), due: { kind: 'instant', at: '2025-03-10T05:30:00Z' } },
      { ...academic(), id: taskId, due: { kind: 'date', date: '2025-03-10' } }, { ...academic(), id: goalId, due: null }];
    expect(build(snapshot).coursework).toEqual([expect.objectContaining({ date: '2025-03-09' })]);
  });
  it('keeps unknown days separate from zero and limits totals to advertised coverage', () => {
    const snapshot = fixture(); snapshot.coverage.from = '2025-03-09';
    snapshot.personalTasks = [{ ...task(), completedAt: '2025-03-08T12:00:00Z' }, { ...task(), id: secondTask, completedAt: '2025-03-09T12:00:00Z' }];
    const review = build(snapshot); expect(review.coveredDays).toBe(1); expect(review.elapsedDays).toBe(7); expect(review.taskCompletions).toHaveLength(1);
    expect(review.days[0].status).toBe('unavailable'); expect(review.days[6].status).toBe('available');
  });
  it('withholds uncaptured days and records after capture, even if calendar coverage includes them', () => {
    const snapshot = fixture(); snapshot.capturedAt = '2025-03-08T18:00:00Z';
    snapshot.personalTasks = [{ ...task(), completedAt: '2025-03-09T12:00:00Z' }, { ...task(), id: secondTask, completedAt: '2025-03-08T19:00:00Z' }];
    const review = build(snapshot); expect(review.coveredDays).toBe(6); expect(review.days[6].status).toBe('unavailable'); expect(review.taskCompletions).toHaveLength(0);
  });
  it('marks future days ahead and excludes future completion timestamps', () => {
    const snapshot = fixture(); snapshot.personalTasks = [{ ...task(), completedAt: '2025-03-07T12:00:00Z' }];
    const review = buildWeeklyReview(snapshot, accountId, zone, start, '2025-03-05T18:00:00Z')!;
    expect(review.elapsedDays).toBe(3); expect(review.coveredDays).toBe(3); expect(review.days[3].status).toBe('future'); expect(review.taskCompletions).toHaveLength(0);
  });
  it('respects account-local midnight across spring DST', () => {
    const snapshot = fixture(); snapshot.personalTasks = [{ ...task(), completedAt: '2025-03-09T06:59:59Z' },
      { ...task(), id: secondTask, completedAt: '2025-03-09T07:00:00Z' }];
    const review = build(snapshot); expect(review.days[5].tasks).toBe(1); expect(review.days[6].tasks).toBe(1);
  });
  it('counts both repeated-hour completions on the correct fall-DST day', () => {
    const snapshot = fixture(); snapshot.capturedAt = '2025-11-03T06:59:59.999Z'; snapshot.coverage = { ...snapshot.coverage, from: '2025-10-27', through: '2025-11-03' };
    snapshot.personalTasks = [{ ...task(), completedAt: '2025-11-02T08:30:00Z' }, { ...task(), id: secondTask, completedAt: '2025-11-02T09:30:00Z' }];
    const review = buildWeeklyReview(snapshot, accountId, zone, '2025-10-27', snapshot.capturedAt)!;
    expect(review.days[6]).toMatchObject({ date: '2025-11-02', tasks: 2 }); expect(review.coveredDays).toBe(7);
  });
  it.each([undefined, { ...fixture(), accountId: secondTask }, { ...fixture(), timeZone: 'UTC' }, { ...fixture(), personalTasks: [{ title: 'Corrupt' }] }])('rejects absent, foreign, wrong-zone or corrupt snapshots', snapshot => {
    expect(buildWeeklyReview(snapshot, accountId, zone, start, now)).toBeUndefined();
  });
  it.each(['2025-03-04', '2025-02-30', 'not-a-date'])('rejects invalid or non-Monday week boundaries: %s', date => {
    expect(buildWeeklyReview(fixture(), accountId, zone, date, now)).toBeUndefined();
  });
});
