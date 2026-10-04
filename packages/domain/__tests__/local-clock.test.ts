import { instantAtLocalTime, localClockAt } from '../src';
describe('explicit local clock input', () => {
  it('converts account-local times to UTC and reads them back', () => {
    expect(instantAtLocalTime('2025-03-08', '17:00', 'America/Edmonton')).toBe('2025-03-09T00:00:00Z');
    expect(localClockAt('2025-03-09T00:00:12.345Z', 'America/Edmonton')).toEqual({ date: '2025-03-08', time: '17:00' });
  });
  it('converts midnight and leap dates without treating calendar dates as UTC', () => {
    expect(instantAtLocalTime('2024-02-29', '00:00', 'Asia/Kolkata')).toBe('2024-02-28T18:30:00Z');
    expect(instantAtLocalTime('2025-03-09', '00:00', 'America/Edmonton')).toBe('2025-03-09T07:00:00Z');
  });
  it.each([['2025-03-09', '02:30'], ['2025-11-02', '01:30']])('rejects missing or repeated DST time %s %s', (date, time) => {
    expect(() => instantAtLocalTime(date, time, 'America/Edmonton')).toThrow();
  });
  it('accepts unique times around both DST transitions', () => {
    expect(instantAtLocalTime('2025-03-09', '03:30', 'America/Edmonton')).toBe('2025-03-09T09:30:00Z');
    expect(instantAtLocalTime('2025-11-02', '02:30', 'America/Edmonton')).toBe('2025-11-02T09:30:00Z');
  });
  it('rejects invalid dates, times and timezone identifiers', () => {
    expect(() => instantAtLocalTime('2025-02-30', '12:00', 'UTC')).toThrow();
    expect(() => instantAtLocalTime('2025-03-08', '25:00', 'UTC')).toThrow();
    expect(() => instantAtLocalTime('2025-03-08', '12:00', 'Mars/Base')).toThrow();
  });
});
