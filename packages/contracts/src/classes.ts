import { z } from 'zod';
import { dateSchema, idSchema, instantSchema, localTimeSchema, timeZoneSchema } from './index';

export const classColorSchema = z.enum(['moss', 'blue', 'plum', 'coral']);
export const classScheduleFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Enter a class name.').max(240),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1, 'Choose at least one day.').max(7)
    .refine(days => new Set(days).size === days.length, 'Choose each day once.'),
  termStart: dateSchema, termEnd: dateSchema,
  startTime: localTimeSchema, endTime: localTimeSchema, timeZone: timeZoneSchema,
  location: z.string().trim().max(240).nullable(),
  instructor: z.string().trim().max(240).nullable(), notes: z.string().trim().max(2000).nullable(),
  color: classColorSchema,
});
export function validateClassPattern(value: { termStart: string; termEnd: string; startTime: string; endTime: string }, context: z.RefinementCtx) {
  if (value.termEnd < value.termStart) context.addIssue({ code: 'custom', path: ['termEnd'], message: 'Term end must be on or after its start.' });
  if (value.endTime <= value.startTime) context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time on the same day.' });
}
export const saveClassScheduleSchema = classScheduleFieldsSchema.strict().superRefine(validateClassPattern);
export const classScheduleSchema = classScheduleFieldsSchema.extend({
  id: idSchema, createdAt: instantSchema, updatedAt: instantSchema,
}).superRefine(validateClassPattern);
export type ClassSchedule = z.infer<typeof classScheduleSchema>;
export type SaveClassSchedule = z.infer<typeof saveClassScheduleSchema>;
