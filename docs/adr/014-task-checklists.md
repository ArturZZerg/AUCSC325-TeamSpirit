# ADR 014 — Task checklist steps

Status: Accepted.

Date: 2026-10-15

## Context

Students break coursework into steps (outline, draft, cite, submit). Personal
tasks had only a free-text description. Task PATCH replaces whole fields, so
storing steps there would let two devices, or a stale editor, overwrite each
other's toggles.

## Decision

Add `checklist` (JSONB, default `[]`) to `PersonalTask`: an ordered array of at
most 30 `{ id, title, done }` steps. It is returned in task DTOs, snapshots and
the account export, and is never accepted by task create/PATCH. Dedicated
endpoints change one step at a time under the existing account/task row locks:

- `POST /tasks/:id/checklist` `{ id, title }` appends; the client-generated UUID
  makes retries idempotent and a reused ID with different text conflicts.
- `PATCH /tasks/:id/checklist/:stepId` `{ title?, done? }`.
- `DELETE /tasks/:id/checklist/:stepId`; deleting a missing step returns the
  current task so a retried delete succeeds.

Steps belong to one-time tasks only: a repeating task's occurrences would share
done flags. Adding steps to a repeating task, or making a task with steps repeat,
is rejected. Completing a task does not change its steps.

A JSON column rather than a table keeps the export/restore shape and snapshot
composition unchanged and fits the small, task-owned list. Mobile adds no
offline write queue; failed changes keep the draft and its ID for retry.

## Consequences

Step-level reminders, reordering and per-occurrence steps are out of scope.
Mobile caches written before this change parse without a checklist and show no
steps until refreshed.
