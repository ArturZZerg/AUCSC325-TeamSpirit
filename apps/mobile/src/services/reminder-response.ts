import { idSchema } from '@campusflow/contracts';
import type { NotificationResponse } from 'expo-notifications';

export function reminderResponseTarget(response: NotificationResponse, defaultAction: string): { accountId: string; reminderId: string } | undefined {
  if (response.actionIdentifier !== defaultAction) return;
  const request = response.notification.request, data = request.content.data;
  if (data?.campusFlowReminder !== true || typeof data.accountId !== 'string' || typeof data.stableId !== 'string' || data.stableId.length > 100) return;
  const parts = data.stableId.split(':');
  if (parts.length !== 3 || parts[0] !== 'campusflow' || parts[1] !== data.accountId || request.identifier !== data.stableId) return;
  const account = idSchema.safeParse(parts[1]), reminder = idSchema.safeParse(parts[2]);
  if (!account.success || !reminder.success || (data.reminderId !== undefined && data.reminderId !== reminder.data)) return;
  return { accountId: account.data, reminderId: reminder.data };
}
