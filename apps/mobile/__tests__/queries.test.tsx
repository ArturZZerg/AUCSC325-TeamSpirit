import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { useAction, useGoalHistory, useTasks } from '../src/features/queries';
import { snapshotFixture } from './snapshot-fixture';
import { readCache, writeCache, clearAccountCache } from '../src/services/cache';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';

jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn(), clearAccountCache: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

const first: Session = { accessToken: 'first-token', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'first@example.test', displayName: 'First', timeZone: 'America/Edmonton', createdAt: '2026-10-03T00:00:00Z',
} };
const second: Session = { ...first, accessToken: 'second-token', user: { ...first.user, id: '10000000-0000-4000-8000-000000000002', email: 'second@example.test' } };
const task = { id: '20000000-0000-4000-8000-000000000001', title: 'Saved task', description: null, priority: 'medium', category: 'personal', due: null, scheduled: null,
  recurrence: null, reminder: null, estimatedMinutes: null, completedAt: null, snoozedUntil: null, mainGoalDate: null, createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' };
const oldTasks = [task];
const freshTasks = [{ ...task, title: 'Fresh task' }];
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } });
  useSessionStore.setState({ session: first, ready: true });
  jest.mocked(api).mockReset().mockResolvedValue(freshTasks);
  jest.mocked(readCache).mockReset().mockResolvedValue(undefined);
  jest.mocked(writeCache).mockReset().mockResolvedValue(undefined);
  jest.mocked(clearAccountCache).mockResolvedValue(undefined);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});
afterEach(() => { queryClient.clear(); });

describe('account-scoped cached query lifecycle (ToR 10, 19)', () => {
  it('reads validated goal history offline and isolates it when the account changes', async () => {
    const snapshot = snapshotFixture(); const rows = snapshot.goalCompletions; const goalId = rows[0].goalId;
    jest.mocked(api).mockRejectedValue(new Error('Offline'));
    jest.mocked(readCache).mockImplementation(accountId => Promise.resolve(accountId === first.user.id ? rows : []));
    const { result } = renderHook(() => useGoalHistory(goalId), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(api).toHaveBeenCalledWith(`/goals/${goalId}/history`, expect.anything());
    await act(async () => { await useSessionStore.getState().setSession(second); });
    expect(result.current.data).not.toEqual(rows);
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(readCache).toHaveBeenCalledWith(second.user.id, `goalHistory:${goalId}`);
  });
  it('rejects history belonging to another goal from SQLite and the server', async () => {
    const rows = snapshotFixture().goalCompletions;
    jest.mocked(api).mockResolvedValue(rows); jest.mocked(readCache).mockResolvedValue(rows);
    const { result } = renderHook(() => useGoalHistory('30000000-0000-4000-8000-000000000002'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeUndefined(); expect(writeCache).not.toHaveBeenCalled();
  });
  it('shows saved data immediately while a server read remains pending', async () => {
    const pending = deferred<unknown>();
    jest.mocked(api).mockReturnValue(pending.promise);
    jest.mocked(readCache).mockResolvedValue(oldTasks);
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(oldTasks));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(true);
    await act(async () => { pending.resolve(freshTasks); });
    await waitFor(() => expect(result.current.data).toEqual(freshTasks));
    expect(writeCache).toHaveBeenCalledWith(first.user.id, 'tasks', freshTasks);
  });

  it('retains an offline refresh error even if the SQLite read finishes later', async () => {
    const disk = deferred<unknown>();
    jest.mocked(api).mockRejectedValue(new Error('Offline'));
    jest.mocked(readCache).mockReturnValue(disk.promise);
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Offline'));
    await act(async () => { disk.resolve(oldTasks); });
    await waitFor(() => expect(result.current.data).toEqual(oldTasks));
    expect(result.current.error?.message).toBe('Offline');
    expect(result.current.isLoading).toBe(false);
    expect(writeCache).not.toHaveBeenCalled();
  });

  it('keeps fresh server results when SQLite returns older data later', async () => {
    const disk = deferred<unknown>();
    jest.mocked(readCache).mockReturnValue(disk.promise);
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(freshTasks));
    await act(async () => { disk.resolve(oldTasks); });
    expect(result.current.data).toEqual(freshTasks);
  });

  it('does not fail a server read when cache reading or saving fails', async () => {
    jest.mocked(readCache).mockRejectedValue(new Error('Cannot read SQLite'));
    jest.mocked(writeCache).mockRejectedValue(new Error('Cannot write SQLite'));
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(freshTasks));
    expect(result.current.error).toBeNull();
  });

  it('cancels an old read before a write and refreshes only the owning account', async () => {
    const oldRead = deferred<unknown>();
    jest.mocked(api).mockImplementation((path, init) => init?.method === 'POST' ? Promise.resolve({ saved: true })
      : jest.mocked(api).mock.calls.filter(([value, options]) => value === path && !options?.method).length === 1 ? oldRead.promise : Promise.resolve(freshTasks));
    queryClient.setQueryData(['account', second.user.id, 'tasks'], [{ title: 'Other account' }]);
    const { result } = renderHook(() => ({ tasks: useTasks(), action: useAction() }), { wrapper: Wrapper });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const signal = jest.mocked(api).mock.calls[0][1]?.signal;
    await act(async () => { await result.current.action.mutateAsync({ path: '/tasks', body: { title: 'Task' } }); });
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.tasks.data).toEqual(freshTasks));
    await act(async () => { oldRead.resolve(oldTasks); });
    expect(result.current.tasks.data).toEqual(freshTasks);
    expect(writeCache).not.toHaveBeenCalledWith(first.user.id, 'tasks', oldTasks);
    expect(queryClient.getQueryState(['account', second.user.id, 'tasks'])?.isInvalidated).toBe(false);
  });

  it('does not restore saved or in-memory account data after logout', async () => {
    const disk = deferred<unknown>();
    const network = deferred<unknown>();
    jest.mocked(readCache).mockReturnValue(disk.promise);
    jest.mocked(api).mockReturnValue(network.promise);
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await act(async () => { await useSessionStore.getState().signOut(); disk.resolve(oldTasks); network.resolve(freshTasks); });
    expect(result.current.data).toBeUndefined();
    expect(queryClient.getQueryData(['account', first.user.id, 'tasks'])).toBeUndefined();
    expect(writeCache).not.toHaveBeenCalled();
    expect(clearAccountCache).toHaveBeenCalledWith(first.user.id);
  });

  it('signs out on an authenticated read returning 401', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(401, 'Expired session'));
    renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(useSessionStore.getState().session).toBeNull());
    await waitFor(() => expect(clearAccountCache).toHaveBeenCalledWith(first.user.id));
  });

  it('refuses a write if account ownership changes during read cancellation', async () => {
    const cancellation = deferred<void>();
    const cancel = jest.spyOn(queryClient, 'cancelQueries').mockReturnValueOnce(cancellation.promise);
    const { result } = renderHook(() => useAction(), { wrapper: Wrapper });
    let outcome!: Promise<unknown>;
    await act(async () => { outcome = result.current.mutateAsync({ path: '/tasks', body: { title: 'Old draft' } }).catch(error => error); });
    await act(async () => { await useSessionStore.getState().setSession(second); cancellation.resolve(); });
    expect(await outcome).toEqual(new Error('Your session has ended.'));
    expect(api).not.toHaveBeenCalled();
    cancel.mockRestore();
  });

  it('does not let an old mutation’s 401 sign out the next account', async () => {
    const pending = deferred<unknown>();
    jest.mocked(api).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAction(), { wrapper: Wrapper });
    let outcome!: Promise<unknown>;
    await act(async () => { outcome = result.current.mutateAsync({ path: '/tasks' }).catch(error => error); });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await act(async () => { await useSessionStore.getState().setSession(second); pending.reject(new ApiError(401, 'Old session expired')); await outcome; });
    expect(useSessionStore.getState().session?.user.id).toBe(second.user.id);
  });

  it('uses the next account’s cache without displaying the previous account’s saved data', async () => {
    const pending = deferred<unknown>();
    jest.mocked(api).mockReturnValue(pending.promise);
    const secondTasks = [{ ...task, title: 'Second account task' }];
    jest.mocked(readCache).mockImplementation(accountId => Promise.resolve(accountId === first.user.id ? oldTasks : secondTasks));
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(oldTasks));
    await act(async () => { await useSessionStore.getState().setSession(second); });
    expect(result.current.data).not.toEqual(oldTasks);
    await waitFor(() => expect(result.current.data).toEqual(secondTasks));
    expect(readCache).toHaveBeenCalledWith(second.user.id, 'tasks');
    await act(async () => { pending.resolve(freshTasks); });
  });

  it('discards cache records with an invalid shape and reports unavailable data', async () => {
    jest.mocked(readCache).mockResolvedValue({ unexpected: 'shape' });
    jest.mocked(api).mockRejectedValue(new Error('Offline'));
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Offline'));
    expect(result.current.data).toBeUndefined();
  });

  it('keeps valid saved data when a server response fails its contract', async () => {
    jest.mocked(readCache).mockResolvedValue(oldTasks);
    jest.mocked(api).mockResolvedValue([{ title: 'Missing required fields' }]);
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    await waitFor(() => expect(result.current.data).toEqual(oldTasks));
    expect(writeCache).not.toHaveBeenCalled();
  });
});
