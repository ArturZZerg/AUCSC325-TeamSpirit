import { reminderAfterQuietHours } from '../src';
const zone = 'America/Edmonton';
describe('account-local quiet hours (ToR 13)', () => {
  it.each([
    ['2025-03-08T04:00:00Z', '2025-03-08T04:00:00Z'],
    ['2025-03-08T05:00:00Z', '2025-03-08T14:00:00Z'],
    ['2025-03-08T13:59:59Z', '2025-03-08T14:00:00Z'],
    ['2025-03-08T14:00:00Z', '2025-03-08T14:00:00Z'],
  ])('delays overnight fire time %s to %s', (input, expected) => {
    expect(reminderAfterQuietHours(input, zone, '22:00', '07:00')).toBe(expected);
  });
  it('supports quiet hours entirely within one day', () => {
    expect(reminderAfterQuietHours('2025-03-08T19:30:00Z', zone, '12:00', '14:00')).toBe('2025-03-08T21:00:00Z');
  });
  it('uses actual local boundaries across the spring and fall transitions', () => {
    expect(reminderAfterQuietHours('2025-03-09T05:30:00Z', zone, '22:00', '07:00')).toBe('2025-03-09T13:00:00Z');
    expect(reminderAfterQuietHours('2025-11-02T04:30:00Z', zone, '22:00', '07:00')).toBe('2025-11-02T14:00:00Z');
    expect(reminderAfterQuietHours('2025-03-09T08:00:00Z', zone, '00:00', '02:30')).toBe('2025-03-09T09:30:00Z');
  });
  it.each([[null, null], ['22:00', null], [null, '07:00'], ['07:00', '07:00']])('disables missing/equal quiet bounds %s to %s', (start, end) => {
    expect(reminderAfterQuietHours('2025-03-08T12:00:00Z', zone, start, end)).toBe('2025-03-08T12:00:00Z');
  });
  it('never shifts the second repeated fall-back hour into a past first-hour end', () => {
    expect(reminderAfterQuietHours('2025-11-02T07:15:00Z', zone, '00:00', '01:30')).toBe('2025-11-02T07:30:00Z');
    expect(reminderAfterQuietHours('2025-11-02T08:15:00Z', zone, '00:00', '01:30')).toBe('2025-11-02T08:30:00Z');
  });
});
