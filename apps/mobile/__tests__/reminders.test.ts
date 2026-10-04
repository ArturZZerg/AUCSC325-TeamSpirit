import * as Notifications from 'expo-notifications';
import { waitFor } from '@testing-library/react-native';
import { clearScheduledReminders, reconcileReminders, type ReminderContext } from '../src/services/reminders';
import type { Reminder } from '@campusflow/contracts';
import { useReminderStatus } from '../src/store/reminder-status';

jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(), cancelScheduledNotificationAsync: jest.fn(), scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' } }));
const reminder: Reminder = { id: '20000000-0000-4000-8000-000000000001', targetKind: 'personalTask',
  targetId: '30000000-0000-4000-8000-000000000001', occurrenceKey: null, fireAt: '2025-03-09T18:00:00Z', enabled: true };
let scheduled: Notifications.NotificationRequest[];
let ownerCurrent: boolean;
const context = (): ReminderContext => ({ accountId: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton',
  preferences: { academicEnabled: true, personalEnabled: true, goalEnabled: true, eventEnabled: true,
    dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null }, isCurrent: () => ownerCurrent });
function notification(identifier: string, data: Record<string, unknown>): Notifications.NotificationRequest {
  return { identifier, content: { title: 'Reminder', data }, trigger: null } as Notifications.NotificationRequest;
}
beforeEach(() => {
  jest.clearAllMocks(); ownerCurrent = true; scheduled = [];
  useReminderStatus.setState({ accountId: undefined, error: undefined });
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2025-03-09T17:00:00Z'));
  jest.mocked(Notifications.getPermissionsAsync).mockReset().mockResolvedValue({ granted: true } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockReset().mockImplementation(async () => [...scheduled]);
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockReset().mockImplementation(async id => { scheduled = scheduled.filter(item => item.identifier !== id); });
  jest.mocked(Notifications.scheduleNotificationAsync).mockReset().mockImplementation(async request => {
    const id = request.identifier!; scheduled.push(notification(id, request.content.data ?? {})); return id;
  });
});
afterEach(() => { jest.restoreAllMocks(); });

describe('device reminder reconciliation (ToR 13, 19)', () => {
  it('uses stable account identities and repeated refreshes do not duplicate schedules', async () => {
    await reconcileReminders([reminder], context()); await reconcileReminders([reminder], context());
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].identifier).toBe(`campusflow:${context().accountId}:${reminder.id}`);
    expect(scheduled[0].content.data).toMatchObject({ accountId: context().accountId, fireAt: '2025-03-09T18:00:00.000Z' });
  });
  it('replaces the native notification when the same reminder fire time changes', async () => {
    await reconcileReminders([reminder], context());
    await reconcileReminders([{ ...reminder, fireAt: '2025-03-09T19:00:00Z' }], context());
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(scheduled).toHaveLength(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({
      trigger: { type: 'date', date: new Date('2025-03-09T19:00:00Z') },
    }));
  });
  it.each(['deleted', 'disabled', 'expired'])('cancels %s reminders without affecting unrelated notifications', async state => {
    await reconcileReminders([reminder], context()); scheduled.push(notification('other-app', {}));
    await reconcileReminders(state === 'deleted' ? [] : [{ ...reminder,
      enabled: state !== 'disabled', fireAt: state === 'expired' ? '2025-03-09T16:00:00Z' : reminder.fireAt }], context());
    expect(scheduled.map(item => item.identifier)).toEqual(['other-app']);
  });
  it.each([
    ['personalTask', 'personalEnabled'], ['academicItem', 'academicEnabled'], ['goal', 'goalEnabled'], ['savedEvent', 'eventEnabled'],
  ] as const)('honors the %s category preference', async (targetKind, preference) => {
    const owner = context(); await reconcileReminders([{ ...reminder, targetKind }], owner);
    owner.preferences[preference] = false; await reconcileReminders([{ ...reminder, targetKind }], owner);
    expect(scheduled).toEqual([]);
  });
  it('retains a quiet-hours-delayed notification while its original fire time has passed', async () => {
    jest.mocked(Date.now).mockReturnValue(Date.parse('2025-03-09T05:00:00Z'));
    const owner = context(); owner.preferences.quietHoursStart = '22:00'; owner.preferences.quietHoursEnd = '07:00';
    const quiet = { ...reminder, fireAt: '2025-03-09T05:30:00Z' };
    await reconcileReminders([quiet], owner);
    expect(scheduled[0].content.data?.fireAt).toBe('2025-03-09T13:00:00.000Z');
    jest.mocked(Date.now).mockReturnValue(Date.parse('2025-03-09T07:00:00Z'));
    await reconcileReminders([quiet], owner);
    expect(scheduled).toHaveLength(1); expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
  it('reschedules when quiet hours change', async () => {
    const owner = context(); await reconcileReminders([reminder], owner);
    owner.preferences.quietHoursStart = '12:00'; owner.preferences.quietHoursEnd = '14:00';
    await reconcileReminders([reminder], owner);
    expect(scheduled[0].content.data?.fireAt).toBe('2025-03-09T20:00:00.000Z');
  });
  it('cancels device schedules when permission is denied and never asks automatically', async () => {
    await reconcileReminders([reminder], context());
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
    await reconcileReminders([reminder], context()); expect(scheduled).toEqual([]);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
  it('replaces legacy identities and removes duplicate notifications', async () => {
    scheduled = [notification('legacy', { campusFlowReminder: true, stableId: `campusflow:${reminder.id}` })];
    await reconcileReminders([reminder], context());
    scheduled.push(notification('duplicate', { ...scheduled[0].content.data }));
    await reconcileReminders([reminder], context());
    expect(scheduled).toHaveLength(1); expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('legacy');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('duplicate');
  });
  it('serializes concurrent refreshes to avoid double scheduling', async () => {
    await Promise.all([reconcileReminders([reminder], context()), reconcileReminders([reminder], context())]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
  it('stops a previous account after an awaited device read', async () => {
    let release!: (value: Notifications.NotificationRequest[]) => void;
    jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockReturnValueOnce(new Promise(done => { release = done; }));
    const update = reconcileReminders([reminder], context());
    await waitFor(() => expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalled());
    ownerCurrent = false; release([]); await update;
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('clears a native scheduling call already in progress at logout', async () => {
    let release!: () => void;
    const blocked = new Promise<void>(done => { release = done; });
    jest.mocked(Notifications.scheduleNotificationAsync).mockImplementationOnce(async request => {
      await blocked; scheduled.push(notification(request.identifier!, request.content.data ?? {})); return request.identifier!;
    });
    const update = reconcileReminders([reminder], context());
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled());
    ownerCurrent = false; const cleared = clearScheduledReminders(); release(); await Promise.all([update, cleared]);
    expect(scheduled).toEqual([]);
  });
  it('invalidates reconciliation queued before logout clears notifications', async () => {
    const update = reconcileReminders([reminder], context()); const cleared = clearScheduledReminders();
    await Promise.all([update, cleared]); expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('lets a later retry recover from a native scheduling failure', async () => {
    jest.mocked(Notifications.scheduleNotificationAsync).mockRejectedValueOnce(new Error('Native scheduling failed'));
    await expect(reconcileReminders([reminder], context())).rejects.toThrow('Native scheduling failed');
    expect(useReminderStatus.getState()).toMatchObject({ accountId: context().accountId, error: expect.stringContaining('Retry in Settings') });
    await reconcileReminders([reminder], context()); expect(scheduled).toHaveLength(1);
    expect(useReminderStatus.getState().error).toBeUndefined();
  });
});

describe('Academic deadline reminder DTO consumer contract', () => {
  const academic = (): Reminder => ({ ...reminder, targetKind: 'academicItem' });
  it('replaces rather than duplicates academic notifications for earlier and later deadline DTOs', async () => {
    const first = academic();
    for (const fireAt of ['2025-03-09T20:00:00Z', '2025-03-09T19:00:00Z', '2025-03-09T21:00:00Z']) {
      const dto = { ...first, fireAt };
      await reconcileReminders([dto], context()); await reconcileReminders([dto], context());
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].identifier).toBe(`campusflow:${context().accountId}:${first.id}`);
      expect(scheduled[0].content.data?.fireAt).toBe(new Date(fireAt).toISOString());
    }
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });
  it('cancels suppressed academic intent and restores the same logical notification', async () => {
    await reconcileReminders([academic()], context());
    await reconcileReminders([], context()); expect(scheduled).toEqual([]);
    await reconcileReminders([academic()], context()); expect(scheduled).toHaveLength(1);
    expect(scheduled[0].identifier).toBe(`campusflow:${context().accountId}:${reminder.id}`);
  });
  it('disables and re-enables academic delivery without changing server intent', async () => {
    const owner = context(); const dto = academic();
    await reconcileReminders([dto], owner);
    owner.preferences.academicEnabled = false;
    await reconcileReminders([dto], owner); expect(scheduled).toEqual([]);
    owner.preferences.academicEnabled = true;
    await reconcileReminders([dto], owner); await reconcileReminders([dto], owner);
    expect(scheduled).toHaveLength(1); expect(dto).toEqual(academic());
  });
  it('applies quiet hours across spring DST to academic intent', async () => {
    jest.mocked(Date.now).mockReturnValue(Date.parse('2025-03-09T05:00:00Z'));
    const owner = context(); owner.preferences.quietHoursStart = '22:00'; owner.preferences.quietHoursEnd = '07:00';
    await reconcileReminders([{ ...academic(), fireAt: '2025-03-09T06:00:00Z' }], owner);
    expect(scheduled).toHaveLength(1); expect(scheduled[0].content.data?.fireAt).toBe('2025-03-09T13:00:00.000Z');
  });
  it('never carries academic notification identity across accounts', async () => {
    await reconcileReminders([academic()], context());
    const next = { ...context(), accountId: '10000000-0000-4000-8000-000000000002' };
    await reconcileReminders([], next); expect(scheduled).toEqual([]);
    await reconcileReminders([academic()], next);
    expect(scheduled).toHaveLength(1); expect(scheduled[0].content.data?.accountId).toBe(next.accountId);
  });
});
