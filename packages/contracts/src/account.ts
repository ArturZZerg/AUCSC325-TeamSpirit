import { z } from 'zod';
import { academicItemSchema, courseSchema, dateSchema, dueSchema, eventSchema, goalCompletionSchema, goalSchema, idSchema, instantSchema, notificationPreferencesSchema, personalTaskSchema, reminderSchema, savedEventSchema, taskCompletionSchema, userSchema, wellnessEntrySchema } from './index';
import { classScheduleSchema } from './classes';
import { focusSessionSchema } from './focus';

export const deleteAccountSchema = z.object({ currentPassword: z.string().min(1).max(128), confirmation: z.literal('DELETE') }).strict();
export const accountDeletedSchema = z.object({ deleted: z.literal(true) }).strict();
export const exportedStudyPlanSchema = z.object({ id: idSchema, academicItemId: idSchema.nullable(), title: z.string(),
  deadlineWhenPlanned: dueSchema.nullable(), archivedAt: instantSchema.nullable(), createdAt: instantSchema,
}).strict();
export const accountExportSchema = z.object({
  format: z.literal('campusflow-account'), version: z.literal(1), capturedAt: instantSchema,
  coverage: z.literal('server-saved'), profile: userSchema.strict(),
  personalTasks: personalTaskSchema.extend({ studyPlanOrder: z.number().int().nonnegative().nullable() }).strict().array(), taskCompletions: taskCompletionSchema.strict().array(),
  courses: courseSchema.extend({ source: z.string().min(1) }).strict().array(),
  academicItems: academicItemSchema.extend({ reminderLeadMinutes: z.number().int().nonnegative().nullable() }).strict().array(),
  classes: classScheduleSchema.array(), studyPlans: exportedStudyPlanSchema.array(), focusSessions: focusSessionSchema.array(),
  goals: goalSchema.strict().array(), goalCompletions: goalCompletionSchema.strict().array(), wellnessEntries: wellnessEntrySchema.strict().array(),
  privateEvents: eventSchema.strict().array(), savedEvents: savedEventSchema.extend({ event: eventSchema.strict() }).strict().array(),
  reminders: reminderSchema.strict().array(), notificationPreferences: notificationPreferencesSchema.strict().nullable(),
  canvasConnection: z.object({ baseUrl: z.string().url(), externalAccountId: z.string().nullable(),
    lastSuccessfulSyncAt: instantSchema.nullable(), lastSyncAttemptAt: instantSchema.nullable(),
    coveredFrom: dateSchema.nullable(), coveredThrough: dateSchema.nullable(),
  }).strict().nullable(),
}).strict();
export type AccountExport = z.infer<typeof accountExportSchema>;
