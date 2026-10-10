# Class timetable

The student can answer "when and where is my next class?" independently of
Canvas. This extends the ToR's daily student workflow (sections 1, 4 and 22)
under [ADR 004](../adr/004-class-timetable.md).

## Behavior

- Add, edit or explicitly remove an account-owned weekly meeting pattern.
  A lecture/lab with a different time or room uses a separate pattern.
- Enter class name, unique weekdays, inclusive term dates, same-day 24-hour
  start/end times, IANA timezone, room, instructor, notes and class color.
- View Monday–Sunday meetings, class hours and a selected day's room/time
  agenda. The account timezone controls display; class-local dates control
  term membership. Overlaps warn but do not prevent saving a real schedule.
- Read validated saved schedules offline; distinguish unavailable from empty
  data. Failed writes keep the draft or removal confirmation for retry.
- Reject impossible dates, reversed times/terms, duplicate weekdays and
  client-selected ownership. Every endpoint requires authentication.
- Never silently shift ambiguous/nonexistent DST times. Warn and withhold
  affected meetings. Weekly counts exclude invalid occurrences and deduplicate
  meetings that overlap account midnight.

## API and modules

`GET /classes`, `POST /classes`, `PUT /classes/:id` (complete replacement) and
`DELETE /classes/:id`. Domain expansion and conflict detection are pure;
PostgreSQL stores patterns, not derived days. Mobile uses the existing cache
and account-safe mutation services. Entry is available from the weekly planner.

## Verification

Contract tests cover input boundaries; domain tests cover term endpoints,
timezone midnight, spring/fall DST and conflicts. API HTTP tests verify auth,
owned predicates and complete replacements; PostgreSQL tests verify persistence,
cross-account isolation, deletion and account cascades. Mobile tests cover
validation, pending safety, failure/retry, unavailable vs empty, stale labels,
selected-day navigation and account transitions. Query tests verify offline
cache validation and isolation.

Run `npm.cmd run check` and mobile web export, plus responsive browser QA.
Native-device acceptance is a separate gate. Holidays, rotating weeks,
overnight classes, automatic notifications and Canvas timetable import are
outside this slice.
