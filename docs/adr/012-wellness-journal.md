# ADR 012 — Reviewed wellness journal edits

Status: Accepted.

Date: 2026-10-12

## Context

ToR section 15 calls for optional, non-medical check-ins and basic history.
The existing one-entry-per-account-calendar-day upsert can replace a saved note
without loading it. Cached data and concurrent devices make a blind replacement
unsafe. Students need to review, edit and remove their own entries, with useful
reflection based on actual records.

## Decision

Keep WellnessEntry separate from tasks/goals in the existing PostgreSQL API.
Add a positive integer `revision`, initially 1, to this table. A dedicated journal
DTO includes entry identity/revision; base wellness reads and account exports
keep their existing public student-data shape. No new service, dependency or
offline write queue is introduced.

Journal GET returns a complete, bounded inclusive calendar-date range (at most
31 days), account/zone identity and capture time. Mobile uses a distinct validated
account/range/zone cache namespace. Missing cache is unavailable; saved empty
coverage is known absence at capture time, rather than a claim about current
server state. Day bounds and today's date use existing shared IANA/date rules.

PUT creates only with reviewed absence (`expected: null`), or updates only the
reviewed entry ID/revision. DELETE also requires the reviewed ID/revision.
Atomic conditional writes increment revision. User-first locking prevents an
in-flight write recreating data after account erasure. Stale or concurrently
created/deleted entries return a generic 409 without replacing content.
Entry identity also prevents delete/recreate from matching an old revision.

The legacy POST remains available for creation only; attempting to replace an
existing day returns 409 and asks the client to use the journal. This deliberate
compatibility restriction prevents older blind-write clients bypassing reviewed
edits. Ship the API with the matching native client; older clients can still read
and create missing days, but must update to edit. No existing notes are migrated
or rewritten. Journal saves reject future account-local dates and empty entries;
deletion can remove an existing legacy entry even if its date is in the future.

The native editor starts from a reviewed saved entry or known absence, never a
fabricated neutral rating. Failed/uncertain responses retain the exact draft and
expected version. A successful server refresh can reconcile identical fields or
offer explicit review of the latest entry; it must not silently rebase a draft.
Account/token changes discard private UI state; pending writes block dismissal.

Reflection displays seven/thirty-day recorded coverage and separate sample
counts for mood, energy and stress. Missing metrics/days contribute no score.
No medical interpretation, causal claim or gamified streak is added. Labels,
wrapping touch controls and existing native tokens govern the interface. Notes
remain account-private and are absent from URLs/logs. Server export and whole
account erasure continue covering all entries.

## Verification

Trace behavior in `docs/requirements/wellness-journal.md`. Required checks include
real PostgreSQL concurrent create/edit/delete, ownership and erasure races,
legacy compatibility, contract/date bounds, honest sparse reflection, failed
drafts, reconciliation, offline reads, account changes and pending controls.
Root checks, actual API/restore, native/web artifacts and reviewed exact-head CI
precede merge. Device and production-host acceptance remain separate gates.
