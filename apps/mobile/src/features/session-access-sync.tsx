import { useLayoutEffect } from 'react';
import { AppState } from 'react-native';
import { api } from '@/lib/api';
import { useSessionStore } from '@/store/session';

export function attachSessionAccess(accountId: string, token: string) {
  let attached = true, checking = false, controller: AbortController | undefined;
  let previous = AppState.currentState;
  const current = () => attached && useSessionStore.getState().session?.user.id === accountId
    && useSessionStore.getState().session?.accessToken === token;
  const check = async () => {
    if (!current() || checking) return;
    checking = true;
    const request = new AbortController();
    controller = request;
    const finish = () => {
      clearTimeout(deadline);
      // An expired check can finish after the next check has already started.
      if (controller === request) checking = false;
    };
    const deadline = setTimeout(() => { request.abort(); finish(); }, 15_000);
    try {
      const value = await api('/me', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: request.signal });
      if (current() && !request.signal.aborted)
        await useSessionStore.getState().syncProfile(accountId, token, value, () => current() && !request.signal.aborted);
    } catch {
      // api handles only a still-current private 401. Connectivity, timeouts,
      // server failures and malformed data leave the offline read cache intact.
      // Failed profile persistence retries on the next successful check.
    } finally { finish(); }
  };
  const listener = AppState.addEventListener('change', state => {
    const foreground = previous !== 'active' && state === 'active'; previous = state;
    if (foreground) void check();
  });
  void check();
  return () => { attached = false; controller?.abort(); listener.remove(); };
}
export function SessionAccessSync() {
  const session = useSessionStore(state => state.session), ready = useSessionStore(state => state.ready);
  useLayoutEffect(() => {
    if (ready && session) return attachSessionAccess(session.user.id, session.accessToken);
  }, [ready, session?.user.id, session?.accessToken]);
  return null;
}
