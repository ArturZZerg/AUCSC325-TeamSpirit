import { updateSavedEventSchema } from '@campusflow/contracts';
import type { CampusEvent } from '@/lib/types';
import { timedReminderDefaults, timedReminderValue, type TimedReminderForm } from '@/features/timed-reminder-form';
function configuration(event: CampusEvent) {
  if (event.saved !== true || event.savedReminder === undefined) throw new Error('Save this event and refresh reminder details before editing.');
  return event.savedReminder;
}
export const eventReminderDefaults = (event: CampusEvent, timeZone: string) => timedReminderDefaults(configuration(event), timeZone);
export function eventReminderRequest(values: TimedReminderForm, event: CampusEvent, timeZone: string) {
  return { path: `/events/${event.id}/saved`, method: 'PATCH', body: updateSavedEventSchema.parse({ reminder: timedReminderValue(values, configuration(event), timeZone) }) };
}
