export type FocusTimer = {
  phase: 'focus' | 'break'; status: 'ready' | 'running' | 'paused' | 'finished';
  durationMs: number; remainingMs: number; endsAt: number | null; startedAt: number | null; finishedAt: number | null;
};

export function createFocusTimer(minutes = 25, phase: FocusTimer['phase'] = 'focus'): FocusTimer {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 90) throw new Error('Choose 1–90 whole minutes.');
  return { phase, status: 'ready', durationMs: minutes * 60_000, remainingMs: minutes * 60_000, endsAt: null, startedAt: null, finishedAt: null };
}
export function focusRemaining(timer: FocusTimer, now: number): number {
  return timer.status === 'running' ? Math.max(0, Math.min(timer.durationMs, timer.endsAt! - now)) : timer.remainingMs;
}
export function advanceFocusTimer(timer: FocusTimer, now: number): FocusTimer {
  return timer.status === 'running' && focusRemaining(timer, now) === 0
    ? { ...timer, status: 'finished', remainingMs: 0, finishedAt: timer.endsAt, endsAt: null } : timer;
}
export function startFocusTimer(timer: FocusTimer, now: number): FocusTimer {
  if (timer.status !== 'ready' && timer.status !== 'paused') return advanceFocusTimer(timer, now);
  return { ...timer, status: 'running', endsAt: now + timer.remainingMs, startedAt: timer.startedAt ?? now };
}
export function pauseFocusTimer(timer: FocusTimer, now: number): FocusTimer {
  const current = advanceFocusTimer(timer, now);
  return current.status === 'running' ? { ...current, status: 'paused', remainingMs: focusRemaining(current, now), endsAt: null } : current;
}
export function focusClockLabel(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
