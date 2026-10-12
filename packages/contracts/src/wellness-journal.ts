import { z } from 'zod';
import { createWellnessEntrySchema, dateSchema, idSchema, instantSchema, timeZoneSchema, wellnessEntrySchema } from './index';

export const wellnessVersionSchema = z.object({ id: idSchema, revision: z.number().int().min(1).max(2147483647) }).strict();
export const wellnessJournalEntrySchema = wellnessEntrySchema.extend({ revision: wellnessVersionSchema.shape.revision }).strict();
export const wellnessJournalQuerySchema = z.object({ from: dateSchema, through: dateSchema }).strict().refine(value => {
  const days = (Date.parse(`${value.through}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86400000;
  return days >= 0 && days <= 30;
}, 'Choose an inclusive range of at most 31 days.');
export const wellnessJournalSchema = z.object({ accountId: idSchema, timeZone: timeZoneSchema, from: dateSchema,
  through: dateSchema, capturedAt: instantSchema, entries: wellnessJournalEntrySchema.array().max(31) }).strict().superRefine((value, ctx) => {
  if (!wellnessJournalQuerySchema.safeParse({ from: value.from, through: value.through }).success
    || value.entries.some(entry => entry.date < value.from || entry.date > value.through)
    || new Set(value.entries.map(entry => entry.date)).size !== value.entries.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Journal entries must belong to the complete requested range.' });
});
export const saveWellnessJournalSchema = createWellnessEntrySchema.omit({ date: true }).extend({
  expected: wellnessVersionSchema.nullable(), note: z.string().trim().max(2000).nullable(),
}).strict().refine(value => value.mood !== null || value.energy !== null || value.stress !== null || !!value.note,
  'Choose a rating or add a note.');
export const deleteWellnessJournalSchema = z.object({ expected: wellnessVersionSchema }).strict();
