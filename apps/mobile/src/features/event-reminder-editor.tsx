import { useAction } from '@/features/queries';
import { eventReminderRequest } from '@/features/event-reminder-form';
import { TimedReminderEditor } from '@/features/timed-reminder-editor';
import type { CampusEvent } from '@/lib/types';
export function EventReminderEditor({ event, timeZone, onClose }: { event: CampusEvent; timeZone: string; onClose(): void }) {
  const action = useAction();
  if (event.saved !== true || event.savedReminder === undefined) return null;
  return <TimedReminderEditor title="Event reminder" subjectTitle={event.title} reminder={event.savedReminder} timeZone={timeZone}
    onSave={values => action.mutateAsync(eventReminderRequest(values, event, timeZone))} onClose={onClose}/>;
}
