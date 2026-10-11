import { AppState } from 'react-native';
import { attachFocusRecovery, persistFocusDraft, restoreFocusDraft, focusDraftKey } from '../src/features/focus-recovery-sync';
import { focusOwner, useFocusStore } from '../src/store/focus';
import { useSessionStore } from '../src/store/session';
import { deleteCache, readCache, writeCache } from '../src/services/cache';
import type { Session } from '../src/lib/types';

jest.mock('../src/store/session', () => ({ useSessionStore: jest.requireActual('zustand').create(() => ({ session: null, ready: true })) }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn(), deleteCache: jest.fn() }));
const session: Session = { accessToken: 'first-login', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'first@example.test', displayName: 'First', timeZone: 'UTC', createdAt: '2026-10-07T00:00:00Z',
} };
const owner = focusOwner(session)!;
const target = { id: '20000000-0000-4000-8000-000000000001', title: 'Private outline' };
const start = Date.parse('2026-10-10T18:00:00Z');
let saved: unknown; let detach: (() => void) | undefined;
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(start); jest.clearAllMocks(); saved = undefined;
  useSessionStore.setState({ session }); useFocusStore.getState().clear();
  jest.mocked(readCache).mockReset().mockImplementation(async () => saved);
  jest.mocked(writeCache).mockReset().mockImplementation(async (_account, _key, value, valid) => { if (!valid || valid()) saved = value; });
  jest.mocked(deleteCache).mockReset().mockImplementation(async (_account, _key, valid) => { if (!valid || valid()) saved = undefined; });
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => { detach?.(); detach = undefined; jest.useRealTimers(); jest.restoreAllMocks(); });
function begin() { const store = useFocusStore.getState(); store.configure(owner, 25, target); store.start(owner); }
async function restart() { detach?.(); detach = undefined; useFocusStore.getState().clear(); await restoreFocusDraft(owner, session.user.id); }
it('checkpoints across navigation and restores paused progress after a simulated process restart', async () => {
  detach = attachFocusRecovery(owner, session.user.id); await settle(); begin();
  jest.advanceTimersByTime(65_000); await settle();
  expect(writeCache).toHaveBeenCalledWith(session.user.id, focusDraftKey, expect.objectContaining({ checkpointAt: start + 65_000 }), expect.any(Function));
  jest.setSystemTime(start + 7_200_000); await restart();
  expect(useFocusStore.getState()).toMatchObject({ target, recoveredAt: start + 65_000, timer: { status: 'paused', remainingMs: 1_435_000 } });
  const body = useFocusStore.getState().prepareRecord(owner)!;
  expect(body).toMatchObject({ focusedSeconds: 65, endedAt: new Date(start + 65_000).toISOString(), outcome: 'interrupted' });
});
it('resumes a recovered block without counting the closed interval', async () => {
  begin(); jest.setSystemTime(start + 10_000); await persistFocusDraft(owner, session.user.id);
  jest.setSystemTime(start + 7_200_000); await restart(); useFocusStore.getState().start(owner);
  jest.setSystemTime(start + 7_205_000);
  expect(useFocusStore.getState().prepareRecord(owner)).toMatchObject({ focusedSeconds: 15 });
  expect(useFocusStore.getState().recoveredAt).toBeNull();
});
it('keeps an uncertain save payload and request key byte-for-byte across restart', async () => {
  begin(); jest.setSystemTime(start + 65_000); const body = useFocusStore.getState().prepareRecord(owner)!;
  await persistFocusDraft(owner, session.user.id); jest.setSystemTime(start + 7_200_000); await restart();
  useFocusStore.getState().start(owner);
  expect(useFocusStore.getState().prepareRecord(owner)).toEqual(body);
  expect(useFocusStore.getState().timer.status).toBe('paused');
  expect(JSON.stringify(saved)).not.toContain(session.accessToken);
});
it('removes device recovery after saved acknowledgement or explicit discard', async () => {
  begin(); jest.setSystemTime(start + 65_000); const body = useFocusStore.getState().prepareRecord(owner)!;
  await persistFocusDraft(owner, session.user.id); useFocusStore.getState().markRecorded(owner, body.requestKey);
  await persistFocusDraft(owner, session.user.id); expect(saved).toBeUndefined();
  useFocusStore.getState().reset(owner); begin(); await persistFocusDraft(owner, session.user.id);
  useFocusStore.getState().reset(owner); await persistFocusDraft(owner, session.user.id); expect(saved).toBeUndefined();
});
it('withholds all new blocks until a failed recovery read is retried', async () => {
  jest.mocked(readCache).mockRejectedValueOnce(new Error('Disk unavailable'));
  await restoreFocusDraft(owner, session.user.id); begin();
  expect(useFocusStore.getState()).toMatchObject({ recoveryReady: false, owner: null, timer: { status: 'ready' } });
  expect(useFocusStore.getState().storageError).toMatch(/could not be recovered/);
  await restoreFocusDraft(owner, session.user.id); begin(); expect(useFocusStore.getState().timer.status).toBe('running');
});
it('purges corrupt or foreign drafts rather than exposing their title', async () => {
  saved = { accountId: 'another-account', target: { title: 'Foreign private title' } };
  await restoreFocusDraft(owner, session.user.id);
  expect(deleteCache).toHaveBeenCalledWith(session.user.id, focusDraftKey, expect.any(Function));
  expect(useFocusStore.getState()).toMatchObject({ recoveryReady: true, target: null });
});
it('does not revive a delayed draft read after logout or renewed login', async () => {
  begin(); jest.setSystemTime(start + 10_000); await persistFocusDraft(owner, session.user.id); const old = saved;
  let resolve!: (value: unknown) => void;
  jest.mocked(readCache).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const restoring = restoreFocusDraft(owner, session.user.id);
  useSessionStore.setState({ session: { ...session, accessToken: 'new-login' } });
  resolve(old); await restoring;
  expect(useFocusStore.getState()).toMatchObject({ owner: null, target: null });
});
it('rejects stale recovery callbacks before they can lock the newly signed-in account', async () => {
  useSessionStore.setState({ session: { ...session, accessToken: 'new-login' } });
  await restoreFocusDraft(owner, session.user.id);
  expect(readCache).not.toHaveBeenCalled();
  expect(useFocusStore.getState().recoveryReady).toBe(true);
});
it('does not read or write a draft into a different account partition', async () => {
  const other = '10000000-0000-4000-8000-000000000002'; begin();
  await restoreFocusDraft(owner, other); expect(readCache).not.toHaveBeenCalled();
  expect(await persistFocusDraft(owner, other)).toBe(false); expect(writeCache).not.toHaveBeenCalled();
});
it('preserves the last valid checkpoint when the device clock moves backward', async () => {
  begin(); jest.setSystemTime(start + 10_000); await persistFocusDraft(owner, session.user.id); const old = saved;
  jest.setSystemTime(start - 1_000);
  await expect(persistFocusDraft(owner, session.user.id)).rejects.toThrow(/device clock/);
  expect(saved).toBe(old);
});
