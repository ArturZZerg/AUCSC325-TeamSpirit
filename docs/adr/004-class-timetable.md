# ADR 004 — Student-owned class timetable

Status: Accepted

Date: 2026-10-09

## Context

CampusFlow plans deadlines and study tasks but cannot tell a student when or
where their next class meets. A term timetable makes the daily plan useful
without requiring Canvas authorization. Classes are commitments, not tasks to
complete, external campus events, or imported Course projections.

## Decision

Add an account-owned `ClassSchedule` entity in the existing API/PostgreSQL
application. Each record describes one weekly meeting pattern: title, weekdays,
inclusive term dates, local start/end times, IANA timezone, location, instructor,
notes and a palette choice. Separate records support a lecture and lab with
different rooms or times. Same-day meetings are supported; overnight meetings,
rotating weeks and holiday exceptions are deferred.

Contracts validate transport shapes; domain functions derive occurrences for
the reader's calendar day. The API enforces ownership on every CRUD operation.
Full replacement edits validate the complete pattern atomically. Mobile uses
the existing account-scoped validated cache and mutation lifecycle.

Classes remain separate from `DailyPlanItem` and expose no completion action.
The timetable and subsequent Today/planner sections compose them at read time;
no derived calendar rows are persisted. Explicit DST gaps/overlaps produce a
schedule warning rather than silently shifting a class. Term dates and weekdays
follow the class timezone; presentation follows the account timezone.

## Consequences

Students can enter real schedules independently of Canvas. Study availability
can be derived from class occurrences and other saved timed commitments.
Cached schedules may be stale and are labelled accordingly. Writes require
connectivity. Classes have no automatic notifications in this slice. This adds
one entity/module within the accepted monorepo, not another service or store.
