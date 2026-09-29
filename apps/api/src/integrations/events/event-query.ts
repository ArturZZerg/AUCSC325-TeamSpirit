import { BadRequestException } from '@nestjs/common';
import { dayBounds, eventOverlapsRange, eventStartInstant } from '@campusflow/domain';
import { Event, eventQuerySchema } from '@campusflow/contracts';
import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
export function eventRange(query: z.infer<typeof eventQuerySchema>, timeZone: string) {
  const boundary = (value?: string) => value?.length === 10 ? dayBounds(value, timeZone).start : value;
  const from = boundary(query.from), through = boundary(query.through);
  if (from && through && Temporal.Instant.compare(from, through) >= 0) throw new BadRequestException('Expected from < through (exclusive)');
  return { from, through };
}
const timing = (event: Event) => event.timing.kind === 'timed' ? { ...event.timing, endsAt: event.timing.endsAt ?? undefined } : event.timing;
export function selectEvents<T extends Event>(events: T[], range: { from?: string; through?: string }, timeZone: string): T[] {
  return events.filter(e => eventOverlapsRange(timing(e), range.from, range.through, timeZone))
    .sort((a, b) => Temporal.Instant.compare(eventStartInstant(timing(a), timeZone), eventStartInstant(timing(b), timeZone)) || a.id.localeCompare(b.id));
}
