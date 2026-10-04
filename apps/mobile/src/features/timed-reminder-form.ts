import { dateSchema, localTimeSchema, scheduleSchema } from '@campusflow/contracts';
import { instantAtLocalTime, localClockAt } from '@campusflow/domain';
import { z } from 'zod';
export type ReminderTiming = z.infer<typeof scheduleSchema> | null;
export function timedReminderFormSchema(reminder: ReminderTiming, timeZone: string, zoneLabel = 'account') {
  return z.object({ mode: z.enum(['none', 'instant', 'existing']), date: z.string(), time: z.string() }).superRefine((value, context) => {
    if (value.mode === 'existing' && reminder?.kind !== 'instant') context.addIssue({ code: 'custom', path: ['time'], message: 'Choose a reminder time.' });
    if (value.mode !== 'instant') return;
    const validDate = dateSchema.safeParse(value.date).success; const validTime = localTimeSchema.safeParse(value.time).success;
    if (!validDate) context.addIssue({ code: 'custom', path: ['date'], message: 'Enter a valid date as YYYY-MM-DD.' });
    if (!validTime) context.addIssue({ code: 'custom', path: ['time'], message: 'Enter a time as HH:MM, such as 17:00.' });
    if (validDate && validTime) {
      try {
        const at = instantAtLocalTime(value.date, value.time, timeZone);
        if (Date.parse(at) <= Date.now()) context.addIssue({ code: 'custom', path: ['time'], message: 'Choose a reminder time in the future.' });
      } catch { context.addIssue({ code: 'custom', path: ['time'], message: `This time is missing or occurs twice in your ${zoneLabel} time zone. Choose another time.` }); }
    }
  });
}
export type TimedReminderForm = z.infer<ReturnType<typeof timedReminderFormSchema>>;
export function timedReminderDefaults(reminder: ReminderTiming, timeZone: string): TimedReminderForm {
  if (reminder?.kind === 'instant') return { mode: 'existing', ...localClockAt(reminder.at, timeZone) };
  return { mode: reminder ? 'instant' : 'none', date: reminder?.date ?? '', time: '' };
}
export function timedReminderValue(values: TimedReminderForm, reminder: ReminderTiming, timeZone: string, zoneLabel = 'account') {
  const valid = timedReminderFormSchema(reminder, timeZone, zoneLabel).parse(values);
  return valid.mode === 'existing' ? reminder : valid.mode === 'none' ? null
    : { kind: 'instant' as const, at: instantAtLocalTime(valid.date, valid.time, timeZone) };
}
