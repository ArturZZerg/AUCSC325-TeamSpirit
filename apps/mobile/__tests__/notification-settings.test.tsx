import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Settings from '../app/(tabs)/settings';
import { useAction, usePreferences, useReminders } from '../src/features/queries';
import { useSessionStore } from '../src/store/session';
import { ensureNotificationPermission, reconcileReminders } from '../src/services/reminders';
import type { Session } from '../src/lib/types';

jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), usePreferences: jest.fn(), useReminders: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ ensureNotificationPermission: jest.fn(), reconcileReminders: jest.fn(), clearScheduledReminders: jest.fn() }));
jest.mock('../src/services/cache', () => ({ clearAccountCache: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const session: Session = { accessToken: 'settings-test', expiresAt: '2099-01-01T00:00:00Z', user: { id: '10000000-0000-4000-8000-000000000001',
  email: 'settings@example.test', displayName: 'Settings', timeZone: 'America/Edmonton', createdAt: '2025-03-08T18:00:00Z' } };
const preferences = { academicEnabled: true, personalEnabled: true, goalEnabled: true, eventEnabled: true,
  dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null };
const save = jest.fn(); const refreshReminders = jest.fn(); const refreshPreferences = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  useSessionStore.setState({ session, ready: true });
  refreshReminders.mockReset().mockResolvedValue({ data: [] }); refreshPreferences.mockReset().mockResolvedValue({ data: preferences });
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(usePreferences).mockReturnValue({ data: preferences, refetch: refreshPreferences, isLoading: false } as unknown as ReturnType<typeof usePreferences>);
  jest.mocked(useReminders).mockReturnValue({ data: [], refetch: refreshReminders } as unknown as ReturnType<typeof useReminders>);
  jest.mocked(ensureNotificationPermission).mockReset().mockResolvedValue(true);
  jest.mocked(reconcileReminders).mockReset().mockResolvedValue(undefined);
});
describe('notification Settings (ToR 13)', () => {
  it('opens quiet hours with current values and the account timezone', () => {
    const current = { ...preferences, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
    jest.mocked(usePreferences).mockReturnValue({ data: current, refetch: refreshPreferences, isLoading: false } as unknown as ReturnType<typeof usePreferences>);
    render(<Settings/>); expect(screen.getByText('Quiet hours: 22:00–07:00 · America/Edmonton')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Edit quiet hours')); expect(screen.getByLabelText('Quiet hours start')).toHaveDisplayValue('22:00');
    expect(screen.getByText(/Times follow your account/)).toHaveTextContent(/America\/Edmonton/);
    fireEvent.press(screen.getByText('Cancel')); expect(save).not.toHaveBeenCalled();
  });
  it('discards a cancelled quiet-hour draft before reopening', () => {
    render(<Settings/>); expect(screen.getByText('Quiet hours: off')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Edit quiet hours')); fireEvent.changeText(screen.getByLabelText('Quiet hours start'), '23:00');
    fireEvent.press(screen.getByText('Cancel')); fireEvent.press(screen.getByText('Edit quiet hours'));
    expect(screen.getByLabelText('Quiet hours start')).toHaveDisplayValue(''); expect(save).not.toHaveBeenCalled();
  });
  it('does not offer editing when quiet-hour preferences are unavailable', () => {
    jest.mocked(usePreferences).mockReturnValue({ data: undefined, refetch: refreshPreferences, error: new Error('Offline') } as unknown as ReturnType<typeof usePreferences>);
    render(<Settings/>); expect(screen.queryByText('Edit quiet hours')).toBeNull(); expect(screen.queryByText('Quiet hours: off')).toBeNull();
  });
  it('shows only the server quiet-hour values after successful save', async () => {
    const view = render(<Settings/>); fireEvent.press(screen.getByText('Edit quiet hours'));
    fireEvent.changeText(screen.getByLabelText('Quiet hours start'), '22:00'); fireEvent.changeText(screen.getByLabelText('Quiet hours end'), '07:00');
    await act(async () => { fireEvent.press(screen.getByText('Save quiet hours')); });
    expect(screen.queryByLabelText('Quiet hours start')).toBeNull(); expect(screen.getByText('Quiet hours: off')).toBeOnTheScreen();
    jest.mocked(usePreferences).mockReturnValue({ data: { ...preferences, quietHoursStart: '22:00', quietHoursEnd: '07:00' }, refetch: refreshPreferences } as unknown as ReturnType<typeof usePreferences>);
    view.rerender(<Settings/>); expect(screen.getByText('Quiet hours: 22:00–07:00 · America/Edmonton')).toBeOnTheScreen();
  });
  it.each([['Academic', 'academicEnabled'], ['Personal', 'personalEnabled'], ['Goal', 'goalEnabled'], ['Event', 'eventEnabled']])('toggles %s through validated preferences', async (label, key) => {
    render(<Settings/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: `${label} reminders: on` })); });
    expect(save).toHaveBeenCalledWith({ path: '/notification-preferences', method: 'PATCH', body: { [key]: false } });
    expect(screen.getByRole('button', { name: `${label} reminders: on` })).toBeEnabled();
  });
  it('reports a failed category update and permits retry without claiming success', async () => {
    save.mockRejectedValueOnce(new Error('Offline')); render(<Settings/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Personal reminders: on' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Personal reminders: on' })); });
    expect(save).toHaveBeenCalledTimes(2); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('blocks repeated preference taps during the request', async () => {
    let release!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { release = done; })); render(<Settings/>);
    const button = screen.getByRole('button', { name: 'Personal reminders: on' });
    act(() => { fireEvent.press(button); fireEvent.press(button); });
    expect(save).toHaveBeenCalledTimes(1); expect(button).toBeDisabled();
    await act(async () => { release(); }); expect(button).toBeEnabled();
  });
  it('reconciles after the user grants device permission', async () => {
    render(<Settings/>); await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Allow device notifications' })); });
    expect(ensureNotificationPermission).toHaveBeenCalledTimes(1);
    expect(refreshReminders).toHaveBeenCalledTimes(1); expect(refreshPreferences).toHaveBeenCalledTimes(1);
    expect(reconcileReminders).toHaveBeenCalledWith([], expect.objectContaining({ accountId: session.user.id, timeZone: session.user.timeZone, preferences }));
  });
  it('explains denied device permission without requesting a schedule', async () => {
    jest.mocked(ensureNotificationPermission).mockResolvedValue(false); render(<Settings/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Allow device notifications' })); });
    expect(screen.getByRole('alert')).toHaveTextContent(/Device notifications are disabled/);
    expect(reconcileReminders).not.toHaveBeenCalled();
  });
  it('reports native scheduling failures and permits an explicit retry', async () => {
    jest.mocked(reconcileReminders).mockRejectedValueOnce(new Error('Device unavailable')); render(<Settings/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Refresh device reminders' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Device unavailable');
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Refresh device reminders' })); });
    expect(screen.queryByRole('alert')).toBeNull(); expect(reconcileReminders).toHaveBeenCalledTimes(2);
  });
  it('does not reconcile missing preferences as default settings', async () => {
    refreshPreferences.mockResolvedValue({ data: undefined });
    jest.mocked(usePreferences).mockReturnValue({ data: undefined, refetch: refreshPreferences } as unknown as ReturnType<typeof usePreferences>);
    render(<Settings/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Refresh device reminders' })); });
    expect(screen.getByRole('alert')).toHaveTextContent(/Connect to refresh/); expect(reconcileReminders).not.toHaveBeenCalled();
  });
  it('cannot reconcile a previous account after its refresh resolves', async () => {
    let release!: (value: { data: never[] }) => void;
    refreshReminders.mockReturnValueOnce(new Promise(done => { release = done; })); render(<Settings/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Refresh device reminders' })); });
    await act(async () => { useSessionStore.setState({ session: { ...session, accessToken: 'next-settings-token' } }); release({ data: [] }); });
    expect(reconcileReminders).not.toHaveBeenCalled();
  });
  it('can reconcile validated saved settings after an offline permission grant', async () => {
    refreshReminders.mockResolvedValue({ data: undefined, error: new Error('Offline') });
    refreshPreferences.mockResolvedValue({ data: undefined, error: new Error('Offline') });
    render(<Settings/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Allow device notifications' })); });
    expect(reconcileReminders).toHaveBeenCalledWith([], expect.objectContaining({ preferences }));
  });
});
