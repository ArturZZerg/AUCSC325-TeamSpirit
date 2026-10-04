import { createWellnessEntrySchema } from '@campusflow/contracts';
import { z } from 'zod';
const rating = z.string().refine(value => value.trim() === '' || (/^[1-5]$/.test(value.trim())), 'Use a whole number from 1 to 5, or leave it blank.');
export const wellnessFormSchema = z.object({ mood: rating, energy: rating, stress: rating, note: z.string().max(2000, 'Keep your note within 2000 characters.') });
export function wellnessFormRequest(date: string, values: z.infer<typeof wellnessFormSchema>) {
  const valid = wellnessFormSchema.parse(values);
  const number = (value: string) => value.trim() === '' ? null : Number(value);
  return { path: '/wellness', body: createWellnessEntrySchema.parse({ date,
    mood: number(valid.mood), energy: number(valid.energy), stress: number(valid.stress), note: valid.note.trim() || null }) };
}
