# ADR 025 — Canvas planner to-dos, course calendars and removals

Status: Accepted

Date: 2026-10-27

## Context

ADR 019's token sync imports active courses and their assignments. It left out
three things students see in Canvas: to-dos in the Canvas planner that are not
assignments (pages and ungraded discussions with a to-do date, and the student's
own planner notes), events on course calendars (review sessions, exam times,
field trips), and assignments the instructor deletes. Because absence was never
a deletion signal, a deleted assignment stayed in CampusFlow and its reminder
kept firing.

ADR 001 keeps Canvas isolated in the API and lets events come from more than one
provider. Private events (`sourceScope: user:<id>`) already exist and already
show only to their owner in Campus, Today and the offline snapshot, but
`EventSyncService` accepted only `campus:` sources.

## Decision

- Token sync reads a window in the student's time zone, from 30 days ago to 180
  days ahead. The window is passed to the HTTP client; fixture mode is unchanged.
- **Planner to-dos.** `GET /api/v1/planner/items` for the window. Pages,
  discussions and planner notes become `AcademicItem`s of kind `planner` ("Other
  work") with `externalId` `planner:<type>:<id>`, the to-do date as the due time,
  and "submitted" when marked done in the planner. Anything with an
  `assignment_id` is skipped because it already arrives as an assignment.
  Notes without a course, or in a course that isn't imported, are skipped.
- **Course calendars.** `GET /api/v1/calendar_events?type=event` for every
  imported course, ten courses per request. Events become private events under
  source `canvas:calendar` and scope `user:<id>`, imported through
  `EventSyncService` with the window as coverage. `EventSyncService` accepts this
  one Canvas source, and only with a user scope, so Canvas data can't become a
  public event. Descriptions are reduced to plain text; links are kept only when
  they point at the student's Canvas address; deleted and hidden events are
  skipped. The existing coverage rules remove an event gone from a complete read
  unless the student saved it. The calendar import runs after the coursework
  transaction; if it fails, coursework is kept and `eventsUpdated` is 0.
- **Removals.** The HTTP client reports which courses had every assignment read
  (no unread pages, no unreadable rows, not cut by the 2,000-assignment cap) and
  whether the planner listing was read in full. Inside the sync transaction, a
  Canvas assignment missing from such a course, or a planner to-do missing from a
  complete planner read whose to-do date was inside the window, is deleted with
  its reminders, the same way students delete their own coursework. Study plans
  stay and lose the link. Without a complete read, absence is still not a
  deletion signal.

## Consequences

Canvas to-dos and course events appear in the daily plan, Coursework and Campus.
Deleted Canvas work no longer lingers or sends reminders. Campus cards for these
events say "From your Canvas calendar". Disconnecting Canvas keeps imported
events, like it keeps coursework; deleting the account removes them.
Announcements, quiz-only items outside the assignment list, and planner notes
without a course are not imported. Calendar events outside the window are left
as they were.
