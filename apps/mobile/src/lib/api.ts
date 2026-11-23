import { useSessionStore } from '@/store/session';
import { apiBaseUrl } from './api-url';

/** Default limit for one request, so a stalled connection cannot hang a screen (#199). */
export const API_TIMEOUT_MS = 15_000;
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
/** `timeoutMs` overrides the default for calls the server may legitimately take longer on. */
export type ApiInit = RequestInit & { timeoutMs?: number };
export async function api<T>(path: string, { timeoutMs = API_TIMEOUT_MS, ...init }: ApiInit = {}): Promise<T> {
  const session = useSessionStore.getState().session;
  const headers = new Headers({ Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}) });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  // fetch gets one signal for both the caller's cancellation and the timeout. Without
  // AbortSignal.any, the caller's abort is forwarded until the request settles.
  const caller = init.signal;
  const forward = () => timeoutController.abort();
  let signal = timeoutController.signal, forwarding = false;
  if (caller && typeof AbortSignal.any === 'function') signal = AbortSignal.any([caller, timeoutController.signal]);
  else if (caller?.aborted) forward();
  else if (caller) { caller.addEventListener('abort', forward, { once: true }); forwarding = true; }
  try {
    let response: Response;
    try { response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, signal }); }
    catch (error) {
      // A timed-out write may still have committed, so it surfaces like a lost connection:
      // editors then ask the student to check before retrying (TypeError, like fetch's own).
      if (timeoutController.signal.aborted && !caller?.aborted) throw new TypeError('The request timed out.');
      throw error;
    }
    const body = await response.json().catch(() => undefined);
    const current = useSessionStore.getState().session;
    // A private read/write can discover revocation before the foreground check.
    // Wrong public sign-in credentials and obsolete/aborted requests cannot clear
    // the active owner or a freshly issued session for the same account.
    if (response.status === 401 && session && !init.signal?.aborted && !/^\/(auth|health)(?:[/?]|$)/.test(path)
      && headers.get('Authorization') === `Bearer ${session.accessToken}`
      && current?.user.id === session.user.id && current.accessToken === session.accessToken)
      await useSessionStore.getState().signOut({ unavailable: true });
    if (!response.ok) throw new ApiError(response.status, body?.message ?? 'The server could not complete that request.');
    return body as T;
  } finally {
    clearTimeout(timeout);
    if (forwarding) caller?.removeEventListener('abort', forward);
  }
}
export const json = (method: string, value?: unknown): RequestInit => ({ method, body: value === undefined ? undefined : JSON.stringify(value) });
