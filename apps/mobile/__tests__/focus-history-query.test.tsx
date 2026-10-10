import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFocusHistory } from '../src/features/queries';
import { api } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { readCache, writeCache } from '../src/services/cache';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn(), clearAccountCache: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const session: Session = { accessToken: 'focus-token', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'focus@example.test', displayName: 'Focus', timeZone: 'America/Edmonton', createdAt: '2026-10-10T00:00:00Z',
} };
const history = { accountId: session.user.id, timeZone: session.user.timeZone, from: '2025-03-09', through: '2025-03-09', capturedAt: '2025-03-10T00:00:00Z', sessions: [{
  id: '20000000-0000-4000-8000-000000000001', taskId: null, title: 'Free study', startedAt: '2025-03-09T07:00:00Z', endedAt: '2025-03-09T07:25:00Z',
  plannedMinutes: 25, focusedSeconds: 1500, outcome: 'completed', createdAt: '2025-03-09T07:25:00Z',
}] };
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
beforeEach(() => {
  jest.clearAllMocks(); queryClient.clear(); queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity, gcTime: Infinity } });
  useSessionStore.setState({ session, ready: true }); jest.mocked(api).mockReset().mockRejectedValue(new Error('Offline'));
  jest.mocked(readCache).mockReset().mockResolvedValue(undefined); jest.mocked(writeCache).mockResolvedValue(undefined);
});
afterEach(() => queryClient.clear());
it('shows only validated window-specific saved history when offline', async () => {
  jest.mocked(readCache).mockResolvedValue(history);
  const { result, rerender } = renderHook(({ from }: { from: string }) => useFocusHistory(from, from), { initialProps: { from: '2025-03-09' }, wrapper: Wrapper });
  await waitFor(() => expect(result.current.data).toEqual(history)); expect(result.current.isCached).toBe(true);
  await act(async () => rerender({ from: '2025-03-10' })); await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeUndefined();
});
it.each([{ accountId: '10000000-0000-4000-8000-000000000002' }, { timeZone: 'UTC' }, { sessions: [history.sessions[0], history.sessions[0]] },
  { sessions: [{ ...history.sessions[0], endedAt: '2025-03-10T06:00:00Z' }] }])('withholds malformed, foreign or uncovered history %j', async invalid => {
  jest.mocked(api).mockResolvedValue({ ...history, ...invalid }); jest.mocked(readCache).mockResolvedValue({ ...history, ...invalid });
  const { result } = renderHook(() => useFocusHistory('2025-03-09', '2025-03-09'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeUndefined(); expect(writeCache).not.toHaveBeenCalled();
});
