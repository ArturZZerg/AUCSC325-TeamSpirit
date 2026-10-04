import { dateSchema, localTimeSchema, updatePersonalTaskSchema } from '@campusflow/contracts';
import { instantAtLocalTime, localClockAt } from '@campusflow/domain';
import { z } from 'zod';
import type { PersonalTask } from '@/lib/types';
export function taskReminderFormSchema(task: PersonalTask, timeZone: string) {
  return z.object({ mode: z.enum(['none', 'instant', 'existing']), date: z.string(), time: z.string() }).superRefine((value, context) => {
    if (value.mode === 'existing' && task.reminder?.kind !== 'instant') context.addIssue({ code: 'custom', path: ['time'], message: 'Choose a reminder time.' });
    if (value.mode !== 'instant') return;
    const validDate = dateSchema.safeParse(value.date).success; const validTime = localTimeSchema.safeParse(value.time).success;
    if (!validDate) context.addIssue({ code: 'custom', path: ['date'], message: 'Enter a valid date as YYYY-MM-DD.' });
    if (!validTime) context.addIssue({ code: 'custom', path: ['time'], message: 'Enter a time as HH:MM, such as 17:00.' });
    if (validDate && validTime) {
      try {
        const at = instantAtLocalTime(value.date, value.time, timeZone);
        if (Date.parse(at) <= Date.now()) context.addIssue({ code: 'custom', path: ['time'], message: 'Choose a reminder time in the future.' });
      } catch { context.addIssue({ code: 'custom', path: ['time'], message: 'This time is missing or occurs twice in your account time zone. Choose another time.' }); }
    }
  });
}
export type TaskReminderForm = z.infer<ReturnType<typeof taskReminderFormSchema>>;
export function taskReminderDefaults(task: PersonalTask, timeZone: string): TaskReminderForm {
  const reminder = task.reminder;
  if (reminder?.kind === 'instant') return { mode: 'existing', ...localClockAt(reminder.at, timeZone) };
  return { mode: reminder ? 'instant' : 'none', date: reminder?.date ?? '', time: '' };
}
export function taskReminderRequest(values: TaskReminderForm, task: PersonalTask, timeZone: string) {
  const valid = taskReminderFormSchema(task, timeZone).parse(values);
  const reminder = valid.mode === 'existing' ? task.reminder : valid.mode === 'none' ? null
    : { kind: 'instant' as const, at: instantAtLocalTime(valid.date, valid.time, timeZone) };
  return { path: `/tasks/${task.id}`, method: 'PATCH', body: updatePersonalTaskSchema.parse({ reminder }) };
}
