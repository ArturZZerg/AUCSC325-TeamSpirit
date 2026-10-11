import { Temporal } from '@js-temporal/polyfill';
import { dayBounds, eventOverlapsRange, localDateAt } from '@campusflow/domain';
import type { CampusSourceStatus } from '@campusflow/contracts';
import type { CampusEvent } from '@/lib/types';

export function campusGroups(events: CampusEvent[], options: { date: string; timeZone: string; days: 7 | 30; saved: boolean; search: string }) {
  const through = Temporal.PlainDate.from(options.date).add({ days: options.days }).toString();
  const search = options.search.trim().toLowerCase();
  const groups = new Map<string, CampusEvent[]>();
  for (const event of events) {
    if (options.saved && event.saved !== true) continue;
    if (search && ![event.title, event.category, event.location].some(value => value?.toLowerCase().includes(search))) continue;
    if (!options.saved && !eventOverlapsRange(event.timing.kind === 'timed' ? { ...event.timing, endsAt: event.timing.endsAt ?? undefined } : event.timing,
      dayBounds(options.date, options.timeZone).start, dayBounds(through, options.timeZone).start, options.timeZone)) continue;
    const start = event.timing.kind === 'allDay' ? event.timing.startDate : localDateAt(event.timing.startsAt, options.timeZone);
    const groupDate = !options.saved && start < options.date ? options.date : start;
    groups.set(groupDate, [...(groups.get(groupDate) ?? []), event]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, events: rows.sort((a, b) => {
    const start = (event: CampusEvent) => event.timing.kind === 'timed' ? event.timing.startsAt : dayBounds(event.timing.startDate, options.timeZone).start;
    return Date.parse(start(a)) - Date.parse(start(b)) || a.id.localeCompare(b.id);
  }) }));
}
export function campusDayLabel(date: string, today: string) {
  if (date === today) return 'Today';
  if (date === Temporal.PlainDate.from(today).add({ days: 1 }).toString()) return 'Tomorrow';
  return Temporal.PlainDate.from(date).toLocaleString('en', { weekday: 'long', month: 'short', day: 'numeric', ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
}
/** Cached "available" status ages out; device time cannot create fresh coverage. */
export function campusSourceAvailability(source: CampusSourceStatus, now: string, from: string, through: string, timeZone: string) {
  if (!source.lastSuccessfulAt || !source.coverage) return 'unavailable';
  const age = Date.parse(now) - Date.parse(source.lastSuccessfulAt);
  const coversRange = Date.parse(dayBounds(source.coverage.from, source.coverage.timeZone).start) <= Date.parse(dayBounds(from, timeZone).start)
    && Date.parse(dayBounds(source.coverage.through, source.coverage.timeZone).start) >= Date.parse(dayBounds(through, timeZone).start);
  return source.availability === 'available' && age >= 0 && age < 90 * 60000 && coversRange ? 'available' : 'stale';
}
export function campusWebsite(value: string | null) {
  if (!value) return undefined;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : undefined; }
  catch { return undefined; }
}
