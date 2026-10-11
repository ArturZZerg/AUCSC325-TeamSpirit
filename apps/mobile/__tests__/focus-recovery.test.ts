import { createFocusTimer, pauseFocusTimer, startFocusTimer } from '../src/features/focus-timer';
import { makeFocusDraft, parseFocusDraft } from '../src/features/focus-recovery';

const accountId = '10000000-0000-4000-8000-000000000001';
const target = { id: '20000000-0000-4000-8000-000000000001', title: 'Outline my report' };
const start = Date.parse('2026-10-10T18:00:00Z');
function block() { return { timer: startFocusTimer(createFocusTimer(25), start), target, taskCompleted: false,
  requestKey: 'focus-recovery-example', recording: null, recorded: false, recoveredAt: null }; }
it('recovers only checkpointed time and excludes the closed-app interval', () => {
  const draft = makeFocusDraft(block(), accountId, start + 65_000)!;
  expect(parseFocusDraft(draft, accountId, start + 7_200_000)).toEqual(draft);
  expect(draft.timer).toMatchObject({ status: 'paused', remainingMs: 1_435_000, endsAt: null });
});
it('caps a late checkpoint at expiry and retains a finished block', () => {
  const draft = makeFocusDraft(block(), accountId, start + 7_200_000)!;
  expect(draft.timer).toMatchObject({ status: 'finished', remainingMs: 0, finishedAt: start + 1_500_000 });
});
it('does not add paused time and preserves a recovered checkpoint until explicit resume', () => {
  const state = block(); state.timer = pauseFocusTimer(state.timer, start + 10_000);
  const first = makeFocusDraft(state, accountId, start + 20_000)!;
  const recovered = { ...state, timer: first.timer, recoveredAt: first.checkpointAt };
  expect(makeFocusDraft(recovered, accountId, start + 7_200_000)).toEqual(first);
});
it.each(['foreign', 'future', 'version', 'duration', 'remaining', 'elapsed', 'finish', 'secret', 'title', 'recording'])('rejects %s draft data', kind => {
  const draft = makeFocusDraft(block(), accountId, start + 65_000)!;
  const value = structuredClone(draft) as unknown as Record<string, unknown>;
  const timer = value.timer as Record<string, unknown>;
  if (kind === 'foreign') value.accountId = '10000000-0000-4000-8000-000000000002';
  if (kind === 'future') value.checkpointAt = start + 66_000;
  if (kind === 'version') value.version = 99;
  if (kind === 'duration') timer.durationMs = 10;
  if (kind === 'remaining') timer.remainingMs = -1;
  if (kind === 'elapsed') timer.remainingMs = 1;
  if (kind === 'finish') timer.finishedAt = start;
  if (kind === 'secret') value.accessToken = 'never persist credentials';
  if (kind === 'title') value.target = { ...target, title: '' };
  if (kind === 'recording') value.recording = { requestKey: 'invalid body' };
  expect(parseFocusDraft(value, accountId, start + 65_000)).toBeNull();
});
it('never persists breaks, ready blocks or already saved history', () => {
  expect(makeFocusDraft({ ...block(), timer: createFocusTimer() }, accountId, start)).toBeNull();
  expect(makeFocusDraft({ ...block(), timer: startFocusTimer(createFocusTimer(5, 'break'), start) }, accountId, start)).toBeNull();
  expect(makeFocusDraft({ ...block(), recorded: true }, accountId, start + 65_000)).toBeNull();
});
