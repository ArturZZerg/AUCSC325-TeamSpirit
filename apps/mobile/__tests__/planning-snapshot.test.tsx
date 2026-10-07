import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { usePlanningSnapshot } from '../src/features/queries';
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
const session: Session = { accessToken: 'planner-token', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: accountId, email: 'planner@example.test', displayName: 'Planner', timeZone: 'America/Edmonton', createdAt: '2025-03-08T00:00:00Z',
} };
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2025-03-09T18:00:00Z'));
  jest.clearAllMocks(); queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } });
  useSessionStore.setState({ session, ready: true });
  jest.mocked(api).mockReset().mockRejectedValue(new Error('Offline'));
  jest.mocked(readCache).mockReset().mockResolvedValue(snapshotFixture());
  jest.mocked(writeCache).mockReset().mockResolvedValue(undefined);
});
afterEach(() => { queryClient.clear(); jest.restoreAllMocks(); jest.useRealTimers(); });

describe('Planner snapshot lifecycle', () => {
  it('shows a partial saved week while retaining the network error', async () => {
    const { result } = renderHook(() => usePlanningSnapshot('2025-03-03'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(snapshotFixture()));
    await waitFor(() => expect(result.current.error?.message).toBe('Offline'));
    expect(api).toHaveBeenCalledWith('/snapshot?date=2025-03-03', expect.anything());
    expect(writeCache).not.toHaveBeenCalled();
  });
  it.each(['owner', 'timezone', 'corrupt'])('rejects a snapshot with wrong %s', async kind => {
    const snapshot = snapshotFixture();
    jest.mocked(readCache).mockResolvedValue(kind === 'owner' ? { ...snapshot, accountId: '10000000-0000-4000-8000-000000000002' }
      : kind === 'timezone' ? { ...snapshot, timeZone: 'UTC' } : { ...snapshot, courses: 'broken' });
    const { result } = renderHook(() => usePlanningSnapshot('2025-03-03'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeUndefined();
  });
  it('replaces and persists the snapshot on a successful refresh', async () => {
    const { result } = renderHook(() => usePlanningSnapshot('2025-03-03'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const fresh = { ...snapshotFixture(), capturedAt: '2025-03-09T18:00:00Z', personalTasks: [] };
    jest.mocked(api).mockResolvedValue(fresh);
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.data).toEqual(fresh));
    expect(writeCache).toHaveBeenCalledWith(accountId, 'snapshot', fresh);
  });
  it('cannot disclose saved data after switching accounts', async () => {
    const { result } = renderHook(() => usePlanningSnapshot('2025-03-03'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => useSessionStore.setState({ session: { ...session, accessToken: 'second', user: { ...session.user, id: '10000000-0000-4000-8000-000000000002' } } }));
    await waitFor(() => expect(result.current.data).toBeUndefined());
  });
  it('refreshes even a still-fresh snapshot after foreground resume', async () => {
    let onChange!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { onChange = listener; return { remove: jest.fn() }; });
    const { result } = renderHook(() => usePlanningSnapshot('2025-03-03'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const before = jest.mocked(api).mock.calls.length;
    await act(async () => { onChange('background'); onChange('active'); });
    await waitFor(() => expect(jest.mocked(api).mock.calls.length).toBeGreaterThan(before));
  });
});
