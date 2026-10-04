import { useLayoutEffect, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTodayClock } from '../src/features/today-clock';
import { useToday } from '../src/features/queries';
import { api } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { readCache, writeCache } from '../src/services/cache';
import { useSessionStore } from '../src/store/session';
import type { Session, Today } from '../src/lib/types';

jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn(), clearAccountCache: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

const session: Session = { accessToken: 'today-test-token', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'today@example.test', displayName: 'Today',
  timeZone: 'America/Edmonton', createdAt: '2026-10-03T00:00:00Z',
} };
const listeners = new Set<(state: AppStateStatus) => void>();
const originalState = AppState.currentState;
function emitState(state: AppStateStatus) {
  AppState.currentState = state;
  [...listeners].forEach(listener => listener(state));
}
function plan(date: string, title = `Plan for ${date}`): Today {
  return { date, timeZone: useSessionStore.getState().session?.user.timeZone ?? session.user.timeZone, generatedAt: new Date().toISOString(),
    sourceStatus: { availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null },
    items: [{ key: 'personalTask:20000000-0000-4000-8000-000000000001', kind: 'personalTask',
      entityId: '20000000-0000-4000-8000-000000000001', title, occurrenceKey: null,
      schedule: null, due: { kind: 'date', date }, state: 'today', isMainGoal: false,
      priority: 'medium', allowedActions: ['complete', 'open'] }], upcoming: [], campusEvents: [] };
}
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
const todayCalls = () => jest.mocked(api).mock.calls.filter(([path]) => path.startsWith('/today?'));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-04T02:00:00Z'));
  jest.clearAllMocks();
  listeners.clear();
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity, gcTime: Infinity } });
  useSessionStore.setState({ session, ready: true });
  jest.mocked(api).mockReset().mockImplementation(async path => plan(path.split('date=')[1]));
  jest.mocked(readCache).mockReset().mockResolvedValue(undefined);
  jest.mocked(writeCache).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
  jest.useRealTimers();
  AppState.currentState = originalState;
});

describe('account calendar clock (ToR 4, date/time rules)', () => {
  it('uses the account date even when UTC and the device date differ', () => {
    const { result } = renderHook(() => useTodayClock('America/Edmonton'));
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-04');
    expect(result.current.date).toBe('2026-10-03');
  });

  it('changes the default date at exactly local midnight', () => {
    jest.setSystemTime(new Date('2026-10-04T05:59:59Z'));
    const { result } = renderHook(() => useTodayClock('America/Edmonton'));
    act(() => { jest.advanceTimersByTime(999); });
    expect(result.current.date).toBe('2026-10-03');
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current.date).toBe('2026-10-04');
    act(() => { jest.advanceTimersByTime(24 * 60 * 60 * 1000); });
    expect(result.current.date).toBe('2026-10-05');
  });

  it('catches midnight passing between render and subscribing to the clock', () => {
    jest.setSystemTime(new Date('2026-10-04T05:59:59.999Z'));
    const { result } = renderHook(() => {
      const clock = useTodayClock('America/Edmonton');
      useLayoutEffect(() => { jest.setSystemTime(new Date('2026-10-04T06:00:00Z')); }, []);
      return clock;
    });
    expect(result.current.date).toBe('2026-10-04');
  });

  it.each([
    // Historical transitions keep fixed expectations stable across runtime
    // timezone databases, which can disagree about future rule changes.
    ['2025-03-09T07:00:00Z', 23, '2025-03-09', '2025-03-10'],
    ['2025-11-02T06:00:00Z', 25, '2025-11-02', '2025-11-03'],
  ])('rolls over after the real DST day starting %s (%s hours)', (start, hours, before, after) => {
    jest.setSystemTime(new Date(start));
    const { result } = renderHook(() => useTodayClock('America/Edmonton'));
    act(() => { jest.advanceTimersByTime(Number(hours) * 60 * 60 * 1000 - 1); });
    expect(result.current.date).toBe(before);
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current.date).toBe(after);
  });

  it('reads the actual date after several suspended days and ignores repeated active events', () => {
    const { result } = renderHook(() => useTodayClock('America/Edmonton'));
    act(() => { emitState('inactive'); emitState('background'); });
    jest.setSystemTime(new Date('2026-10-07T15:00:00Z'));
    act(() => { emitState('active'); });
    expect(result.current.date).toBe('2026-10-07');
    expect(result.current.resumeCount).toBe(1);
    act(() => { emitState('active'); });
    expect(result.current.resumeCount).toBe(1);
    act(() => { jest.advanceTimersByTime(15 * 60 * 60 * 1000); });
    expect(result.current.date).toBe('2026-10-08');
  });

  it('keeps an explicitly selected date fixed across midnight and resume', () => {
    const { result } = renderHook(() => useTodayClock('America/Edmonton', '2026-09-20'));
    act(() => { jest.advanceTimersByTime(48 * 60 * 60 * 1000); emitState('background'); });
    jest.setSystemTime(new Date('2026-10-10T15:00:00Z'));
    act(() => { emitState('active'); });
    expect(result.current.date).toBe('2026-09-20');
    expect(result.current.resumeCount).toBe(1);
  });

  it('recomputes immediately and reschedules when the account timezone changes', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useTodayClock>, { zone: string }>(
      ({ zone }) => useTodayClock(zone), { initialProps: { zone: 'America/Edmonton' } });
    // A zone change must read the current clock, not the instant from mount.
    jest.setSystemTime(new Date('2026-10-04T14:59:59Z'));
    rerender({ zone: 'Asia/Tokyo' });
    expect(result.current.date).toBe('2026-10-04');
    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.date).toBe('2026-10-05');
  });

  it('removes timers and resume listeners when unmounted', () => {
    const { unmount } = renderHook(() => useTodayClock('America/Edmonton'));
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('Today query rollover and resume (ToR 4, 10, 19)', () => {
  it('requests and caches the account day, then requests the new day at midnight', async () => {
    jest.setSystemTime(new Date('2026-10-04T05:59:59Z'));
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-03'));
    expect(api).toHaveBeenCalledWith('/today?date=2026-10-03', expect.anything());
    await act(async () => { jest.advanceTimersByTime(1000); });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-04'));
    expect(todayCalls().map(([path]) => path)).toEqual(['/today?date=2026-10-03', '/today?date=2026-10-04']);
    expect(writeCache).toHaveBeenLastCalledWith(session.user.id, 'today:2026-10-04', expect.objectContaining({ date: '2026-10-04' }));
  });

  it('refreshes on same-day resume even when the cached query is still fresh', async () => {
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-03'));
    jest.mocked(api).mockResolvedValueOnce(plan('2026-10-03', 'Updated while away'));
    await act(async () => { emitState('background'); emitState('active'); });
    await waitFor(() => expect(result.current.data?.items[0].title).toBe('Updated while away'));
    expect(todayCalls()).toHaveLength(2);
    act(() => { emitState('active'); });
    expect(todayCalls()).toHaveLength(2);
  });

  it('resumes on the new day without refetching the old day or duplicating the new request', async () => {
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-03'));
    act(() => { emitState('background'); });
    jest.setSystemTime(new Date('2026-10-07T15:00:00Z'));
    await act(async () => { emitState('active'); });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-07'));
    expect(todayCalls().map(([path]) => path)).toEqual(['/today?date=2026-10-03', '/today?date=2026-10-07']);
  });

  it('does not label yesterday as today or invent an empty plan on an uncached offline day', async () => {
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-03'));
    act(() => { emitState('background'); });
    jest.setSystemTime(new Date('2026-10-05T15:00:00Z'));
    jest.mocked(api).mockRejectedValue(new Error('Network unavailable'));
    await act(async () => { emitState('active'); });
    await waitFor(() => expect(result.current.error?.message).toBe('Network unavailable'));
    expect(result.current.date).toBe('2026-10-05');
    expect(result.current.data).toBeUndefined();
    expect(readCache).toHaveBeenCalledWith(session.user.id, 'today:2026-10-05');
  });

  it('shows the new day cached data when resume cannot reach the API', async () => {
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-03'));
    act(() => { emitState('background'); });
    jest.setSystemTime(new Date('2026-10-04T15:00:00Z'));
    jest.mocked(readCache).mockImplementation(async (_account, key) => key === 'today:2026-10-04' ? plan('2026-10-04', 'Saved Sunday plan') : undefined);
    jest.mocked(api).mockRejectedValue(new Error('Network unavailable'));
    await act(async () => { emitState('active'); });
    await waitFor(() => expect(result.current.data?.items[0].title).toBe('Saved Sunday plan'));
    expect(result.current.date).toBe('2026-10-04');
    expect(result.current.error?.message).toBe('Network unavailable');
  });

  it('refreshes the explicitly selected date on resume without moving it', async () => {
    const { result } = renderHook(() => useToday('2026-09-20'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-09-20'));
    act(() => { emitState('background'); });
    jest.setSystemTime(new Date('2026-10-07T15:00:00Z'));
    await act(async () => { emitState('active'); });
    await waitFor(() => expect(todayCalls()).toHaveLength(2));
    expect(result.current.date).toBe('2026-09-20');
    expect(todayCalls().map(([path]) => path)).toEqual(['/today?date=2026-09-20', '/today?date=2026-09-20']);
  });

  it('switches to the new account timezone and cache scope', async () => {
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-03'));
    const other = { ...session, accessToken: 'other-test-token', user: { ...session.user,
      id: '10000000-0000-4000-8000-000000000002', timeZone: 'Asia/Tokyo' } };
    await act(async () => { useSessionStore.setState({ session: other }); });
    await waitFor(() => expect(result.current.data?.date).toBe('2026-10-04'));
    expect(result.current.timeZone).toBe('Asia/Tokyo');
    expect(writeCache).toHaveBeenLastCalledWith(other.user.id, 'today:2026-10-04', expect.anything());
  });

  it('refreshes after a timezone change even when the account calendar date stays the same', async () => {
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.timeZone).toBe('America/Edmonton'));
    await act(async () => { useSessionStore.setState({ session: { ...session, user: { ...session.user, timeZone: 'America/Vancouver' } } }); });
    await waitFor(() => expect(result.current.data?.timeZone).toBe('America/Vancouver'));
    expect(result.current.date).toBe('2026-10-03');
    expect(todayCalls()).toHaveLength(2);
  });

  it('does not request an authenticated plan while signed out or on signed-out resume', async () => {
    useSessionStore.setState({ session: null });
    const { result } = renderHook(() => useToday(), { wrapper: Wrapper });
    await act(async () => { emitState('background'); emitState('active'); });
    expect(api).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
