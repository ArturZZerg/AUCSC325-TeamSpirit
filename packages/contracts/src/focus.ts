import { z } from 'zod';
import { dateSchema, idSchema, instantSchema, timeZoneSchema } from './index';

const focusFields = z.object({
  taskId: idSchema.nullable(), title: z.string().trim().min(1).max(240),
  startedAt: instantSchema, endedAt: instantSchema,
  plannedMinutes: z.number().int().min(1).max(90), focusedSeconds: z.number().int().min(1).max(5400),
  outcome: z.enum(['completed', 'interrupted']),
});
const validTime = (value: z.infer<typeof focusFields>) => {
  const span = Date.parse(value.endedAt) - Date.parse(value.startedAt);
  return dateSchema.safeParse(value.startedAt.slice(0, 10)).success && dateSchema.safeParse(value.endedAt.slice(0, 10)).success
    && span >= value.focusedSeconds * 1000 && value.focusedSeconds <= value.plannedMinutes * 60
    && (value.outcome !== 'completed' || value.focusedSeconds === value.plannedMinutes * 60);
};
export const saveFocusSessionSchema = focusFields.extend({ requestKey: z.string().min(8).max(120) }).strict()
  .refine(validTime, 'Focus time must fit the block and exclude pauses.');
export const focusSessionSchema = focusFields.extend({ id: idSchema, createdAt: instantSchema }).refine(validTime, 'Invalid focus time.');
export const focusHistoryQuerySchema = z.object({ from: dateSchema, through: dateSchema }).strict().refine(value => {
  const days = (Date.parse(`${value.through}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86400000;
  return days >= 0 && days < 31;
}, 'Choose a window of at most 31 calendar days.');
export const focusHistorySchema = z.object({
  accountId: idSchema, timeZone: timeZoneSchema, from: dateSchema, through: dateSchema,
  capturedAt: instantSchema, sessions: focusSessionSchema.array(),
});
export type SaveFocusSession = z.infer<typeof saveFocusSessionSchema>;
export type FocusSession = z.infer<typeof focusSessionSchema>;
export type FocusHistory = z.infer<typeof focusHistorySchema>;
