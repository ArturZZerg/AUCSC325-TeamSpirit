import { Temporal } from '@js-temporal/polyfill';
import { classImportDraftLimit, classImportDraftSchema, type ClassImportDraft, type ClassImportPreview } from '@campusflow/contracts';
import { localClockAt } from '@campusflow/domain';
import type { ImportedEvent } from '../events/event-provider';
import type { IcsLimits } from '../events/ics-event-provider';

/** Expansion runs on the shared event loop, so student uploads get tight budgets; a class schedule needs far less. */
export const uploadLimits: IcsLimits = { steps: 60_000, seriesSteps: 1_500, events: 3_000, components: 5_000, deadlineMs: 3_000 };

type Saved = { id: string; title: string; startTime: string; weekdays: number[] };
type Meeting = { source: string; title: string; location: string | null; date: string; weekday: number; startTime: string; endTime: string };
const palette = ['moss', 'blue', 'plum', 'coral'] as const;
const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
/** The calendar event (UID) an expanded occurrence came from; skips are counted once per calendar event. */
const sourceOf = (externalId: string) => { try { const [uid] = JSON.parse(externalId) as unknown[]; return String(uid); } catch { return externalId; } };

/**
 * Detects weekly class patterns in already-expanded calendar events, in the
 * account time zone. A pattern is the same title, room and times on one
 * weekday at least twice; weekdays that share title, room, times and term
 * merge into one class. Everything else is counted, never guessed.
 */
export function detectClassPatterns(events: readonly ImportedEvent[], options: { timeZone: string; today: string; saved: readonly Saved[]; unsupported: number; truncated?: boolean }): ClassImportPreview {
  const sources = { oneTime: new Set<string>(), allDay: new Set<string>(), unsupported: new Set<string>(), finished: new Set<string>() };
  const meetings = new Map<string, Meeting[]>();
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.externalId)) continue;
    seen.add(event.externalId);
    const source = sourceOf(event.externalId);
    if (event.timing.kind !== 'timed' || !event.timing.endsAt) { sources.allDay.add(source); continue; }
    const start = localClockAt(event.timing.startsAt, options.timeZone), end = localClockAt(event.timing.endsAt, options.timeZone);
    const title = event.title.trim().replace(/\s+/g, ' ').slice(0, 240), location = event.location?.trim().replace(/\s+/g, ' ').slice(0, 240) || null;
    // Untitled, overnight or zero-length meetings do not fit a same-day class pattern.
    if (!title || end.date !== start.date || end.time <= start.time) { sources.unsupported.add(source); continue; }
    const meeting = { source, title, location, date: start.date, weekday: Temporal.PlainDate.from(start.date).dayOfWeek, startTime: start.time, endTime: end.time };
    const key = JSON.stringify([norm(title), norm(location ?? ''), meeting.weekday, meeting.startTime, meeting.endTime]);
    const group = meetings.get(key);
    if (group) group.push(meeting); else meetings.set(key, [meeting]);
  }

  type Pattern = { title: string; location: string | null; weekdays: number[]; startTime: string; endTime: string; termStart: string; termEnd: string; meetings: number };
  const patterns: Pattern[] = [], used = new Set<string>();
  for (const group of meetings.values()) {
    const dates = [...new Set(group.map(meeting => meeting.date))].sort();
    if (dates.length < 2) { group.forEach(meeting => sources.oneTime.add(meeting.source)); continue; }
    if (dates.at(-1)! < options.today) { group.forEach(meeting => sources.finished.add(meeting.source)); continue; }
    group.forEach(meeting => used.add(meeting.source));
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
  // A recurring event that also produced a class is not reported as skipped for its odd leftovers.
  const count = (set: Set<string>) => [...set].filter(source => !used.has(source)).length;
  const skipped = { oneTime: count(sources.oneTime), allDay: count(sources.allDay), unsupported: options.unsupported + count(sources.unsupported),
    finished: count(sources.finished), overLimit: Math.max(0, merged.length - classImportDraftLimit) };
  const drafts = merged.slice(0, classImportDraftLimit).map((pattern, index) => classImportDraftSchema.safeParse({
    title: pattern.title, weekdays: pattern.weekdays, termStart: pattern.termStart, termEnd: pattern.termEnd,
    startTime: pattern.startTime, endTime: pattern.endTime, timeZone: options.timeZone, location: pattern.location,
    instructor: null, notes: null, color: palette[index % palette.length], meetings: pattern.meetings,
    duplicateOf: options.saved.find(saved => norm(saved.title) === norm(pattern.title) && saved.startTime === pattern.startTime
      && saved.weekdays.some(day => pattern.weekdays.includes(day)))?.id ?? null,
  }));
  // One odd pattern is dropped and counted, never allowed to fail the whole preview.
  const classes: ClassImportDraft[] = drafts.flatMap(result => result.success ? [result.data] : []);
  skipped.unsupported += drafts.length - classes.length;
  return { classes, skipped, truncated: options.truncated ?? false };
}
