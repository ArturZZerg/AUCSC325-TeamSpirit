import { useSessionStore } from '@/store/session';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = useSessionStore.getState().session;
  const headers = new Headers({ Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}) });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
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
}
export const json = (method: string, value?: unknown): RequestInit => ({ method, body: value === undefined ? undefined : JSON.stringify(value) });
