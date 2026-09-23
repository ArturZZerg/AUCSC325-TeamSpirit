import * as Notifications from 'expo-notifications';
import type { Reminder } from '@campusflow/contracts';

const prefix = 'campusflow:';

export async function ensureNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  return existing.granted || (await Notifications.requestPermissionsAsync()).granted;
}

export async function clearScheduledReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter(item => item.content.data?.campusFlowReminder === true).map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

export async function reconcileReminders(reminders: Reminder[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const expected = new Map(reminders.filter(reminder => reminder.enabled && new Date(reminder.fireAt) > new Date()).map(reminder => [`${prefix}${reminder.id}`, reminder]));
  await Promise.all(scheduled.filter(item => { const key = String(item.content.data?.stableId ?? ''); return key.startsWith(prefix) && !expected.has(key); }).map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const existing = new Set(scheduled.map(item => String(item.content.data?.stableId ?? '')));
  await Promise.all([...expected].filter(([key]) => !existing.has(key)).map(async ([key, reminder]) => Notifications.scheduleNotificationAsync({ content: { title: 'CampusFlow reminder', body: 'Something in your plan is coming up.', data: { campusFlowReminder: true, stableId: key } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(reminder.fireAt) } })));
}
