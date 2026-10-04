import { z } from 'zod';
import { eventSchema, dateSchema, timeZoneSchema } from '@campusflow/contracts';
import { dayBounds, eventOverlapsRange } from '@campusflow/domain';

export const coverageSchema = z.object({ from: dateSchema, through: dateSchema, timeZone: timeZoneSchema }).strict()
  .refine(c => c.from < c.through && (Date.parse(c.through) - Date.parse(c.from)) / 86400000 <= 366,
    'Coverage must be a nonempty half-open date range of at most 366 days');
export type EventCoverage = z.infer<typeof coverageSchema>;
export const importedEventSchema = eventSchema.omit({ id: true, source: true }).strict().superRefine((e, ctx) => {
  const t = e.timing;
  if (t.kind === 'allDay' ? t.startDate >= t.endDateExclusive : t.endsAt !== null && Date.parse(t.endsAt) < Date.parse(t.startsAt))
    ctx.addIssue({ code: 'custom', message: 'Invalid event interval' });
});
export type ImportedEvent = z.infer<typeof importedEventSchema>;
export type EventBatch = { status: 'complete' | 'incomplete'; coverage: EventCoverage; events: ImportedEvent[]; issues: string[] }
  | { status: 'failed'; issues: string[] };
export interface EventProvider { fetchEvents(coverage: EventCoverage): Promise<EventBatch>; }
export const inCoverage = (event: ImportedEvent, coverage: EventCoverage): boolean => eventOverlapsRange(
  event.timing.kind === 'timed' ? { ...event.timing, endsAt: event.timing.endsAt ?? undefined } : event.timing,
  dayBounds(coverage.from, coverage.timeZone).start, dayBounds(coverage.through, coverage.timeZone).start, coverage.timeZone);
