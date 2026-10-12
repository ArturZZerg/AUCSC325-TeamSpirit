import { useLayoutEffect } from 'react';
import { AppState } from 'react-native';
import { userSchema } from '@campusflow/contracts';
import { api } from '@/lib/api';
import { useSessionStore } from '@/store/session';

export function attachSessionAccess(accountId: string, token: string) {
  let attached = true, checking = false, controller: AbortController | undefined;
  let previous = AppState.currentState;
  const current = () => attached && useSessionStore.getState().session?.user.id === accountId
    && useSessionStore.getState().session?.accessToken === token;
  const check = async () => {
    if (!current() || checking) return;
    checking = true; controller = new AbortController();
    const deadline = setTimeout(() => controller?.abort(), 15_000);
    try {
      const value = await api('/me', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (current()) userSchema.parse(value);
    } catch {
      // api handles only a still-current private 401. Connectivity, timeouts,
      // server failures and malformed data leave the offline read cache intact.
    } finally { clearTimeout(deadline); checking = false; }
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
