import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError } from '../src/lib/api';
import { SessionAccessSync } from '../src/features/session-access-sync';
import { useAction, useTasks } from '../src/features/queries';
import { useSessionStore } from '../src/store/session';
import { queryClient } from '../src/lib/query-client';
import { clearAccountCache } from '../src/services/cache';
import { clearScheduledReminders } from '../src/services/reminders';
import { clearAccountExports } from '../src/services/account-export';
import type { Session } from '../src/lib/types';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('../src/services/cache', () => ({ clearAccountCache: jest.fn().mockResolvedValue(undefined), deleteCache: jest.fn().mockResolvedValue(undefined),
  readCache: jest.fn().mockResolvedValue(undefined), writeCache: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/account-export', () => ({ clearAccountExports: jest.fn().mockResolvedValue(undefined) }));
const first: Session = { accessToken: 'first-token', expiresAt: '2000-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'student@example.test', displayName: 'Student', timeZone: 'UTC', createdAt: '2026-10-11T00:00:00Z',
} };
const second = { ...first, accessToken: 'second-token', user: { ...first.user, id: '10000000-0000-4000-8000-000000000002' } };
const response = (status = 200, value: unknown = first.user) => ({ status, ok: status >= 200 && status < 300, json: async () => value }) as Response;
let change: (state: AppStateStatus) => void, remove: jest.Mock;
const flush = () => act(async () => {});
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
beforeEach(() => {
  jest.clearAllMocks(); jest.useRealTimers(); queryClient.clear();
  useSessionStore.setState({ session: first, ready: true, cleanupError: null, accountDeleted: false, sessionUnavailable: false });
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } });
  queryClient.setQueryData(['account', first.user.id, 'tasks'], [{ title: 'Cached notes' }]);
  jest.mocked(SecureStore.deleteItemAsync).mockReset().mockResolvedValue(undefined);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(first));
  remove = jest.fn(); AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { change = callback; return { remove }; });
  global.fetch = jest.fn().mockResolvedValue(response());
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); queryClient.clear(); });

it('validates a restored credential with an uncached, bounded read rather than trusting the device expiry clock', async () => {
  useSessionStore.setState({ session: null, ready: false }); const ui = render(<SessionAccessSync/>);
  expect(fetch).not.toHaveBeenCalled(); await act(async () => useSessionStore.getState().restore()); await flush();
  expect(fetch).toHaveBeenCalledTimes(1); const [url, init] = jest.mocked(fetch).mock.calls[0];
  expect(url).toMatch(/\/me$/); expect(init).toMatchObject({ cache: 'no-store', signal: expect.anything() });
  expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${first.accessToken}`);
  expect(useSessionStore.getState().session).toEqual(first); ui.unmount(); expect(init?.signal?.aborted).toBe(true);
});
it.each(['expired', 'revoked', 'public-cutover'])('returns a server-rejected %s session to sign-in and clears only its private device data', async () => {
  jest.mocked(fetch).mockResolvedValue(response(401, { message: 'Account session is unavailable' })); render(<SessionAccessSync/>); await flush();
  expect(useSessionStore.getState()).toMatchObject({ session: null, sessionUnavailable: true, accountDeleted: false, cleanupError: null });
  expect(queryClient.getQueryData(['account', first.user.id, 'tasks'])).toBeUndefined();
  expect(clearAccountCache).toHaveBeenCalledWith(first.user.id); expect(clearAccountExports).toHaveBeenCalledWith(first.user.id);
  expect(clearScheduledReminders).toHaveBeenCalled(); expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([503, 500, 429])('keeps cached reads and the session after HTTP %s', async status => {
  jest.mocked(fetch).mockResolvedValue(response(status)); render(<SessionAccessSync/>); await flush();
  expect(useSessionStore.getState().session).toEqual(first); expect(clearAccountCache).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(['account', first.user.id, 'tasks'])).toEqual([{ title: 'Cached notes' }]);
});
it.each(['offline', 'malformed'])('keeps cached reads after an %s response', async kind => {
  if (kind === 'offline') jest.mocked(fetch).mockRejectedValue(new Error('offline'));
  else jest.mocked(fetch).mockResolvedValue(response(200, { id: 'incomplete' }));
  render(<SessionAccessSync/>); await flush(); expect(useSessionStore.getState().session).toEqual(first);
  expect(clearAccountCache).not.toHaveBeenCalled();
});
it('aborts a timed-out check, preserves cached data and retries on the next foreground transition', async () => {
  jest.useFakeTimers();
  jest.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
  render(<SessionAccessSync/>); const signal = jest.mocked(fetch).mock.calls[0][1]?.signal;
  await act(async () => jest.advanceTimersByTime(15_000)); expect(signal?.aborted).toBe(true);
  expect(useSessionStore.getState().session).toEqual(first); expect(clearAccountCache).not.toHaveBeenCalled();
  await act(async () => { change('background'); change('active'); }); expect(fetch).toHaveBeenCalledTimes(2);
});
it('deduplicates overlapping foreground checks and retries only when returning to active', async () => {
  let finish!: (value: Response) => void; jest.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<SessionAccessSync/>); await act(async () => { change('active'); change('inactive'); change('active'); change('background'); change('active'); });
  expect(fetch).toHaveBeenCalledTimes(1); await act(async () => finish(response()));
  await act(async () => { change('active'); }); expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => { change('background'); change('active'); }); expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([second, { ...first, accessToken: 'renewed-same-owner' }])('ignores a late rejection after a newer session is set', async fresh => {
  let finish!: (value: Response) => void; jest.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<SessionAccessSync/>); await act(async () => useSessionStore.setState({ session: fresh }));
  await act(async () => finish(response(401))); expect(useSessionStore.getState().session).toEqual(fresh);
  expect(clearAccountCache).not.toHaveBeenCalled(); expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});
it('aborts on unmount and ignores a fetch implementation that still supplies a late rejection', async () => {
  let finish!: (value: Response) => void; jest.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const ui = render(<SessionAccessSync/>), signal = jest.mocked(fetch).mock.calls[0][1]?.signal; ui.unmount();
  expect(remove).toHaveBeenCalled(); expect(signal?.aborted).toBe(true);
  await act(async () => finish(response(401))); expect(useSessionStore.getState().session).toEqual(first); expect(clearAccountCache).not.toHaveBeenCalled();
});
it('attempts all cleanup after rejection and permits a fresh login after cleanup retry', async () => {
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('storage busy'));
  jest.mocked(fetch).mockResolvedValueOnce(response(401)); render(<SessionAccessSync/>); await flush();
  expect(useSessionStore.getState()).toMatchObject({ session: null, sessionUnavailable: true, cleanupError: expect.any(String) });
  expect(clearAccountCache).toHaveBeenCalled(); expect(clearAccountExports).toHaveBeenCalled(); expect(clearScheduledReminders).toHaveBeenCalled();
  await act(async () => useSessionStore.getState().retryCleanup()); expect(useSessionStore.getState().cleanupError).toBeNull();
  await act(async () => useSessionStore.getState().setSession(second)); expect(useSessionStore.getState()).toMatchObject({ session: second, sessionUnavailable: false });
});
it('handles a private mutation rejection without waiting for an app-state transition', async () => {
  jest.mocked(fetch).mockResolvedValue(response(401));
  await expect(api('/tasks', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(ApiError);
  expect(useSessionStore.getState()).toMatchObject({ session: null, sessionUnavailable: true });
});
it('keeps the active account when an unmounted cached query supplies a late 401 after cancellation', async () => {
  let finish!: (value: Response) => void; jest.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const ui = renderHook(() => useTasks(), { wrapper: Wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1)); const signal = jest.mocked(fetch).mock.calls[0][1]?.signal;
  ui.unmount(); expect(signal?.aborted).toBe(true);
  await act(async () => finish(response(401))); expect(useSessionStore.getState().session).toEqual(first); expect(clearAccountCache).not.toHaveBeenCalled();
});
it('returns a currently rejected query mutation to reauthentication through the shared API boundary', async () => {
  jest.mocked(fetch).mockResolvedValue(response(401)); const { result } = renderHook(() => useAction(), { wrapper: Wrapper });
  await act(async () => { await expect(result.current.mutateAsync({ path: '/tasks', body: { title: 'Task' } })).rejects.toMatchObject({ status: 401 }); });
  expect(useSessionStore.getState()).toMatchObject({ session: null, sessionUnavailable: true }); expect(clearAccountCache).toHaveBeenCalledWith(first.user.id);
});
it.each(['/auth/login', '/auth/verification/request', '/health/live'])('keeps the active session when the public endpoint %s rejects credentials', async path => {
  jest.mocked(fetch).mockResolvedValue(response(401)); await expect(api(path)).rejects.toMatchObject({ status: 401 });
  expect(useSessionStore.getState().session).toEqual(first); expect(clearAccountCache).not.toHaveBeenCalled();
});
it.each([new Headers({ Authorization: 'Bearer other-token' }), [['authorization', 'Bearer other-token']] as [string, string][], { authorization: 'Bearer other-token' }])('respects every HeadersInit override without treating it as the current credential', async headers => {
  jest.mocked(fetch).mockResolvedValue(response(401)); await expect(api('/me', { headers })).rejects.toMatchObject({ status: 401 });
  expect(new Headers(jest.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer other-token');
  expect(useSessionStore.getState().session).toEqual(first); expect(clearAccountCache).not.toHaveBeenCalled();
});
