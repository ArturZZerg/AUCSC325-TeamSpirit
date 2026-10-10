import { buildDayCapacity, studyTaskDefaults } from '../src/features/day-capacity';
import { classFixture } from './class-fixture';
import { accountId, snapshotFixture } from './snapshot-fixture';
import { eventFixture } from './event-fixture';
const zone = 'America/Edmonton', date = '2025-03-10', now = '2025-03-10T12:00:00Z';
const snapshot = () => ({ ...snapshotFixture(), personalTasks: [], taskCompletions: [] });
const build = (value: unknown, classes: unknown = [classFixture()]) => buildDayCapacity(value, classes, accountId, zone, date, now);
it('derives windows from validated class patterns and account coverage', () => {
  const result = build(snapshot()); expect(result.status).toBe('ready'); expect(result.classes).toHaveLength(1);
  expect(result.windows.map(window => window.startsAt)).toEqual(['2025-03-10T14:00:00Z', '2025-03-10T16:15:00Z']);
});
it.each([undefined, { ...snapshot(), accountId: '10000000-0000-4000-8000-000000000002' }, { ...snapshot(), timeZone: 'UTC' },
  { ...snapshot(), coverage: { ...snapshot().coverage, through: '2025-03-09' } }, { ...snapshot(), personalTasks: [{}] }])('withholds windows for missing, foreign, malformed or uncovered snapshots', value => {
  const result = build(value); expect(result.status).toBe('unavailable'); expect(result.windows).toEqual([]);
});
it.each([undefined, [classFixture({ endTime: '08:00' })]])('requires a loaded valid timetable', classes => {
  expect(buildDayCapacity(snapshot(), classes, accountId, zone, date, now).status).toBe('unavailable');
});
it('preserves known classes when plan data is unavailable', () => { expect(build(undefined).classes).toHaveLength(1); });
it('blocks scheduled task durations and ignores completed and deadline-only work', () => {
  const task = snapshotFixture().personalTasks[0];
  const value = { ...snapshot(), personalTasks: [
    { ...task, recurrence: null, due: null, scheduled: { kind: 'instant', at: '2025-03-10T17:00:00Z' }, estimatedMinutes: 60 },
    { ...task, id: '20000000-0000-4000-8000-000000000002', recurrence: null, scheduled: { kind: 'instant', at: '2025-03-10T20:00:00Z' }, estimatedMinutes: 60, completedAt: now },
    { ...task, id: '20000000-0000-4000-8000-000000000003' },
  ] };
  expect(build(value, []).windows.map(window => window.startsAt)).toEqual(['2025-03-10T14:00:00Z', '2025-03-10T18:15:00Z']);
});
it('expands recurring task times and respects occurrence completion', () => {
  const task = { ...snapshotFixture().personalTasks[0], scheduled: { kind: 'instant', at: '2025-03-08T16:00:00Z' }, estimatedMinutes: 60 };
  const value = { ...snapshot(), personalTasks: [task] };
  expect(build(value, []).windows[1].startsAt).toBe('2025-03-10T16:15:00Z');
  expect(build({ ...value, taskCompletions: [{ taskId: task.id, occurrenceKey: date, completedAt: now }] }, []).windows).toHaveLength(1);
});
it('includes a previous-day task continuing into study hours', () => {
  const task = { ...snapshotFixture().personalTasks[0], recurrence: null, scheduled: { kind: 'instant', at: '2025-03-10T05:30:00Z' }, estimatedMinutes: 600 };
  expect(build({ ...snapshot(), personalTasks: [task] }, []).windows[0].startsAt).toBe('2025-03-10T15:45:00Z');
});
it('withholds suggestions rather than inventing a timed task duration', () => {
  const task = { ...snapshotFixture().personalTasks[0], recurrence: null, scheduled: { kind: 'instant', at: '2025-03-10T17:00:00Z' } };
  expect(build({ ...snapshot(), personalTasks: [task] }).status).toBe('missingDuration');
});
it('withholds windows when yesterday’s task could still be running without a duration', () => {
  const task = { ...snapshotFixture().personalTasks[0], recurrence: null, scheduled: { kind: 'instant', at: '2025-03-10T05:30:00Z' } };
  expect(build({ ...snapshot(), personalTasks: [task] }, []).status).toBe('missingDuration');
});
it('blocks only explicitly planned events including all-day commitments', () => {
  const event = { ...eventFixture(), timing: { kind: 'allDay' as const, startDate: date, endDateExclusive: '2025-03-11' } };
  const value = { ...snapshot(), events: [event], savedEvents: [{ eventId: event.id, includedInPlan: true, reminder: null, savedAt: now }] };
  expect(build(value).windows).toEqual([]); expect(build(value).status).toBe('ready');
  expect(build({ ...value, savedEvents: [{ ...value.savedEvents[0], includedInPlan: false }] }).windows.length).toBeGreaterThan(0);
});
it('withholds windows for an event without an end or a DST class warning', () => {
  const event = { ...eventFixture(), timing: { kind: 'timed' as const, startsAt: '2025-03-10T17:00:00Z', endsAt: null } };
  expect(build({ ...snapshot(), events: [event], savedEvents: [{ eventId: event.id, includedInPlan: true, reminder: null, savedAt: now }] }).status).toBe('missingDuration');
  expect(buildDayCapacity(snapshot(), [classFixture({ weekdays: [7], startTime: '02:15', endTime: '03:15' })], accountId, zone, '2025-03-09', now).status).toBe('clockChange');
});
it('prefills an editable university study task with local time and duration', () => {
  expect(studyTaskDefaults('2025-03-10T16:15:00Z', 30, zone)).toMatchObject({ scheduledMode: 'instant', scheduledDate: date, scheduledTime: '10:15', estimatedMinutes: '30', category: 'university' });
});
