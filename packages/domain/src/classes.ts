import { Temporal } from '@js-temporal/polyfill';
import { dayBounds, localDateAt, overlapsDay } from './index';

export interface ClassPattern {
  id: string; title: string; weekdays: number[]; termStart: string; termEnd: string;
  startTime: string; endTime: string; timeZone: string;
  location: string | null; instructor: string | null; color: string;
}
export interface ClassOccurrence {
  key: string; classId: string; date: string; title: string; startsAt: string; endsAt: string;
  location: string | null; instructor: string | null; color: string;
}
export interface ClassScheduleIssue { classId: string; date: string; title: string }

/** Term dates follow the class zone; returned occurrences overlap the reader's day.
 * Ambiguous/nonexistent wall times are withheld and reported, never shifted. */
export function classesOnDay(classes: readonly ClassPattern[], date: string, timeZone: string) {
  const bounds = dayBounds(date, timeZone);
  const occurrences: ClassOccurrence[] = []; const issues: ClassScheduleIssue[] = [];
  for (const pattern of classes) {
    let local = Temporal.PlainDate.from(localDateAt(bounds.start, pattern.timeZone));
    const through = Temporal.PlainDate.from(localDateAt(Temporal.Instant.from(bounds.end).subtract({ nanoseconds: 1 }).toString(), pattern.timeZone));
    while (Temporal.PlainDate.compare(local, through) <= 0) {
      const classDate = local.toString();
      if (classDate >= pattern.termStart && classDate <= pattern.termEnd && pattern.weekdays.includes(local.dayOfWeek)) {
        try {
          const instant = (time: string) => Temporal.PlainDateTime.from(`${classDate}T${time}`)
            .toZonedDateTime(pattern.timeZone, { disambiguation: 'reject' }).toInstant().toString();
          const startsAt = instant(pattern.startTime); const endsAt = instant(pattern.endTime);
          if (overlapsDay(startsAt, endsAt, date, timeZone)) occurrences.push({
            key: `${pattern.id}:${classDate}`, classId: pattern.id, date: classDate,
            title: pattern.title, startsAt, endsAt, location: pattern.location, instructor: pattern.instructor, color: pattern.color,
          });
        } catch {
          issues.push({ classId: pattern.id, date: classDate, title: pattern.title });
        }
      }
      local = local.add({ days: 1 });
    }
  }
  occurrences.sort((a, b) => Temporal.Instant.compare(a.startsAt, b.startsAt) || a.key.localeCompare(b.key));
  return { occurrences, issues };
}

export function classConflicts(occurrences: readonly ClassOccurrence[]): Set<string> {
  const conflicts = new Set<string>();
  for (let left = 0; left < occurrences.length; left++) for (let right = left + 1; right < occurrences.length; right++) {
    const a = occurrences[left], b = occurrences[right];
    if (Temporal.Instant.compare(a.startsAt, b.endsAt) < 0 && Temporal.Instant.compare(b.startsAt, a.endsAt) < 0) {
      conflicts.add(a.key); conflicts.add(b.key);
    }
  }
  return conflicts;
}
