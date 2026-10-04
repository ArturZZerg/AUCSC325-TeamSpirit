import { act, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { DeviceReminderSync } from '../src/features/device-reminders';
import { usePreferences, useReminders } from '../src/features/queries';
import { reconcileReminders } from '../src/services/reminders';
import { useSessionStore } from '../src/store/session';
import { useReminderStatus } from '../src/store/reminder-status';
import type { Session } from '../src/lib/types';

jest.mock('../src/features/queries', () => ({ usePreferences: jest.fn(), useReminders: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ reconcileReminders: jest.fn(), clearScheduledReminders: jest.fn() }));
jest.mock('../src/services/cache', () => ({ clearAccountCache: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const session: Session = { accessToken: 'sync-test', expiresAt: '2099-01-01T00:00:00Z', user: { id: '10000000-0000-4000-8000-000000000001',
  email: 'sync@example.test', displayName: 'Sync', timeZone: 'America/Edmonton', createdAt: '2025-03-08T18:00:00Z' } };
const preferences = { academicEnabled: true, personalEnabled: true, goalEnabled: true, eventEnabled: true,
  dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null };
const refreshReminders = jest.fn(); const refreshPreferences = jest.fn();
let listener: (state: AppStateStatus) => void; const remove = jest.fn(); const originalState = AppState.currentState;
beforeEach(() => {
  jest.clearAllMocks(); useSessionStore.setState({ session, ready: true }); AppState.currentState = 'active';
  useReminderStatus.setState({ accountId: undefined, error: undefined });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove }; });
  refreshReminders.mockReset().mockResolvedValue({ data: [] }); refreshPreferences.mockReset().mockResolvedValue({ data: preferences });
  jest.mocked(usePreferences).mockReturnValue({ data: preferences, dataUpdatedAt: 1, refetch: refreshPreferences } as unknown as ReturnType<typeof usePreferences>);
  jest.mocked(useReminders).mockReturnValue({ data: [], dataUpdatedAt: 1, refetch: refreshReminders } as unknown as ReturnType<typeof useReminders>);
  jest.mocked(reconcileReminders).mockReset().mockResolvedValue(undefined);
});
afterEach(() => { jest.restoreAllMocks(); AppState.currentState = originalState; });
describe('device reminder lifecycle (ToR 13, 19)', () => {
  it('reconciles cached records with account preferences at startup', async () => {
    render(<DeviceReminderSync/>); await act(async () => {});
    expect(reconcileReminders).toHaveBeenCalledWith([], expect.objectContaining({ accountId: session.user.id, preferences, timeZone: session.user.timeZone }));
    expect(jest.mocked(reconcileReminders).mock.calls[0][1].isCurrent()).toBe(true);
  });
  it('does not invent preferences when they are missing', async () => {
    jest.mocked(usePreferences).mockReturnValue({ data: undefined, refetch: refreshPreferences } as unknown as ReturnType<typeof usePreferences>);
    render(<DeviceReminderSync/>); await act(async () => {}); expect(reconcileReminders).not.toHaveBeenCalled();
  });
  it('refreshes both reads and checks device permission again on app resume', async () => {
    render(<DeviceReminderSync/>); await act(async () => {});
    await act(async () => { listener('background'); listener('active'); });
    expect(refreshReminders).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(refreshPreferences).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(reconcileReminders).toHaveBeenCalledTimes(2);
    await act(async () => { listener('active'); }); expect(refreshReminders).toHaveBeenCalledTimes(1);
  });
  it('reports native failure and clears it after a successful refreshed read', async () => {
    jest.mocked(reconcileReminders).mockImplementationOnce(async () => {
      useReminderStatus.setState({ accountId: session.user.id, error: 'Couldn’t update device reminders. Retry in Settings.' });
      throw new Error('Native error');
    });
    const view = render(<DeviceReminderSync/>); await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t update device reminders/);
    jest.mocked(useReminders).mockReturnValue({ data: [], dataUpdatedAt: 2, refetch: refreshReminders } as unknown as ReturnType<typeof useReminders>);
    jest.mocked(reconcileReminders).mockImplementation(async () => { useReminderStatus.setState({ accountId: session.user.id, error: undefined }); });
    await act(async () => { view.rerender(<DeviceReminderSync/>); }); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('invalidates previous ownership when the account changes', async () => {
    render(<DeviceReminderSync/>); await act(async () => {});
    const previous = jest.mocked(reconcileReminders).mock.calls[0][1];
    await act(async () => { useSessionStore.setState({ session: { ...session, accessToken: 'new-sync-token', user: { ...session.user, id: '10000000-0000-4000-8000-000000000002' } } }); });
    expect(previous.isCurrent()).toBe(false);
    expect(jest.mocked(reconcileReminders).mock.calls.at(-1)?.[1].accountId).toBe('10000000-0000-4000-8000-000000000002');
  });
  it('removes its resume listener and invalidates pending reconciliation when unmounted', async () => {
    const view = render(<DeviceReminderSync/>); await act(async () => {});
    const owner = jest.mocked(reconcileReminders).mock.calls[0][1]; view.unmount();
    expect(remove).toHaveBeenCalledTimes(1); expect(owner.isCurrent()).toBe(false);
  });
  it('does not refresh or schedule while signed out', async () => {
    useSessionStore.setState({ session: null }); render(<DeviceReminderSync/>);
    await act(async () => { listener('background'); listener('active'); });
    expect(reconcileReminders).not.toHaveBeenCalled(); expect(refreshReminders).not.toHaveBeenCalled();
  });
});
