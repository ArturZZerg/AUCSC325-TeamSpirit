import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAcademicReminder, useCourses } from '../src/features/queries';
import { api } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { readCache, writeCache } from '../src/services/cache';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';
import { accountId, snapshotFixture } from './snapshot-fixture';
import { courses, essay, quiz } from './academic-fixture';
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn(), clearAccountCache: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const session: Session = { accessToken: 'academic-token', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: accountId, email: 'academic@example.test', displayName: 'Academic', timeZone: 'America/Edmonton', createdAt: snapshotFixture().capturedAt,
} };
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
beforeEach(() => {
  jest.clearAllMocks(); queryClient.clear(); queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity, gcTime: Infinity } });
  useSessionStore.setState({ session, ready: true });
  jest.mocked(api).mockReset().mockRejectedValue(new Error('Offline'));
  jest.mocked(readCache).mockReset().mockResolvedValue(undefined); jest.mocked(writeCache).mockResolvedValue(undefined);
});
afterEach(() => queryClient.clear());
describe('Academic read boundaries and caching', () => {
  it('validates and persists courses once without repeating cache reads on every render', async () => {
    jest.mocked(api).mockResolvedValue(courses);
    const { result, rerender } = renderHook(() => useCourses(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(courses)); rerender({});
    expect(api).toHaveBeenCalledTimes(1); expect(readCache).toHaveBeenCalledTimes(1);
    expect(writeCache).toHaveBeenCalledWith(accountId, 'courses', courses);
  });
  it('retains valid cached courses on network failure', async () => {
    jest.mocked(readCache).mockResolvedValue(courses);
    const { result } = renderHook(() => useCourses(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(courses));
    await waitFor(() => expect(result.current.error?.message).toBe('Offline')); expect(writeCache).not.toHaveBeenCalled();
  });
  it('rejects malformed server and cached courses', async () => {
    jest.mocked(api).mockResolvedValue([{ name: 'Broken' }]); jest.mocked(readCache).mockResolvedValue([{ name: 'Broken' }]);
    const { result } = renderHook(() => useCourses(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeUndefined();
    expect(writeCache).not.toHaveBeenCalled();
  });
  it('rejects reminder configurations for another item', async () => {
    const foreign = { academicItemId: quiz.id, leadMinutes: 1440 };
    jest.mocked(api).mockResolvedValue(foreign); jest.mocked(readCache).mockResolvedValue(foreign);
    const { result } = renderHook(() => useAcademicReminder(essay.id), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeUndefined();
    expect(writeCache).not.toHaveBeenCalled();
  });
  it('does not expose the previous reminder while opening another item offline', async () => {
    jest.mocked(api).mockResolvedValue({ academicItemId: essay.id, leadMinutes: 60 });
    const { result, rerender } = renderHook(({ id }: { id: string }) => useAcademicReminder(id), { initialProps: { id: essay.id }, wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.leadMinutes).toBe(60));
    jest.mocked(api).mockRejectedValue(new Error('Offline')); await act(async () => rerender({ id: quiz.id }));
    await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeUndefined();
  });
  it('withholds course data immediately on account switch', async () => {
    jest.mocked(api).mockResolvedValue(courses);
    const { result } = renderHook(() => useCourses(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(courses)); jest.mocked(api).mockRejectedValue(new Error('Offline'));
    await act(async () => useSessionStore.setState({ session: { ...session, accessToken: 'second', user: { ...session.user, id: '10000000-0000-4000-8000-000000000002' } } }));
    await waitFor(() => expect(result.current.data).toBeUndefined());
    expect(readCache).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000002', 'courses');
  });
});
