import { useLayoutEffect } from 'react';
import { AppState } from 'react-native';
import { readCache, writeCache, deleteCache } from '@/services/cache';
import { focusOwner, useFocusStore } from '@/store/focus';
import { useSessionStore } from '@/store/session';
import { makeFocusDraft, parseFocusDraft } from './focus-recovery';

export const focusDraftKey = 'focus-draft:v1';
let revision = 0;
export async function persistFocusDraft(owner: string, accountId: string, attached = () => true) {
  const state = useFocusStore.getState();
  const isCurrent = () => attached() && focusOwner(useSessionStore.getState().session) === owner
    && useSessionStore.getState().session?.user.id === accountId
    && useFocusStore.getState().owner === owner && useFocusStore.getState().recoveryReady
    && useFocusStore.getState().timer === state.timer && useFocusStore.getState().requestKey === state.requestKey
    && useFocusStore.getState().recorded === state.recorded && useFocusStore.getState().recording === state.recording
    && useFocusStore.getState().target === state.target && useFocusStore.getState().taskCompleted === state.taskCompleted;
  if (!isCurrent()) return false;
  const draft = makeFocusDraft(state, accountId, Date.now());
  if (!draft && !state.recorded && state.timer.phase === 'focus' && state.timer.startedAt !== null) {
    throw new Error('Your device clock changed. Pause or reset the block before saving new time.');
  }
  if (draft) await writeCache(accountId, focusDraftKey, draft, isCurrent);
  else await deleteCache(accountId, focusDraftKey, isCurrent);
  return isCurrent();
}
export async function restoreFocusDraft(owner: string, accountId: string) {
  if (focusOwner(useSessionStore.getState().session) !== owner || useSessionStore.getState().session?.user.id !== accountId) return;
  const restoring = ++revision;
  const isCurrent = () => restoring === revision && focusOwner(useSessionStore.getState().session) === owner;
  useFocusStore.setState({ recoveryReady: false, storageError: null });
  try {
    const raw = await readCache<unknown>(accountId, focusDraftKey);
    if (!isCurrent()) return;
    const draft = parseFocusDraft(raw, accountId, Date.now());
    if (raw !== undefined && !draft) await deleteCache(accountId, focusDraftKey, isCurrent);
    if (isCurrent()) useFocusStore.getState().recover(owner, draft);
  } catch {
    if (isCurrent()) useFocusStore.setState({ storageError: 'Your focus block could not be recovered. Retry before starting another block.' });
  }
}
export function attachFocusRecovery(owner: string, accountId: string) {
  let attached = true;
  const isCurrent = () => attached && focusOwner(useSessionStore.getState().session) === owner;
  const checkpoint = () => {
    const state = useFocusStore.getState();
    if (!isCurrent() || !state.recoveryReady || state.owner !== owner) return;
    void persistFocusDraft(owner, accountId, isCurrent).then(saved => {
      if (saved && useFocusStore.getState().storageError) useFocusStore.setState({ storageError: null });
    }).catch(() => {
      if (isCurrent() && useFocusStore.getState().timer === state.timer) useFocusStore.setState({ storageError: 'Device recovery could not update. Keep the app open and retry saving when device storage is available.' });
    });
  };
  const unsubscribe = useFocusStore.subscribe((next, previous) => {
    if (next.timer !== previous.timer || next.recording !== previous.recording || next.recorded !== previous.recorded
      || next.target !== previous.target || next.taskCompleted !== previous.taskCompleted || next.recoveryReady !== previous.recoveryReady) checkpoint();
  });
  const interval = setInterval(() => { if (useFocusStore.getState().timer.status === 'running') checkpoint(); }, 5_000);
  const listener = AppState.addEventListener('change', checkpoint);
  void restoreFocusDraft(owner, accountId);
  return () => { attached = false; ++revision; unsubscribe(); clearInterval(interval); listener.remove(); };
}
export function FocusRecoverySync() {
  const session = useSessionStore(state => state.session);
  const ready = useSessionStore(state => state.ready);
  const owner = focusOwner(session);
  useLayoutEffect(() => {
    if (ready && session && owner) return attachFocusRecovery(owner, session.user.id);
  }, [ready, owner, session?.user.id]);
  return null;
}
