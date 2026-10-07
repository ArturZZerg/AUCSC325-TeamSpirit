import { composeOfflineToday } from '../src/features/offline-today';
import { accountId, goalId, snapshotFixture, taskId } from './snapshot-fixture';

const zone = 'America/Edmonton';
const now = '2025-03-09T18:00:00Z';
describe('snapshot plan composition (ToR 4, 10, 19)', () => {
  it('shows manual completion without claiming a Canvas submission or allowing a generic Today write', () => {
    const snapshot = snapshotFixture();
    const id = '50000000-0000-4000-8000-000000000001';
    snapshot.academicItems = [{ id, courseId: null, title: 'My essay', kind: 'assignment', source: 'manual', externalId: id,
      due: { kind: 'date', date: '2025-03-09' }, submissionState: 'submitted', mainGoalDate: null, updatedAt: now }];
    const plan = composeOfflineToday(snapshot, accountId, zone, '2025-03-09', now)!;
    expect(plan.items.find(item => item.entityId === id)).toMatchObject({ state: 'completed', allowedActions: ['open'] });
  });
  it('shifts recurrence wall times across DST and preserves occurrence completion/actions', () => {
    const plan = composeOfflineToday(snapshotFixture(), accountId, zone, '2025-03-09', now)!;
    expect(plan.items.find(item => item.entityId === taskId)).toMatchObject({
      occurrenceKey: '2025-03-09', due: { kind: 'instant', at: '2025-03-09T15:00:00Z' },
      state: 'completed', allowedActions: ['uncomplete', 'open'],
    });
    expect(plan.upcoming).toHaveLength(7);
    expect(plan.upcoming[6].occurrenceKey).toBe('2025-03-16');
    expect(plan.items.find(item => item.entityId === goalId)).toMatchObject({ occurrenceKey: '2025-03-09', state: 'today', allowedActions: ['complete', 'skip', 'snooze', 'open'] });
  });

  it('keeps snapshot age/source coverage while reevaluating overdue work at the current clock', () => {
    const snapshot = snapshotFixture();
    snapshot.personalTasks[0].recurrence = null;
    snapshot.personalTasks[0].due = { kind: 'date', date: '2025-03-08' };
    const plan = composeOfflineToday(snapshot, accountId, zone, '2025-03-09', now)!;
    expect(plan.generatedAt).toBe(snapshot.capturedAt);
    expect(plan.sourceStatus).toEqual(snapshot.sourceStatus);
    expect(plan.items[0]).toMatchObject({ entityId: taskId, state: 'overdue', occurrenceKey: null });
  });

  it('maps academic submission, Main Goal, saved events and campus discovery without duplicates', () => {
    const snapshot = snapshotFixture();
    const academicId = '50000000-0000-4000-8000-000000000001';
    snapshot.academicItems = [{ id: academicId, courseId: null, title: 'Essay', kind: 'assignment',
      due: { kind: 'date', date: '2025-03-09' }, submissionState: 'submitted', source: 'fixture', externalId: 'essay',
      mainGoalDate: '2025-03-09', updatedAt: now }];
    const event = { id: '60000000-0000-4000-8000-000000000001', title: 'Campus meeting', description: null,
      category: null, source: 'fixture', externalId: 'meeting', timing: { kind: 'allDay' as const, startDate: '2025-03-09', endDateExclusive: '2025-03-10' }, location: null, url: null };
    snapshot.events = [event, { ...event, id: '60000000-0000-4000-8000-000000000002', externalId: 'other' }];
    snapshot.savedEvents = [{ eventId: event.id, includedInPlan: true, reminder: null, savedAt: now }];
    const plan = composeOfflineToday(snapshot, accountId, zone, '2025-03-09', now)!;
    expect(plan.items[0]).toMatchObject({ entityId: academicId, isMainGoal: true, state: 'submitted', allowedActions: ['open'] });
    expect(plan.items.filter(item => item.kind === 'event').map(item => item.entityId)).toEqual([event.id]);
    expect(plan.campusEvents.map(item => item.id)).toEqual([snapshot.events[1].id]);
    expect(composeOfflineToday(snapshot, accountId, zone, '2025-03-10', now)!.campusEvents).toEqual([]);
  });

  it.each(['2025-03-08', '2025-03-15'])('allows inclusive covered date %s', date => {
    expect(composeOfflineToday(snapshotFixture(), accountId, zone, date, now)?.date).toBe(date);
  });
  it.each(['2025-03-07', '2025-03-16', '2025-03-09-invalid'])('refuses an uncovered or invalid date %s', date => {
    expect(composeOfflineToday(snapshotFixture(), accountId, zone, date, now)).toBeUndefined();
  });
  it.each([
    undefined, { broken: true }, { ...snapshotFixture(), accountId: '10000000-0000-4000-8000-000000000002' },
    { ...snapshotFixture(), timeZone: 'UTC' }, { ...snapshotFixture(), coverage: { ...snapshotFixture().coverage, includesOverdue: false } },
    { ...snapshotFixture(), taskCompletions: [{ taskId, occurrenceKey: '2025-02-30', completedAt: now }] },
  ])('refuses corrupt, incomplete or foreign account/calendar data %#', value => {
    expect(composeOfflineToday(value, accountId, zone, '2025-03-09', now)).toBeUndefined();
  });
  it('can confirm an empty plan only inside validated persisted coverage', () => {
    const snapshot = { ...snapshotFixture(), personalTasks: [], goals: [] };
    expect(composeOfflineToday(snapshot, accountId, zone, '2025-03-09', now)?.items).toEqual([]);
  });
});

it('recomposes Tokyo occurrences across goal midnight without changing snapshot freshness or history', () => {
  const snapshot = snapshotFixture(); snapshot.timeZone = zone;
  snapshot.coverage = { ...snapshot.coverage, from: '2026-10-04', through: '2026-10-11' };
  snapshot.goals[0].timeZone = 'Asia/Tokyo'; snapshot.personalTasks = []; snapshot.goalCompletions = [];
  const before = composeOfflineToday(snapshot, accountId, zone, '2026-10-04', '2026-10-04T14:59:59Z')!;
  const after = composeOfflineToday(snapshot, accountId, zone, '2026-10-04', '2026-10-04T15:00:00Z')!;
  expect(before.items[0].occurrenceKey).toBe('2026-10-04'); expect(after.items[0].occurrenceKey).toBe('2026-10-05');
  expect(after.date).toBe(before.date); expect(after.generatedAt).toBe(snapshot.capturedAt);
  expect(after.sourceStatus).toEqual(snapshot.sourceStatus);
  snapshot.goalCompletions = [{ id: '40000000-0000-4000-8000-000000000001', goalId,
    occurrenceKey: '2026-10-05', state: 'completed', completedAt: '2026-10-04T15:01:00Z', createdAt: '2026-10-04T15:01:00Z' }];
  expect(composeOfflineToday(snapshot, accountId, zone, '2026-10-04', '2026-10-04T18:00:00Z')!.items[0])
    .toMatchObject({ occurrenceKey: '2026-10-05', state: 'completed' });
});
