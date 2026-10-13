import { act, render } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { ReminderResponseSync } from '../src/features/reminder-response-sync';
import { reminderResponseTarget } from '../src/services/reminder-response';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';
const mockRouter = { push: jest.fn() };
let mockNavigation: { key: string } | undefined = { key: 'root' };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useRootNavigationState: () => mockNavigation }));
jest.mock('expo-notifications', () => ({ DEFAULT_ACTION_IDENTIFIER: 'default', addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponse: jest.fn(), clearLastNotificationResponse: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('../src/services/cache', () => ({ clearAccountCache: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const accountId = '10000000-0000-4000-8000-000000000001', reminderId = '20000000-0000-4000-8000-000000000001';
const session: Session = { accessToken: 'response-test', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: accountId, email: 'response@example.test', displayName: 'Response', timeZone: 'America/Edmonton', createdAt: '2025-03-08T18:00:00Z' } };
function response(data: Record<string, unknown> = {}, actionIdentifier = 'default'): Notifications.NotificationResponse {
  return { actionIdentifier, notification: { date: 1234, request: { identifier: `campusflow:${accountId}:${reminderId}`, trigger: null,
    content: { data: { campusFlowReminder: true, accountId, reminderId, stableId: `campusflow:${accountId}:${reminderId}`, ...data } } } } } as unknown as Notifications.NotificationResponse;
}
let listener: (value: Notifications.NotificationResponse) => void;
const remove = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); mockNavigation = { key: 'root' }; useSessionStore.setState({ session, ready: true });
  jest.mocked(Notifications.getLastNotificationResponse).mockReset().mockReturnValue(null);
  jest.mocked(Notifications.addNotificationResponseReceivedListener).mockImplementation(callback => { listener = callback; return { remove }; });
});
it('opens the exact owned reminder for a warm tap and ignores supplied URLs or target IDs', () => {
  render(<ReminderResponseSync/>);
  act(() => listener(response({ url: 'https://untrusted.test', targetId: 'another-task' })));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/reminders', params: { reminderId, accountId } });
  expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
});
it('waits for cold-start session restoration and the mounted navigation tree', () => {
  useSessionStore.setState({ session: null, ready: false }); mockNavigation = undefined;
  jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(response());
  const view = render(<ReminderResponseSync/>); expect(mockRouter.push).not.toHaveBeenCalled();
  act(() => useSessionStore.setState({ session, ready: true })); expect(mockRouter.push).not.toHaveBeenCalled();
  mockNavigation = { key: 'mounted' }; view.rerender(<ReminderResponseSync/>); expect(mockRouter.push).toHaveBeenCalledTimes(1);
});
it('deduplicates the startup and listener copy and does not replay after rerender', () => {
  jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(response());
  const view = render(<ReminderResponseSync/>); act(() => listener(response())); view.rerender(<ReminderResponseSync/>);
  expect(mockRouter.push).toHaveBeenCalledTimes(1); expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
});
it.each([null, { ...session, user: { ...session.user, id: '10000000-0000-4000-8000-000000000002' } }])('discards a queued response after restoring an unavailable or different account', restored => {
  useSessionStore.setState({ session: null, ready: false }); jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(response());
  render(<ReminderResponseSync/>); act(() => useSessionStore.setState({ session: restored, ready: true })); expect(mockRouter.push).not.toHaveBeenCalled();
});
it('does not carry signed-out taps into a later sign-in', () => {
  useSessionStore.setState({ session: null, ready: true }); render(<ReminderResponseSync/>);
  act(() => listener(response())); act(() => useSessionStore.setState({ session })); expect(mockRouter.push).not.toHaveBeenCalled();
});
it('rejects a queued tap if the account token changes before navigation mounts', () => {
  mockNavigation = undefined; render(<ReminderResponseSync/>); act(() => listener(response()));
  act(() => useSessionStore.setState({ session: { ...session, accessToken: 'fresh-login' } }));
  mockNavigation = { key: 'root' }; act(() => useSessionStore.setState({ ready: true })); expect(mockRouter.push).not.toHaveBeenCalled();
});
it.each([{ campusFlowReminder: false }, { accountId: 'invalid' }, { reminderId: 'invalid' }, { stableId: `campusflow:${accountId}:invalid` }, { stableId: 'https://untrusted.test' }])('rejects malformed or inconsistent notification identities %j', data => {
  expect(reminderResponseTarget(response(data), 'default')).toBeUndefined();
});
it('recognizes legacy owned stable IDs but rejects custom actions and mismatched request identities', () => {
  expect(reminderResponseTarget(response({ reminderId: undefined }), 'default')).toEqual({ accountId, reminderId });
  expect(reminderResponseTarget(response({}, 'delete'), 'default')).toBeUndefined();
  const value = response(); value.notification.request.identifier = 'other'; expect(reminderResponseTarget(value, 'default')).toBeUndefined();
});
it('retains live tap handling after the native startup read fails and removes the listener on unmount', () => {
  jest.mocked(Notifications.getLastNotificationResponse).mockImplementation(() => { throw new Error('Native failure'); });
  const view = render(<ReminderResponseSync/>); act(() => listener(response())); expect(mockRouter.push).toHaveBeenCalledTimes(1);
  view.unmount(); expect(remove).toHaveBeenCalledTimes(1); act(() => listener(response())); expect(mockRouter.push).toHaveBeenCalledTimes(1);
});
