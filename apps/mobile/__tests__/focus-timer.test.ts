import { advanceFocusTimer, createFocusTimer, focusClockLabel, focusRemaining, pauseFocusTimer, startFocusTimer } from '../src/features/focus-timer';

describe('Focus countdown behavior', () => {
  it('counts actual elapsed time instead of relying on interval callbacks', () => {
    const timer = startFocusTimer(createFocusTimer(25), 1000);
    expect(focusRemaining(timer, 61_000)).toBe(24 * 60_000);
    expect(advanceFocusTimer(timer, 1_501_000)).toMatchObject({ status: 'finished', remainingMs: 0, endsAt: null });
    expect(focusRemaining(timer, 9_000_000)).toBe(0);
  });
  it('excludes paused time and resumes the remaining duration', () => {
    const paused = pauseFocusTimer(startFocusTimer(createFocusTimer(1), 0), 10_000);
    expect(paused.status).toBe('paused'); expect(focusRemaining(paused, 600_000)).toBe(50_000);
    const resumed = startFocusTimer(paused, 600_000);
    expect(focusRemaining(resumed, 610_000)).toBe(40_000);
    expect(advanceFocusTimer(resumed, 650_000).status).toBe('finished');
  });
  it('does not restart on repeated start or turn an expired timer into a paused one', () => {
    const timer = startFocusTimer(createFocusTimer(1), 0);
    expect(startFocusTimer(timer, 1000).endsAt).toBe(60_000);
    expect(pauseFocusTimer(timer, 60_000).status).toBe('finished');
    const finished = advanceFocusTimer(timer, 60_000);
    expect(startFocusTimer(finished, 120_000)).toBe(finished);
  });
  it('caps remaining time after a backward clock adjustment', () => {
    expect(focusRemaining(startFocusTimer(createFocusTimer(1), 100_000), 0)).toBe(60_000);
  });
  it.each([0, -1, 91, 1.5, NaN, Infinity])('rejects invalid duration %s', minutes => {
    expect(() => createFocusTimer(minutes)).toThrow('Choose 1–90 whole minutes.');
  });
  it.each([[0, '00:00'], [1, '00:01'], [59_001, '01:00'], [90 * 60_000, '90:00']])('shows a useful countdown at %s ms', (ms, label) => {
    expect(focusClockLabel(ms)).toBe(label);
  });
});
