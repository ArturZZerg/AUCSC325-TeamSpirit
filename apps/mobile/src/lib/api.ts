import { useSessionStore } from '@/store/session';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useSessionStore.getState().session?.accessToken;
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(response.status, body?.message ?? 'The server could not complete that request.');
  return body as T;
}
export const json = (method: string, value?: unknown): RequestInit => ({ method, body: value === undefined ? undefined : JSON.stringify(value) });
