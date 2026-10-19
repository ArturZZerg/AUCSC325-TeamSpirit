# Timetable import from a calendar file

*As a student, I want to import my class schedule from a calendar file instead
of typing every class.* Roadmap item 9. It extends the
[class timetable](class-timetable.md) (ADR 004) and adds no new entity.

## Behaviour

- From the timetable, the student picks an `.ics` file: a university schedule
  export, or a Google, Outlook or Apple calendar export. CampusFlow never asks
  for university credentials or fetches a portal on the student's behalf.
- The API reads the file (at most 1 MB) with the same hardened ICS reader as
  campus events. It expands recurring events and detects **weekly class
  patterns** in the account time zone: the same title, location, start and end
  time on the same weekday, meeting at least twice. Weekdays sharing title,
  room, times and term become one pattern.
- The preview lists each detected class with days, times, room, term dates and
  meeting count. Classes that look like ones already saved are marked and
  unselected by default. The student chooses what to import, then saves.
- Saving creates ordinary class schedules through `POST /classes`. Each class
  saves independently. On a failure, the saved ones stay saved and are shown as
  done, and the rest can be retried. Nothing is saved before the student
  confirms.
- One-time events, all-day events, events without an end, overnight events and
  patterns that finished before today are skipped and counted in the preview.
  Events using calendar features the reader doesn't support are skipped and
  reported, without discarding the rest of the file.
- An empty, oversized, malformed or class-free file gets a clear message and a
  way to pick another file. The preview is not cached and never leaves the
  student's account.

## API

`POST /classes/import-preview` with a `text/calendar` body (authenticated, up
to 1 MB) returns `{ classes, skipped, issues }`. It reads nothing and writes
nothing beyond the request.

## Verification

- API tests: pattern detection (RRULE weekly, exceptions/EXDATE, separate
  explicit meetings, merged weekdays, DST in the account zone), skips, limits,
  malformed input, auth, duplicate marking against saved classes, and
  cross-account isolation.
- Mobile tests: pick → preview → select → save, partial failure and retry,
  empty and error states, duplicate defaults.
- Browser check at 375 px and desktop width.
