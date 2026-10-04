import { reminderAfterQuietHours, reminderAfterSnooze } from '../src';
describe('explicit reminder delivery after snooze (ToR 7, 13)', () => {
  const fireAt = '2030-03-08T18:00:12.345Z';
  it('preserves exact configuration time when no snooze is set', () => { expect(reminderAfterSnooze(fireAt, null)).toBe(fireAt); expect(reminderAfterSnooze(fireAt)).toBe(fireAt); });
  it('delays an earlier reminder to the snooze instant', () => { expect(reminderAfterSnooze(fireAt, '2030-03-09T18:00:00Z')).toBe('2030-03-09T18:00:00Z'); });
  it.each(['2030-03-07T18:00:00Z', '2030-03-08T18:00:12.345Z'])('never advances an existing reminder for snooze %s', until => { expect(reminderAfterSnooze(fireAt, until)).toBe(fireAt); });
  it('compares subsecond instants without discarding precision', () => { expect(reminderAfterSnooze(fireAt, '2030-03-08T18:00:12.346Z')).toBe('2030-03-08T18:00:12.346Z'); });
  it('applies account quiet hours after snooze across the spring transition', () => {
    const delayed = reminderAfterSnooze('2025-03-09T04:00:00Z', '2025-03-09T06:00:00Z');
    expect(reminderAfterQuietHours(delayed, 'America/Edmonton', '22:00', '07:00')).toBe('2025-03-09T13:00:00Z');
  });
});
