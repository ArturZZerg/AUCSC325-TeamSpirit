# ADR 015 — Student-created courses and course colours

Status: Accepted. Completes the "manual course groups" deferred by ADR 003.

Date: 2026-10-15

## Context

Courses came only from Canvas, and live Canvas OAuth is not approved. Students
therefore could not group coursework by course at all. Planner apps let students
define their own subjects and colour them.

## Decision

Reuse the existing `Course` table with `source = 'manual'` and
`externalId = id`, and add a nullable `color` (one of eight named palette keys).
New endpoints, each serialized by the account lock:

- `POST /courses` `{ id, name, code?, color? }`: the client-generated ID makes a
  retried create idempotent; a reused ID with different content conflicts. At
  most 40 manual courses per account.
- `PATCH /courses/:id` `{ name?, code?, color?, active? }`: imported courses
  accept only `color`; their name, code and active state follow the integration.
- `DELETE /courses/:id`: manual courses only. Coursework is kept and its course
  is cleared by the existing `onDelete: SetNull` relation. Archiving
  (`active = false`) is offered as the non-destructive alternative.

Canvas synchronization only upserts its own source, so it never touches manual
courses. Manual coursework (ADR 003) may reference any owned course. Course DTOs
expose `source` and `color` as optional fields so older caches still parse; the
account export includes both.

## Consequences

Colours are presentation data, not a theme system. Merging a manual course with a
later Canvas import is out of scope; both can coexist.

## Addendum — tasks linked to courses (2026-10-15)

Personal tasks gain an optional `courseId` with the same ownership rule as manual
coursework and `ON DELETE SET NULL`, so deleting a course keeps its tasks.
