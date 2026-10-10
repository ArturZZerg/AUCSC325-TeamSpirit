import { Temporal } from '@js-temporal/polyfill';
import { instantAtLocalTime, localDateAt } from './index';

export interface BusyInterval { startsAt: string; endsAt: string }
export interface StudyWindow extends BusyInterval { minutes: number }

/** Conservative gaps inside account-local study hours. Durations are elapsed
 * minutes; calendar bounds are timezone-aware. Overlaps merge before subtraction. */
export function studyWindows(input: {
  date: string; timeZone: string; now: string; busy: readonly BusyInterval[];
  minimumMinutes: number; bufferMinutes?: number;
}): StudyWindow[] {
  const { date, timeZone, now, minimumMinutes } = input;
  if (!Number.isInteger(minimumMinutes) || minimumMinutes < 1 || minimumMinutes > 720) throw new RangeError('Invalid study duration');
  const buffer = input.bufferMinutes ?? 10;
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120) throw new RangeError('Invalid transition buffer');
  if (date < localDateAt(now, timeZone)) return [];
  const ms = (at: string) => Number(Temporal.Instant.from(at).epochMilliseconds);
  const from = Math.max(ms(instantAtLocalTime(date, '08:00', timeZone)), ms(now));
  const through = ms(instantAtLocalTime(date, '20:00', timeZone));
  if (from >= through) return [];
  const occupied = input.busy.map(interval => {
    const start = ms(interval.startsAt), end = ms(interval.endsAt);
    if (end <= start) throw new RangeError('Commitment end must follow its start');
    return { start: Math.max(from, start - buffer * 60000), end: Math.min(through, end + buffer * 60000) };
  }).filter(interval => interval.start < interval.end).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const interval of occupied) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  const windows: StudyWindow[] = [];
  const add = (start: number, end: number) => {
    // A simple quarter-hour start is easy to edit; round forward, never backward.
    const rounded = Math.ceil(start / (15 * 60000)) * 15 * 60000;
    const minutes = Math.floor((end - rounded) / 60000);
    if (minutes >= minimumMinutes) windows.push({ startsAt: Temporal.Instant.fromEpochMilliseconds(rounded).toString(), endsAt: Temporal.Instant.fromEpochMilliseconds(end).toString(), minutes });
  };
  let cursor = from;
  for (const interval of merged) { add(cursor, interval.start); cursor = Math.max(cursor, interval.end); }
  add(cursor, through);
  return windows;
}
