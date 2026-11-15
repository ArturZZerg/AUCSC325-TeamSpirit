import { BadRequestException } from '@nestjs/common';
import { dayBounds, eventOverlapsRange, eventStartInstant } from '@campusflow/domain';
import { Event, eventQuerySchema } from '@campusflow/contracts';
import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { campusWideSource } from './campus-feeds';
export function eventRange(query: z.infer<typeof eventQuerySchema>, timeZone: string) {
  const boundary = (value?: string) => value?.length === 10 ? dayBounds(value, timeZone).start : value;
  const from = boundary(query.from), through = boundary(query.through);
  if (from && through && Temporal.Instant.compare(from, through) >= 0) throw new BadRequestException('Expected from < through (exclusive)');
  return { from, through };
}
const timing = (event: Event) => event.timing.kind === 'timed' ? { ...event.timing, endsAt: event.timing.endsAt ?? undefined } : event.timing;
const listing = (event: Event) => JSON.stringify([event.title.trim().toLowerCase(), event.timing.kind === 'timed' ? event.timing.startsAt : event.timing.startDate]);
/** Same title and start as another source's listing. A copy the student saved stays visible. */
export function withoutRepeatedListings<T extends Event & { saved?: boolean }>(events: T[]): T[] {
  const specific = new Set(events.filter(e => e.source !== campusWideSource).map(listing));
  return events.filter(e => e.source !== campusWideSource || e.saved || !specific.has(listing(e)));
}
export function selectEvents<T extends Event>(events: T[], range: { from?: string; through?: string }, timeZone: string): T[] {
  return events.filter(e => eventOverlapsRange(timing(e), range.from, range.through, timeZone))
    .sort((a, b) => Temporal.Instant.compare(eventStartInstant(timing(a), timeZone), eventStartInstant(timing(b), timeZone)) || a.id.localeCompare(b.id));
}
