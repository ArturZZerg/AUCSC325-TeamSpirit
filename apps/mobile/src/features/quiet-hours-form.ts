import { localTimeSchema, updateNotificationPreferencesSchema } from '@campusflow/contracts';
import { z } from 'zod';
const time = z.string().trim().refine(value => value === '' || localTimeSchema.safeParse(value).success, 'Enter a time as HH:MM, such as 22:00.');
export const quietHoursFormSchema = z.object({ start: time, end: time }).superRefine((value, context) => {
  if (Boolean(value.start) !== Boolean(value.end)) context.addIssue({ code: 'custom', path: ['end'], message: 'Enter both times, or clear both to disable quiet hours.' });
  if (value.start && value.start === value.end) context.addIssue({ code: 'custom', path: ['end'], message: 'Choose different start and end times, or disable quiet hours.' });
});
export type QuietHoursForm = z.infer<typeof quietHoursFormSchema>;
export function quietHoursRequest(values: QuietHoursForm) {
  const valid = quietHoursFormSchema.parse(values);
  return { path: '/notification-preferences', method: 'PATCH', body: updateNotificationPreferencesSchema.parse({
    quietHoursStart: valid.start || null, quietHoursEnd: valid.end || null,
  }) };
}
