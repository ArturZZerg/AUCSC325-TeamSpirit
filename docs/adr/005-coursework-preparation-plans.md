# ADR 005 — Coursework preparation plans

Status: Accepted

Date: 2026-10-09

## Context

Single study tasks help students get started, but larger assignments and exams
need several preparation steps with a visible shared outcome (ToR 3.2, 4 and 7).
Inferring a group from task titles or descriptions would lose identity after edits.

## Decision

- Add a student-owned `StudyPlan` that groups ordinary, nonrecurring PersonalTasks
  and optionally references one AcademicItem. The academic deadline and submission
  state remain on that separate entity. Preparation never submits coursework.
- Store a plan title and deadline captured when planning, plus the live optional
  academic relationship. Deleting coursework preserves preparation and its context.
  Deleting a plan detaches its tasks; task deletion removes that session from it.
- PostgreSQL is authoritative. The API validates ownership and creates the plan
  and all sessions in one transaction. A per-account request key and normalized
  request hash make a repeated save safe after a lost response; changed payloads
  with the same key are rejected. No background/offline write queue is introduced.
- The domain owns calendar-day distribution. Mobile owns editable previews and
  account-scoped cached reads. Suggestions choose flexible dates, not guaranteed
  free time; existing task editors, completion, focus, Today and reminders apply.
- Progress is derived from the current member tasks, never a persisted counter.
  Estimates describe planned work, not measured focus time or academic achievement.

## Consequences

One additive migration introduces the grouping entity and nullable task membership.
Existing task/Today DTOs remain compatible with old caches. Session recurrence is
blocked while attached to a plan so a finite preparation step has one completion.
Plan creation is explicit and atomic; canceling the preview creates nothing.
Native touch/keyboard acceptance remains a separate device gate.
