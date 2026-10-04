import { academicReminderFireAt } from '../src';

describe('Explicit academic relative reminder policy', () => {
  it.each([
    ['2026-03-08T15:00:00Z', '2026-03-07T15:00:00Z'],
    ['2026-11-01T16:00:00Z', '2026-10-31T16:00:00Z'],
  ])('uses elapsed 24 hours across DST for %s', (at, expected) => {
    expect(academicReminderFireAt({ kind: 'instant', at }, 1440, 'unsubmitted')).toBe(expected);
  });
  it('allows an explicit zero lead at midnight, and missing work remains actionable', () => {
    expect(academicReminderFireAt({ kind: 'instant', at: '2026-10-11T00:00:00Z' }, 0, 'missing')).toBe('2026-10-11T00:00:00Z');
  });
  it.each([null, undefined, { kind: 'date' as const, date: '2026-10-10' }])('never invents delivery for %j', due => {
    expect(academicReminderFireAt(due, 60, 'unsubmitted')).toBeNull();
  });
  it.each(['submitted', 'graded'])('suppresses terminal %s state', state => {
    expect(academicReminderFireAt({ kind: 'instant', at: '2026-10-11T00:00:00Z' }, 60, state)).toBeNull();
  });
  it('requires configured intent and an active course', () => {
    const due = { kind: 'instant' as const, at: '2026-10-11T00:00:00Z' };
    expect(academicReminderFireAt(due, null, 'unsubmitted')).toBeNull();
    expect(academicReminderFireAt(due, 60, 'unsubmitted', false)).toBeNull();
  });
});

it('suppresses an ancient fire time outside the wire format instead of fabricating delivery', () => {
  expect(academicReminderFireAt({ kind: 'instant', at: '2026-10-11T00:00:00Z' }, 2147483647, 'unsubmitted')).toBeNull();
});
