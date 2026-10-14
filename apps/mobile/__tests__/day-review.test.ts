import { buildDayReview, buildDayStudy } from '../src/features/day-review';
import type { OfflineSnapshot } from '@campusflow/contracts';
import { accountId, snapshotFixture, taskId } from './snapshot-fixture';
import { reportFixture } from './study-report-fixture';

const zone = 'America/Edmonton', date = '2025-03-09', now = '2025-03-09T18:00:00Z';
const second = '20000000-0000-4000-8000-000000000002';
function snapshot(): OfflineSnapshot { return { ...snapshotFixture(), capturedAt: now, coverage: { from: '2025-03-03', through: '2025-03-15', includesOverdue: true, basis: 'persisted' as const },
  personalTasks: [{ ...snapshotFixture().personalTasks[0], recurrence: null, scheduled: { kind: 'date' as const, date } }], taskCompletions: [] }; }
const review = (raw: unknown) => buildDayReview(raw, accountId, zone, date, now);
const study = (raw: unknown) => buildDayStudy(raw, accountId, zone, date, now);

it('keeps recorded completions separate from open saved-plan work and never changes records', () => {
  const raw = snapshot(); raw.personalTasks.push({ ...raw.personalTasks[0], id: second, title: 'Finished essay', completedAt: now });
  const before = JSON.stringify(raw), result = review(raw)!;
  expect(result).toMatchObject({ tasks: 1, routines: 0 });
  expect(result.completed.map(row => row.entityId)).toEqual([second]);
  expect(result.carryover.map(row => row.id)).toEqual([taskId]);
  expect(JSON.stringify(raw)).toBe(before);
});
it('counts repeating completions and routine activity without offering occurrence rescheduling', () => {
  const raw = { ...snapshot(), personalTasks: snapshotFixture().personalTasks, taskCompletions: [
    { taskId, occurrenceKey: date, completedAt: now }, { taskId, occurrenceKey: date, completedAt: now }],
    goalCompletions: [{ ...snapshotFixture().goalCompletions[0], state: 'completed', completedAt: now },
      { ...snapshotFixture().goalCompletions[0], id: second, occurrenceKey: date, state: 'skipped', completedAt: null }] };
  expect(review(raw)).toMatchObject({ tasks: 1, routines: 1, carryover: [] });
});
it('uses the existing plan inclusion rules for overdue, undated and future tasks', () => {
  const raw = snapshot(), base = raw.personalTasks[0];
  raw.personalTasks = [{ ...base, scheduled: null }, { ...base, id: second, due: null, scheduled: null },
    { ...base, id: '20000000-0000-4000-8000-000000000003', due: { kind: 'date', date: '2025-03-12' }, scheduled: { kind: 'date', date: '2025-03-12' } }];
  expect(review(raw)?.carryover.map(row => row.id)).toEqual([taskId]);
});
it.each([undefined, { ...snapshot(), accountId: second }, { ...snapshot(), timeZone: 'UTC' },
  { ...snapshot(), personalTasks: [{ title: 'Malformed' }] }, { ...snapshot(), coverage: { from: '2025-03-10', through: '2025-03-15', includesOverdue: true, basis: 'persisted' } },
  { ...snapshot(), capturedAt: '2025-03-08T18:00:00Z' }])('withholds absent, foreign, malformed and uncovered progress', raw => {
  expect(review(raw)).toBeUndefined();
});
it('rejects bad dates, clocks, account zones and future review days without throwing', () => {
  for (const day of ['invalid', '2025-02-30', '2025-03-10']) expect(buildDayReview(snapshot(), accountId, zone, day, now)).toBeUndefined();
  expect(buildDayReview(snapshot(), accountId, zone, date, 'invalid')).toBeUndefined();
  expect(buildDayReview(snapshot(), accountId, 'invalid', date, now)).toBeUndefined();
});
it('cuts off completion counts at the saved snapshot time instead of inventing later progress', () => {
  const raw = snapshot(); raw.capturedAt = '2025-03-09T15:00:00Z'; raw.personalTasks[0].completedAt = now;
  expect(review(raw)?.tasks).toBe(0);
});
it('shows a proven empty day as zero while keeping absent study history unavailable', () => {
  expect(study({ ...reportFixture(), sessions: [] })).toMatchObject({ seconds: 0, blocks: 0 });
  expect(study(undefined)).toBeUndefined();
});
it('groups overnight and interrupted blocks by their local end date', () => {
  const raw = reportFixture(); raw.sessions[1] = { ...raw.sessions[1], startedAt: '2025-03-09T07:26:00Z', endedAt: '2025-03-09T07:27:05Z', createdAt: '2025-03-09T07:27:05Z' };
  expect(study(raw)).toMatchObject({ seconds: 1565, blocks: 2, completedBlocks: 1, interruptedBlocks: 1 });
  expect(buildDayStudy(raw, accountId, zone, '2025-03-08', now)?.blocks).toBe(0);
});
it.each([{ accountId: second }, { timeZone: 'UTC' }, { from: '2025-03-10' }, { through: '2025-03-08' },
  { sessions: [reportFixture().sessions[0], reportFixture().sessions[0]] }, { sessions: [{ ...reportFixture().sessions[0], focusedSeconds: 100000 }] }])('rejects invalid study ownership, coverage, duplicates and impossible duration', change => {
  expect(study({ ...reportFixture(), ...change })).toBeUndefined();
});
it('rejects out-of-window history and does not include records after the saved cutoff', () => {
  const raw = reportFixture(); expect(study({ ...raw, from: date })).toBeUndefined();
  expect(study({ ...raw, capturedAt: '2025-03-09T07:20:00Z' })?.blocks).toBe(0);
  raw.sessions[0].createdAt = '2025-03-09T19:00:00Z'; expect(study(raw)?.blocks).toBe(0);
  expect(buildDayStudy(raw, accountId, zone, '2025-03-10', now)).toBeUndefined();
});
it('counts both fall-back-hour blocks in one calendar day', () => {
  const raw = reportFixture(); raw.from = raw.through = '2025-11-02'; raw.capturedAt = '2025-11-02T20:00:00Z';
  raw.sessions = raw.sessions.slice(0, 2).map((row, i) => ({ ...row, startedAt: `2025-11-02T0${7 + i}:15:00Z`, endedAt: `2025-11-02T0${7 + i}:45:00Z`, createdAt: `2025-11-02T0${7 + i}:45:00Z`, focusedSeconds: 1500 }));
  expect(buildDayStudy(raw, accountId, zone, '2025-11-02', raw.capturedAt)).toMatchObject({ seconds: 3000, blocks: 2 });
});
