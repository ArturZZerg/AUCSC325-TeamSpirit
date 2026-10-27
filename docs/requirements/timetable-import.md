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
- One-time events, all-day events, events without an end, untitled or
  overnight events and patterns that finished before today are skipped and
  counted in the preview, once per calendar event. Events using calendar
  features the reader doesn't support, and non-event components such as tasks,
  are skipped and counted without discarding the rest of the file. A file whose
  recurrence rules are malformed at the text level (for example `INTERVAL=0`)
  is refused as a whole.
- Term dates come from the meetings found from 90 days ago to 275 days ahead,
  so a full-year course keeps its spring end. A saved class repeats every week
  of its term, so holidays excluded in the calendar (`EXDATE`) are not carried
  over; the student edits the class if needed.
- Classes the API refuses (for example invalid times) are shown with the
  reason and not retried. Only lost connections and server errors offer retry.
- An empty, oversized, malformed or class-free file gets a clear message and a
  way to pick another file. The preview is not cached and never leaves the
  student's account.

## Where class times come from

Canvas does not hold class meeting times. On 2026-10-21 a read-only check of a
real University of Alberta account through the API's own Canvas client found no
calendar events (`type=event`) for the user or any of its three courses, only
assignment due dates. Class times live in the university's own tools (Bear
Tracks, My Schedule Builder), so the import stays file-based and Canvas is not
extended for class times. Canvas course calendar events (review sessions, exam
times) are imported as private events ([ADR 025](../adr/025-canvas-planner-calendar-and-removals.md)),
but they are not weekly class meetings and don't feed the timetable. The import screen lists the steps to get an `.ics` file (university
export, or a Google Calendar export as a fallback) and offers manual entry.
Entry points: an empty timetable leads with **Import my class schedule**, the
Today class card offers it while no classes are saved, Settings → School links
the timetable, and the connected Canvas screen explains that class times come
from a calendar file.

## API

`POST /classes/import-preview` with a `text/calendar` body (authenticated, up
to 1 MB) returns `{ classes, skipped }`. It saves nothing.

Parsing runs on the API's single event loop on a shared server, so uploads have
strict budgets: 20 previews per account per hour, at most 60,000 expansion
steps (1,500 per series, explicit dates included), 3,000 events, 5,000
components and 3 seconds of work. Open-ended series start just before the scan
window instead of at their first date. A crafted file stops early and previews
what it found so far.

## Verification

- API tests: pattern detection (RRULE weekly, exceptions/EXDATE, separate
  explicit meetings, merged weekdays, DST in the account zone), skips, limits,
  malformed input, auth, duplicate marking against saved classes, and
  cross-account isolation.
- Mobile tests: pick → preview → select → save, partial failure and retry,
  empty and error states, duplicate defaults.
- Browser check at 375 px and desktop width.
