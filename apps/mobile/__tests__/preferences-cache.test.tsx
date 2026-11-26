import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { usePreferences } from '../src/features/queries';
import { api } from '../src/lib/api';
import { readCache } from '../src/services/cache';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';

jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn(), writeCache: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

const session: Session = { accessToken: 'preferences-cache', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'preferences@example.test', displayName: 'Student',
  timeZone: 'America/Edmonton', createdAt: '2026-11-24T00:00:00Z',
} };
const preferences = { academicEnabled: true, personalEnabled: false, goalEnabled: true, eventEnabled: true,
  dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null };
let client: QueryClient;
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionStore.setState({ session, ready: true });
  jest.mocked(api).mockReset().mockRejectedValue(new Error('Offline'));
  jest.mocked(readCache).mockReset();
});
afterEach(() => { client.clear(); });

it.each([
  { quietHoursStart: null, quietHoursEnd: null },
  { quietHoursStart: '22:00', quietHoursEnd: '07:00' },
])('keeps valid saved preferences usable offline: %j', async pair => {
  const saved = { ...preferences, ...pair };
  jest.mocked(readCache).mockResolvedValue(saved);
  const { result } = renderHook(usePreferences, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toEqual(saved);
  expect(result.current.isCached).toBe(true);
});

it.each([
  { quietHoursStart: '22:00', quietHoursEnd: null },
  { quietHoursStart: null, quietHoursEnd: '07:00' },
])('withholds legacy incomplete cache settings when refresh fails: %j', async half => {
  jest.mocked(readCache).mockResolvedValue({ ...preferences, ...half });
  const { result } = renderHook(usePreferences, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});
