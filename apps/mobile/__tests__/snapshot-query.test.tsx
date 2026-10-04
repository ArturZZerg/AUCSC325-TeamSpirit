import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useToday, useAction } from '../src/features/queries';
import { composeOfflineToday } from '../src/features/offline-today';
import { api } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { readCache, writeCache } from '../src/services/cache';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';
import { accountId, snapshotFixture } from './snapshot-fixture';

jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn(), clearAccountCache: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const session: Session = { accessToken: 'snapshot-token', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: accountId, email: 'snapshot@example.test', displayName: 'Snapshot', timeZone: 'America/Edmonton', createdAt: '2025-03-08T00:00:00Z',
} };
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2025-03-09T18:00:00Z'));
  jest.clearAllMocks(); queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } });
  useSessionStore.setState({ session, ready: true });
  jest.mocked(api).mockReset().mockRejectedValue(new Error('Offline'));
  jest.mocked(readCache).mockReset().mockImplementation(async (_account, key) => key === 'snapshot' ? snapshotFixture() : undefined);
  jest.mocked(writeCache).mockReset().mockResolvedValue(undefined);
});
afterEach(() => { queryClient.clear(); jest.useRealTimers(); });

describe('Today snapshot query lifecycle (ToR 10, 19)', () => {
  it('loads an unvisited date offline and preserves the refresh failure and capture time', async () => {
    const { result } = renderHook(() => useToday('2025-03-09'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2025-03-09'));
    expect(result.current.data?.generatedAt).toBe(snapshotFixture().capturedAt);
    expect(result.current.isLoading).toBe(false);
    await waitFor(() => expect(result.current.error?.message).toBe('Offline'));
    expect(writeCache).not.toHaveBeenCalled();
  });

  it('uses the same persisted snapshot when midnight opens an uncached date', async () => {
    jest.setSystemTime(new Date('2025-03-10T05:59:59Z'));
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2025-03-09'));
    await act(async () => { jest.advanceTimersByTime(1000); });
    await waitFor(() => expect(result.current.data?.date).toBe('2025-03-10'));
    expect(result.current.data?.items.find(item => item.kind === 'personalTask')).toMatchObject({ occurrenceKey: '2025-03-10', state: 'today' });
  });

  it('keeps an out-of-window day unavailable', async () => {
    const { result } = renderHook(() => useToday('2025-03-16'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Offline'));
    expect(result.current.data).toBeUndefined();
  });

  it('persists a successful snapshot for a later cold offline date', async () => {
    jest.mocked(readCache).mockResolvedValue(undefined);
    jest.mocked(api).mockImplementation(async path => {
      if (path.startsWith('/snapshot')) return snapshotFixture();
      return composeOfflineToday(snapshotFixture(), accountId, session.user.timeZone, '2025-03-09', new Date().toISOString());
    });
    const mounted = renderHook(() => useToday('2025-03-09'), { wrapper: Wrapper });
    await waitFor(() => expect(writeCache).toHaveBeenCalledWith(accountId, 'snapshot', snapshotFixture()));
    mounted.unmount(); queryClient.clear();
    jest.mocked(api).mockRejectedValue(new Error('Offline'));
    jest.mocked(readCache).mockImplementation(async (_account, key) => key === 'snapshot' ? snapshotFixture() : undefined);
    const { result } = renderHook(() => useToday('2025-03-10'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2025-03-10'));
  });

  it('does not let a late disk snapshot replace a fresh Today response', async () => {
    const disk = deferred<unknown>();
    jest.mocked(readCache).mockReturnValue(disk.promise);
    const today = composeOfflineToday(snapshotFixture(), accountId, session.user.timeZone, '2025-03-09', new Date().toISOString())!;
    today.items[0].title = 'Fresh server plan';
    jest.mocked(api).mockImplementation(async path => { if (path.startsWith('/snapshot')) throw new Error('Snapshot unavailable'); return today; });
    const { result } = renderHook(() => useToday('2025-03-09'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.items[0].title).toBe('Fresh server plan'));
    await act(async () => { disk.resolve(snapshotFixture()); });
    expect(result.current.data?.items[0].title).toBe('Fresh server plan');
  });

  it('selects the newer cached read without letting an older snapshot regress it', async () => {
    const today = composeOfflineToday(snapshotFixture(), accountId, session.user.timeZone, '2025-03-09', new Date().toISOString())!;
    today.generatedAt = '2025-03-09T17:00:00Z'; today.items[0].title = 'Newer saved plan';
    jest.mocked(readCache).mockImplementation(async (_account, key) => key === 'snapshot' ? snapshotFixture() : today);
    const { result } = renderHook(() => useToday('2025-03-09'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.items[0].title).toBe('Newer saved plan'));
  });

  it('rejects a snapshot with another account ID even inside the current account cache', async () => {
    jest.mocked(readCache).mockResolvedValue({ ...snapshotFixture(), accountId: '10000000-0000-4000-8000-000000000002' });
    const { result } = renderHook(() => useToday('2025-03-09'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Offline'));
    expect(result.current.data).toBeUndefined();
  });

  it('cannot expose a previous account snapshot after switching accounts', async () => {
    const { result } = renderHook(() => useToday('2025-03-09'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => { useSessionStore.setState({ session: { ...session, accessToken: 'other-token',
      user: { ...session.user, id: '10000000-0000-4000-8000-000000000002' } } }); });
    await waitFor(() => expect(result.current.error?.message).toBe('Offline'));
    expect(result.current.data).toBeUndefined();
  });

  it('invalidates and replaces the snapshot after a successful occurrence write', async () => {
    let current = snapshotFixture();
    jest.mocked(api).mockImplementation(async (path, options) => {
      if (options?.method) { current = { ...current, capturedAt: '2025-03-09T18:00:00Z', personalTasks: [] }; return {}; }
      if (path.startsWith('/snapshot')) return current;
      throw new Error('Today unavailable');
    });
    const { result } = renderHook(() => ({ today: useToday('2025-03-09'), action: useAction() }), { wrapper: Wrapper });
    await waitFor(() => expect(writeCache).toHaveBeenCalledWith(accountId, 'snapshot', current));
    await act(async () => { await result.current.action.mutateAsync({ path: '/tasks/example/complete', body: { completed: true } }); });
    await waitFor(() => expect(result.current.today.data?.items.some(item => item.kind === 'personalTask')).toBe(false));
    expect(writeCache).toHaveBeenLastCalledWith(accountId, 'snapshot', current);
  });

  it('refreshes the snapshot when pull-to-refresh retries an unavailable Today endpoint', async () => {
    const { result } = renderHook(() => useToday('2025-03-09'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Offline'));
    const updated = { ...snapshotFixture(), capturedAt: '2025-03-09T18:00:00Z', personalTasks: [] };
    jest.mocked(api).mockImplementation(async path => { if (path.startsWith('/snapshot')) return updated; throw new Error('Offline'); });
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.data?.items.some(item => item.kind === 'personalTask')).toBe(false));
    expect(writeCache).toHaveBeenCalledWith(accountId, 'snapshot', updated);
  });

  it('uses a newer SQLite snapshot over an older in-memory snapshot after an offline restart of the query', async () => {
    queryClient.setQueryData(['account', accountId, 'snapshot:2025-03-09:America/Edmonton'], snapshotFixture());
    const newer = { ...snapshotFixture(), capturedAt: '2025-03-09T18:00:00Z', personalTasks: [] };
    jest.mocked(readCache).mockImplementation(async (_account, key) => key === 'snapshot' ? newer : undefined);
    const { result } = renderHook(() => useToday('2025-03-09'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.generatedAt).toBe(newer.capturedAt));
    expect(result.current.data?.items.some(item => item.kind === 'personalTask')).toBe(false);
  });
});
