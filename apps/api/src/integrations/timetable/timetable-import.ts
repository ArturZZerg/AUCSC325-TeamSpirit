import { Temporal } from '@js-temporal/polyfill';
import { classImportDraftLimit, classImportDraftSchema, type ClassImportDraft, type ClassImportPreview } from '@campusflow/contracts';
import { localClockAt } from '@campusflow/domain';
import type { ImportedEvent } from '../events/event-provider';

type Saved = { id: string; title: string; startTime: string; weekdays: number[] };
type Meeting = { title: string; location: string | null; date: string; weekday: number; startTime: string; endTime: string };
const palette = ['moss', 'blue', 'plum', 'coral'] as const;
const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Detects weekly class patterns in already-expanded calendar events, in the
 * account time zone. A pattern is the same title, room and times on one
 * weekday at least twice; weekdays that share title, room, times and term
 * merge into one class. Everything else is counted, never guessed.
 */
export function detectClassPatterns(events: readonly ImportedEvent[], options: { timeZone: string; today: string; saved: readonly Saved[]; unsupported: number }): ClassImportPreview {
  const skipped = { oneTime: 0, allDay: 0, unsupported: options.unsupported, finished: 0, overLimit: 0 };
  const meetings = new Map<string, Meeting[]>();
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.externalId)) continue;
    seen.add(event.externalId);
    if (event.timing.kind !== 'timed' || !event.timing.endsAt) { skipped.allDay++; continue; }
    const start = localClockAt(event.timing.startsAt, options.timeZone), end = localClockAt(event.timing.endsAt, options.timeZone);
    // Overnight or zero-length meetings do not fit a same-day class pattern.
    if (end.date !== start.date || end.time <= start.time) { skipped.unsupported++; continue; }
    const title = event.title.trim().replace(/\s+/g, ' ').slice(0, 240), location = event.location?.trim().replace(/\s+/g, ' ').slice(0, 240) || null;
    const meeting = { title, location, date: start.date, weekday: Temporal.PlainDate.from(start.date).dayOfWeek, startTime: start.time, endTime: end.time };
    const key = JSON.stringify([norm(title), norm(location ?? ''), meeting.weekday, meeting.startTime, meeting.endTime]);
    meetings.set(key, [...(meetings.get(key) ?? []), meeting]);
  }

  type Pattern = { title: string; location: string | null; weekdays: number[]; startTime: string; endTime: string; termStart: string; termEnd: string; meetings: number };
  const patterns: Pattern[] = [];
  for (const group of meetings.values()) {
    const dates = [...new Set(group.map(meeting => meeting.date))].sort();
    if (dates.length < 2) { skipped.oneTime += group.length; continue; }
    if (dates.at(-1)! < options.today) { skipped.finished += dates.length; continue; }
    const [first] = group;
    patterns.push({ title: first.title, location: first.location, weekdays: [first.weekday], startTime: first.startTime, endTime: first.endTime,
      termStart: dates[0], termEnd: dates.at(-1)!, meetings: dates.length });
  }

  // Merge weekdays of one class: same title, room and times, with terms starting and ending within a week of each other.
  const merged: Pattern[] = [];
  const days = (a: string, b: string) => Math.abs(Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b)).days);
  for (const pattern of patterns.sort((a, b) => a.termStart.localeCompare(b.termStart) || a.weekdays[0] - b.weekdays[0])) {
    const match = merged.find(other => norm(other.title) === norm(pattern.title) && norm(other.location ?? '') === norm(pattern.location ?? '')
      && other.startTime === pattern.startTime && other.endTime === pattern.endTime
      && days(other.termStart, pattern.termStart) <= 7 && days(other.termEnd, pattern.termEnd) <= 7);
    if (!match) { merged.push({ ...pattern }); continue; }
    match.weekdays = [...new Set([...match.weekdays, ...pattern.weekdays])].sort((a, b) => a - b);
    if (pattern.termStart < match.termStart) match.termStart = pattern.termStart;
    if (pattern.termEnd > match.termEnd) match.termEnd = pattern.termEnd;
    match.meetings += pattern.meetings;
  }

  merged.sort((a, b) => a.weekdays[0] - b.weekdays[0] || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
  skipped.overLimit = Math.max(0, merged.length - classImportDraftLimit);
  const classes: ClassImportDraft[] = merged.slice(0, classImportDraftLimit).map((pattern, index) => classImportDraftSchema.parse({
    title: pattern.title, weekdays: pattern.weekdays, termStart: pattern.termStart, termEnd: pattern.termEnd,
    startTime: pattern.startTime, endTime: pattern.endTime, timeZone: options.timeZone, location: pattern.location,
    instructor: null, notes: null, color: palette[index % palette.length], meetings: pattern.meetings,
    duplicateOf: options.saved.find(saved => norm(saved.title) === norm(pattern.title) && saved.startTime === pattern.startTime
      && saved.weekdays.some(day => pattern.weekdays.includes(day)))?.id ?? null,
  }));
  return { classes, skipped };
}
