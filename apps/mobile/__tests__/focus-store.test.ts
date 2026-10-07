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
  expect(useFocusStore.getState().timer).toMatchObject({ phase: 'break', status: 'running', endsAt: 360_000 });
  store.reset(owner); expect(useFocusStore.getState().timer).toMatchObject({ phase: 'focus', status: 'ready', durationMs: 1_500_000 });
  expect(useFocusStore.getState().taskCompleted).toBe(false);
});
it('does not mark a different target as complete', () => {
  const store = useFocusStore.getState(); store.configure(owner, 25, target); store.completeTarget(owner, 'different-id');
  expect(useFocusStore.getState().taskCompleted).toBe(false);
  store.completeTarget(owner, target.id); expect(useFocusStore.getState().taskCompleted).toBe(true);
});
