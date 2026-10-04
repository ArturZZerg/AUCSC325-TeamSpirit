import * as Notifications from 'expo-notifications';
import type { Reminder } from '@campusflow/contracts';
import { reminderAfterQuietHours } from '@campusflow/domain';
import type { NotificationPreferences } from '@/lib/types';
import { useReminderStatus } from '@/store/reminder-status';

const prefix = 'campusflow:';
let revision = 0;
let pending = Promise.resolve();
function serialize(operation: () => Promise<void>) {
  pending = pending.catch(() => undefined).then(operation);
  return pending;
}
export type ReminderContext = { accountId: string; timeZone: string; preferences: NotificationPreferences; isCurrent(): boolean };
const ownedNotification = (item: Notifications.NotificationRequest) => item.content.data?.campusFlowReminder === true
  || String(item.content.data?.stableId ?? '').startsWith(prefix);

export async function ensureNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  return existing.granted || (await Notifications.requestPermissionsAsync()).granted;
}

export function clearScheduledReminders(): Promise<void> {
  // Invalidate already-queued reconciliation immediately, then wait for any
  // native scheduling call already in progress before clearing its result.
  ++revision;
  return serialize(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled.filter(ownedNotification)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    useReminderStatus.setState({ accountId: undefined, error: undefined });
  });
}

export function reconcileReminders(reminders: Reminder[], context: ReminderContext): Promise<void> {
  const requestedRevision = revision;
  const current = () => requestedRevision === revision && context.isCurrent();
  return serialize(async () => {
    if (!current()) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!current()) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!current()) return;
    const preferences = context.preferences;
    const categoryEnabled = { personalTask: preferences.personalEnabled, academicItem: preferences.academicEnabled,
      goal: preferences.goalEnabled, savedEvent: preferences.eventEnabled };
    const expected = new Map<string, string>(reminders.filter(reminder => permission.granted && reminder.enabled && categoryEnabled[reminder.targetKind]).map(reminder => {
      const fireAt = new Date(reminderAfterQuietHours(reminder.fireAt, context.timeZone, preferences.quietHoursStart, preferences.quietHoursEnd)).toISOString();
      return [`${prefix}${context.accountId}:${reminder.id}`, fireAt] as const;
    }).filter(([, fireAt]) => Date.parse(fireAt) > Date.now()));
    const kept = new Set<string>();
    for (const item of scheduled.filter(ownedNotification)) {
      if (!current()) return;
      const key = String(item.content.data?.stableId ?? '');
      if (expected.has(key) && item.content.data?.fireAt === expected.get(key) && !kept.has(key)) kept.add(key);
      else await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
    for (const [key, fireAt] of expected) {
      if (!current()) return;
      if (kept.has(key) || Date.parse(fireAt) <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({ identifier: key,
        content: { title: 'CampusFlow reminder', body: 'Something in your plan is coming up.',
          data: { campusFlowReminder: true, accountId: context.accountId, stableId: key, fireAt } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
      });
    }
  }).then(() => {
    if (current()) useReminderStatus.setState({ accountId: context.accountId, error: undefined });
  }).catch(error => {
    if (current()) useReminderStatus.setState({ accountId: context.accountId, error: 'Couldn’t update device reminders. Retry in Settings.' });
    throw error;
  });
}
