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
  /** Omitted on save keeps the saved course; null clears it. */
  courseId: idSchema.nullable().optional(),
});
export function validateClassPattern(value: { termStart: string; termEnd: string; startTime: string; endTime: string }, context: z.RefinementCtx) {
  if (value.termEnd < value.termStart) context.addIssue({ code: 'custom', path: ['termEnd'], message: 'Term end must be on or after its start.' });
  if (value.endTime <= value.startTime) context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time on the same day.' });
}
export const saveClassScheduleSchema = classScheduleFieldsSchema.strict().superRefine(validateClassPattern);
export const classScheduleSchema = classScheduleFieldsSchema.extend({
  courseId: idSchema.nullable(), id: idSchema, createdAt: instantSchema, updatedAt: instantSchema,
}).superRefine(validateClassPattern);
export type ClassSchedule = z.infer<typeof classScheduleSchema>;
export type SaveClassSchedule = z.infer<typeof saveClassScheduleSchema>;

/** Upper bound for an uploaded calendar file in the timetable import preview. */
export const classImportMaxBytes = 1024 * 1024;
export const classImportDraftLimit = 40;
/** A weekly pattern detected in an uploaded calendar; saved only through POST /classes. */
export const classImportDraftSchema = classScheduleFieldsSchema.omit({ courseId: true }).extend({
  meetings: z.number().int().min(2),
  /** A saved class with the same title, start time and an overlapping weekday. */
  duplicateOf: idSchema.nullable(),
}).strict().superRefine(validateClassPattern);
export const classImportPreviewSchema = z.object({
  classes: z.array(classImportDraftSchema).max(classImportDraftLimit),
  skipped: z.object({
    oneTime: z.number().int().min(0), allDay: z.number().int().min(0), unsupported: z.number().int().min(0),
    finished: z.number().int().min(0), overLimit: z.number().int().min(0),
  }).strict(),
}).strict();
export type ClassImportDraft = z.infer<typeof classImportDraftSchema>;
export type ClassImportPreview = z.infer<typeof classImportPreviewSchema>;
