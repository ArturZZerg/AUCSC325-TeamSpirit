# ADR 007 — Device recovery of unsaved focus blocks

Status: Accepted

Date: 2026-10-10

## Context

ADR 006 records history only after an explicit API save. Its transient timer policy
loses active study time and uncertain save requests on app termination. A student
needs to recover useful progress without counting time spent away after termination
or creating duplicate history when an earlier request may already have succeeded.

## Decision

- Keep one versioned, validated focus draft per account in the existing device
  SQLite store. The draft contains captured task context, timer progress, request
  identity and any frozen save payload. It contains no credentials. This is local
  UI recovery state; PostgreSQL remains authoritative for saved FocusSession history.
- Checkpoint semantic changes, every five seconds while running and at app-state
  transitions. Store a paused projection capped at expiry. After a process restart,
  offer explicit resume, save or discard; exclude time after the last checkpoint.
  Breaks and ready/saved blocks do not need durable recovery.
- Persist a frozen request before sending it to the API. Retain its exact payload
  and save key through uncertain responses and restarts. Recovery never submits
  automatically, completes a task, or changes academic submission state. This is
  not an offline mutation outbox; each network attempt requires an explicit tap.
- Initialize recovery at the app root, before enabling new timer work. A failed
  storage read requires retry. Invalid, foreign-account or future checkpoints are
  discarded; a clock rollback during a running block preserves the prior checkpoint.
- Serialize guarded draft writes/deletion with account cache cleanup. Logout,
  account changes and every fresh login purge prior device drafts. A valid stored
  session restored at cold startup can recover its draft. Stale callbacks cannot
  restore or rewrite data after the session changes.

## Consequences

This supersedes ADR 006's app-termination/transient-draft policy. It adds no API
endpoint, database migration or dependency. Checkpoint loss of up to five seconds
is possible during normal running; suspended background intervals may be longer.
Device storage failures are visible. Saved server history and existing idempotency
remain unchanged. Android/iOS process-kill and lifecycle acceptance are separate
release gates; browser/component evidence does not prove native OS behavior.
