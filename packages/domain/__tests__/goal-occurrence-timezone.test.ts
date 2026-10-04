import { composeToday, localDateAt, type TodayInput } from '../src';

const input = (now: string, timeZone = 'America/Edmonton', goalZone = 'Asia/Tokyo'): TodayInput => ({
  now, timeZone, date: localDateAt(now, timeZone), personalTasks: [], academicItems: [],
  goals: [{ id: 'goal', title: 'Routine', timeZone: goalZone, schedule: { kind: 'daily' } }],
  goalCompletions: [], events: [], savedEvents: [],
});

it('Today exposes the same current goal-local occurrence used by Wellness', () => {
  const value = input('2026-10-04T18:00:00Z');
  const wellnessDate = localDateAt(value.now, value.goals[0].timeZone);
  expect(value.date).toBe('2026-10-04'); expect(wellnessDate).toBe('2026-10-05');
  expect(composeToday(value).items[0]).toMatchObject({ key: 'goal:goal:2026-10-05', occurrenceKey: wellnessDate });
});

it.each([
  ['same zone', 'America/Edmonton', 'America/Edmonton', '2026-10-04T18:00:00Z', '2026-10-04'],
  ['Tokyo account, Edmonton goal', 'Asia/Tokyo', 'America/Edmonton', '2026-10-04T18:00:00Z', '2026-10-04'],
  ['opposite date-line offsets', 'Pacific/Honolulu', 'Pacific/Kiritimati', '2026-10-04T12:00:00Z', '2026-10-05'],
  ['before account midnight', 'America/Edmonton', 'Asia/Tokyo', '2026-10-04T05:59:59Z', '2026-10-04'],
  ['account midnight', 'America/Edmonton', 'Asia/Tokyo', '2026-10-04T06:00:00Z', '2026-10-04'],
  ['before goal midnight', 'America/Edmonton', 'Asia/Tokyo', '2026-10-04T14:59:59Z', '2026-10-04'],
  ['goal midnight', 'America/Edmonton', 'Asia/Tokyo', '2026-10-04T15:00:00Z', '2026-10-05'],
  ['before spring jump', 'Asia/Tokyo', 'America/New_York', '2025-03-09T06:59:59Z', '2025-03-09'],
  ['after spring jump', 'Asia/Tokyo', 'America/New_York', '2025-03-09T07:00:00Z', '2025-03-09'],
  ['first fall hour', 'Asia/Tokyo', 'America/New_York', '2025-11-02T05:30:00Z', '2025-11-02'],
  ['repeated fall hour', 'Asia/Tokyo', 'America/New_York', '2025-11-02T06:30:00Z', '2025-11-02'],
])('%s uses the goal calendar without changing the account plan date', (_, accountZone, goalZone, now, expected) => {
  const value = input(now, accountZone, goalZone);
  expect(composeToday(value).items[0].occurrenceKey).toBe(expected);
});

it('uses the goal weekday and retains completed/skipped identity through pause/resume', () => {
  const value = input('2026-10-04T18:00:00Z');
  value.goals[0].schedule = { kind: 'weekly', weekdays: [1] };
  expect(composeToday(value).items[0].occurrenceKey).toBe('2026-10-05');
  for (const state of ['completed', 'skipped'] as const) {
    value.goalCompletions = [{ goalId: 'goal', occurrenceKey: '2026-10-05', state }];
    expect(composeToday(value).items[0].state).toBe(state);
    value.goals[0].pausedAt = value.now; expect(composeToday(value).items).toEqual([]);
    delete value.goals[0].pausedAt; expect(composeToday(value).items[0].state).toBe(state);
  }
  value.goals[0].schedule = { kind: 'weekly', weekdays: [7] };
  expect(composeToday(value).items).toEqual([]);
});

it('retains non-current account-day anchoring and original history keys', () => {
  const value = input('2026-10-04T18:00:00Z'); value.date = '2026-10-03';
  value.goalCompletions = [{ goalId: 'goal', occurrenceKey: '2026-10-03', state: 'completed' }];
  expect(composeToday(value).items[0]).toMatchObject({ occurrenceKey: '2026-10-03', state: 'completed' });
  value.now = '2026-12-01T00:00:00Z';
  expect(composeToday(value).items[0]).toMatchObject({ occurrenceKey: '2026-10-03', state: 'completed' });
});

it('does not invent a mandatory occurrence for weekly-target goals', () => {
  const value = input('2026-10-04T18:00:00Z'); value.goals[0].schedule = { kind: 'weeklyTarget', target: 3 };
  expect(composeToday(value).items).toEqual([]);
});
