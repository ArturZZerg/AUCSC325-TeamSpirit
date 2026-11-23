import { gymOpeningDaySchema, gymOpeningHoursSchema, gymOverviewSchema, saveGymOpeningHoursSchema } from '../src';

const hours = { timeZone: 'America/Edmonton', days: [
  ...Array.from({ length: 5 }, () => ({ kind: 'open', opens: '06:00', closes: '22:00' })),
  { kind: 'open', opens: '20:00', closes: '02:00' }, { kind: 'closed' },
] };
it('accepts separate weekday/weekend hours, closed days and overnight hours', () => {
  expect(gymOpeningHoursSchema.parse(hours)).toEqual(hours);
  expect(gymOpeningDaySchema.parse({ kind: 'unknown' })).toEqual({ kind: 'unknown' });
  expect(saveGymOpeningHoursSchema.parse({ openingHours: null })).toEqual({ openingHours: null });
});
it.each([
  { kind: 'open', opens: '24:00', closes: '02:00' },
  { kind: 'open', opens: '09:60', closes: '17:00' },
  { kind: 'open', opens: '9:00', closes: '17:00' },
  { kind: 'open', opens: '09:00', closes: '09:00' },
  { kind: 'open', opens: '09:00' },
  { kind: 'closed', opens: '09:00', closes: '17:00' },
])('rejects malformed or ambiguous day hours %j', day => {
  expect(gymOpeningDaySchema.safeParse(day).success).toBe(false);
});
it('requires exactly seven days and an IANA timezone', () => {
  for (const invalid of [{ ...hours, days: hours.days.slice(1) }, { ...hours, days: [...hours.days, { kind: 'unknown' }] },
    { ...hours, timeZone: 'Not/AZone' }]) expect(gymOpeningHoursSchema.safeParse(invalid).success).toBe(false);
});
it('accepts old cached gym records without inventing hours', () => {
  const cached = gymOverviewSchema.parse({ accountId: '10000000-0000-4000-8000-000000000001', timeZone: 'UTC',
    capturedAt: '2026-11-22T18:00:00Z', enrollment: null, workouts: [], exercises: [], programs: [], bodyWeights: [] });
  expect(cached.openingHours).toBeUndefined();
});
