# ADR 006 — Recorded focus sessions

Status: Accepted

App termination and transient draft policy superseded by [ADR 007](007-focus-device-recovery.md).

Date: 2026-10-10

## Context

The transient focus timer supports preparation tasks but cannot show students
where their study time went. Task estimates and completion are different facts
from measured timer time (ToR 3.2, 4, 7). History needs account ownership and
retry-safe persistence rather than a device-only counter.

## Decision

- Add a separate account-owned `FocusSession` containing UTC start/end instants,
  planned duration, counted focus seconds, completed/interrupted outcome and
  a captured title. An optional PersonalTask link survives deletion as null;
  the recorded title/time remain. Saving never completes a task or coursework.
- PostgreSQL owns saved history. The authenticated API validates duration and
  task ownership, bounds reads to 31 calendar days, and serializes per-account
  save keys with canonical payload hashes. A retry returns the same record;
  changed payloads conflict. New records cannot end over 30 seconds in the future.
- Mobile excludes pauses, caps time at timer expiry, and explicitly saves or
  discards a block. A failed request retains its identical key and frozen payload
  in transient UI state. No persistent offline mutation queue is introduced.
- Completed and interrupted blocks contribute their recorded seconds. Breaks
  never count. Reports group by the account-local end date, including an entire
  midnight-spanning block on the day it ended. Time is self-recorded study time,
  not proof of attention or academic achievement.
- History uses account-, timezone- and window-validated SQLite fallback reads
  with visible freshness. Missing history stays unavailable, never zero activity.
  Logout/new login clears transient private state. Closing the app loses unsaved
  time; saved history survives. Background notification delivery is not promised.

## Consequences

An additive migration adds one table and nullable relationship without changing
the Today model or provider boundaries. Focus remains usable offline; saving
requires a connection. Native lifecycle acceptance remains a release gate.
