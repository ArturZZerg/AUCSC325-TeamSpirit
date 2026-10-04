import { updatePersonalTaskSchema } from '@campusflow/contracts';
import type { PersonalTask } from '@/lib/types';
import { timedReminderDefaults, timedReminderFormSchema, timedReminderValue, type TimedReminderForm } from '@/features/timed-reminder-form';
export type TaskReminderForm = TimedReminderForm;
export const taskReminderFormSchema = (task: PersonalTask, timeZone: string) => timedReminderFormSchema(task.reminder, timeZone);
export const taskReminderDefaults = (task: PersonalTask, timeZone: string) => timedReminderDefaults(task.reminder, timeZone);
export function taskReminderRequest(values: TaskReminderForm, task: PersonalTask, timeZone: string) {
  return { path: `/tasks/${task.id}`, method: 'PATCH', body: updatePersonalTaskSchema.parse({ reminder: timedReminderValue(values, task.reminder, timeZone) }) };
}
