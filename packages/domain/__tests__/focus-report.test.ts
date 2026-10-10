import { summarizeFocusWeek, type FocusSession } from '../src';
const row = (id: string, endedAt: string, overrides: Partial<FocusSession> = {}): FocusSession => ({ id, taskId: 'task-one', title: 'Read',
  endedAt, focusedSeconds: 60, outcome: 'completed', ...overrides });
it('accumulates seconds, counts early finishes and deduplicates stable block identities', () => {
  const first = row('one', '2025-03-03T18:00:00Z', { focusedSeconds: 59, outcome: 'interrupted' });
  const report = summarizeFocusWeek([first, first, row('two', '2025-03-03T19:00:00Z', { focusedSeconds: 59, outcome: 'interrupted' }),
    row('three', '2025-03-04T19:00:00Z')], '2025-03-03', 'America/Edmonton', '2025-03-09T18:00:00Z');
  expect(report).toMatchObject({ seconds: 178, blocks: 3, completedBlocks: 1, studyDays: 2 });
  expect(report.days[0]).toMatchObject({ seconds: 118, blocks: 2 });
});
it.each([
  ['2025-03-03', '2025-03-09T07:10:00Z', '2025-03-10T06:00:00Z', '2025-03-10T07:00:00Z'],
  ['2025-10-27', '2025-11-02T07:10:00Z', '2025-11-03T07:00:00Z', '2025-11-03T08:00:00Z'],
])('groups by local end day through DST for %s', (start, sunday, nextMidnight, now) => {
  const report = summarizeFocusWeek([row('sunday', sunday), row('next', nextMidnight)], start, 'America/Edmonton', now);
  expect(report.seconds).toBe(60); expect(report.days[6]).toMatchObject({ seconds: 60, blocks: 1 });
});
it('keeps future days ahead, excludes future-ended records and crosses a year boundary', () => {
  const report = summarizeFocusWeek([row('past', '2025-12-31T12:00:00Z'), row('future', '2026-01-01T12:00:00Z')], '2025-12-29', 'UTC', '2025-12-31T18:00:00Z');
  expect(report).toMatchObject({ seconds: 60, blocks: 1, through: '2026-01-04' });
  expect(report.days[3]).toMatchObject({ date: '2026-01-01', status: 'future', seconds: 0 });
});
it('groups by task identity rather than title and uses the latest recorded title', () => {
  const report = summarizeFocusWeek([row('old', '2025-03-03T12:00:00Z'), row('new', '2025-03-04T12:00:00Z', { title: 'Renamed' }),
    row('same-title', '2025-03-04T12:00:00Z', { taskId: 'different-task' }), row('free', '2025-03-04T12:00:00Z', { taskId: null })], '2025-03-03', 'UTC', '2025-03-09T18:00:00Z');
  expect(report.tasks).toHaveLength(3); expect(report.tasks[0]).toMatchObject({ taskId: 'task-one', title: 'Renamed', seconds: 120, blocks: 2 });
  expect(report.tasks.find(task => !task.taskId)?.title).toBe('Unlinked study');
});
