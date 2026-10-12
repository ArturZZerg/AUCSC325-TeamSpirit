import { addCalendarDays } from '@campusflow/domain';
import { wellnessJournalSchema, type wellnessJournalEntrySchema } from '@campusflow/contracts';
import type { z } from 'zod';
export type JournalEntry = z.infer<typeof wellnessJournalEntrySchema>;
export const ratingLabels = {
  mood: ['Very low', 'Low', 'Okay', 'Good', 'Great'],
  energy: ['Drained', 'Low', 'Steady', 'Energized', 'Very high'],
  stress: ['Very little', 'Low', 'Moderate', 'High', 'Very high'],
} as const;
export type Rating = keyof typeof ratingLabels;
export const ratingLabel = (metric: Rating, value: number | null) => value === null ? 'Not recorded' : ratingLabels[metric][value - 1];
export function reflectJournal(value: unknown, accountId: string, timeZone: string, through: string, days: 7 | 30) {
  const parsed = wellnessJournalSchema.safeParse(value), from = addCalendarDays(through, 1 - days);
  if (!parsed.success || parsed.data.accountId !== accountId || parsed.data.timeZone !== timeZone
    || parsed.data.from > from || parsed.data.through < through) return undefined;
  const entries = parsed.data.entries.filter(entry => entry.date >= from && entry.date <= through);
  const metric = (name: Rating) => {
    const ratings = entries.flatMap(entry => entry[name] === null ? [] : [entry[name]]);
    return { samples: ratings.length, average: ratings.length ? ratings.reduce((total, score) => total + score, 0) / ratings.length : null };
  };
  return { from, through, entries, savedDays: entries.length, days,
    mood: metric('mood'), energy: metric('energy'), stress: metric('stress'),
    calendar: Array.from({ length: days }, (_, index) => { const date = addCalendarDays(from, index);
      return { date, entry: entries.find(entry => entry.date === date) }; }) };
}
export function journalFields(entry: JournalEntry | null) {
  return { mood: entry?.mood ?? null, energy: entry?.energy ?? null, stress: entry?.stress ?? null, note: entry?.note ?? '' };
}
export const matchesJournalDraft = (entry: JournalEntry, values: ReturnType<typeof journalFields>) =>
  entry.mood === values.mood && entry.energy === values.energy && entry.stress === values.stress
  && (entry.note ?? '') === values.note.trim();
