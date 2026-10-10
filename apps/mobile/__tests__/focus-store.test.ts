import { focusOwner, useFocusStore } from '../src/store/focus';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';
jest.mock('../src/store/session', () => ({ useSessionStore: jest.requireActual('zustand').create(() => ({ session: null })) }));
const session: Session = { accessToken: 'first', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'first@example.test', displayName: 'First', timeZone: 'UTC', createdAt: '2026-10-07T00:00:00Z',
} };
const owner = focusOwner(session)!;
const target = { id: '20000000-0000-4000-8000-000000000001', title: 'Private study goal' };
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); useSessionStore.setState({ session }); useFocusStore.getState().clear(); });
afterEach(() => jest.useRealTimers());
it('keeps an active selection when another task is requested and allows pause/resume', () => {
  const store = useFocusStore.getState(); store.configure(owner, 25, target); store.start(owner);
  store.configure(owner, 50, { ...target, title: 'Other task' });
  expect(useFocusStore.getState().target).toEqual(target);
  jest.setSystemTime(10_000); store.pause(owner); expect(useFocusStore.getState().timer.remainingMs).toBe(1_490_000);
  jest.setSystemTime(20_000); store.start(owner); expect(useFocusStore.getState().timer.endsAt).toBe(1_510_000);
});
it('clears the timer and private goal immediately on logout', () => {
  const store = useFocusStore.getState(); store.configure(owner, 25, target); store.start(owner);
  useSessionStore.setState({ session: null });
  expect(useFocusStore.getState()).toMatchObject({ owner: null, target: null, timer: { status: 'ready' } });
});
it.each([false, true])('clears state on a new session (same account=%s) and blocks old callbacks', sameAccount => {
  useFocusStore.getState().configure(owner, 25, target);
  useSessionStore.setState({ session: { ...session, accessToken: 'second', user: { ...session.user, id: sameAccount ? session.user.id : '10000000-0000-4000-8000-000000000002' } } });
  useFocusStore.getState().configure(owner, 50, target); useFocusStore.getState().start(owner);
  useFocusStore.getState().completeTarget(owner, target.id);
  expect(useFocusStore.getState()).toMatchObject({ owner: null, target: null, taskCompleted: false, timer: { status: 'ready' } });
});
it('starts a short break only after focus expiry and resets to a new focus block', () => {
  const store = useFocusStore.getState(); store.configure(owner, 1, target); store.start(owner);
  store.takeBreak(owner); expect(useFocusStore.getState().timer.phase).toBe('focus');
  jest.setSystemTime(60_000); store.takeBreak(owner);
  expect(useFocusStore.getState().timer.phase).toBe('focus');
  const body = store.prepareRecord(owner)!; store.markRecorded(owner, body.requestKey); store.takeBreak(owner);
  expect(useFocusStore.getState().timer).toMatchObject({ phase: 'break', status: 'running', endsAt: 360_000 });
  store.reset(owner); expect(useFocusStore.getState().timer).toMatchObject({ phase: 'focus', status: 'ready', durationMs: 1_500_000 });
  expect(useFocusStore.getState().taskCompleted).toBe(false);
});
it('records elapsed focus without paused time and caps delayed expiry at its end instant', () => {
  const store = useFocusStore.getState(); store.configure(owner, 1, target); store.start(owner);
  jest.setSystemTime(10_000); store.pause(owner); jest.setSystemTime(120_000); store.start(owner);
  jest.setSystemTime(500_000);
  expect(store.prepareRecord(owner)).toMatchObject({ startedAt: '1970-01-01T00:00:00.000Z', endedAt: '1970-01-01T00:02:50.000Z',
    focusedSeconds: 60, plannedMinutes: 1, outcome: 'completed', taskId: target.id });
});
it('freezes an early finish for identical retries and cannot resume it', () => {
  const store = useFocusStore.getState(); store.configure(owner, 25, null); store.start(owner);
  jest.setSystemTime(65_000); const body = store.prepareRecord(owner);
  expect(body).toMatchObject({ taskId: null, title: 'Free study', focusedSeconds: 65, outcome: 'interrupted' });
  jest.setSystemTime(120_000); store.start(owner);
  expect(useFocusStore.getState().timer.status).toBe('paused'); expect(store.prepareRecord(owner)).toBe(body);
});
it('rejects zero time, clock rollback and callbacks from another login', () => {
  const store = useFocusStore.getState(); store.configure(owner, 25, target); store.start(owner);
  expect(store.prepareRecord(owner)).toBeNull(); jest.setSystemTime(-1000); expect(store.prepareRecord(owner)).toBeNull();
  jest.setSystemTime(1000); const body = store.prepareRecord(owner)!;
  useSessionStore.setState({ session: null }); store.markRecorded(owner, body.requestKey);
  expect(store.prepareRecord(owner)).toBeNull(); expect(useFocusStore.getState().recorded).toBe(false);
});
it('does not acknowledge or reset a later block when an earlier save finishes after discard', () => {
  const store = useFocusStore.getState(); store.configure(owner, 25, target); store.start(owner);
  jest.setSystemTime(1000); const earlier = store.prepareRecord(owner)!; store.reset(owner); store.start(owner);
  expect(store.markRecorded(owner, earlier.requestKey)).toBe(false);
  expect(useFocusStore.getState().timer.status).toBe('running'); expect(useFocusStore.getState().recorded).toBe(false);
});
it('does not mark a different target as complete', () => {
  const store = useFocusStore.getState(); store.configure(owner, 25, target); store.completeTarget(owner, 'different-id');
  expect(useFocusStore.getState().taskCompleted).toBe(false);
  store.completeTarget(owner, target.id); expect(useFocusStore.getState().taskCompleted).toBe(true);
});
