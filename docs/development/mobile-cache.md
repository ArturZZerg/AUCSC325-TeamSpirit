# Mobile query and session lifecycle

This reliability slice supports the cached-reading and account-isolation
requirements in ToR sections 10 and 19. PostgreSQL remains authoritative; writes
require a successful CampusFlow API response.

SQLite loads alongside each account-scoped TanStack Query request. Saved data is
a fallback while the server is pending or unavailable. A slow disk read cannot
replace a fresh response or hide a refresh error. Disposable cache failures do
not fail otherwise successful server reads. Cache and server records are checked
against shared response schemas; corrupt JSON or invalid cached shapes are treated
as missing data. No cached data means an unavailable query remains unavailable
rather than becoming a confirmed empty result.

Query requests consume TanStack Query's abort signal. Mutations capture the
session at invocation, cancel older account reads, verify the same session before
submitting, and invalidate only that account after success. A late response from
a previous account cannot refresh or sign out the new account. There is no
optimistic offline save or write outbox.

Sign-out hides the session and clears the shared in-memory query/mutation client
immediately. SecureStore, the account's SQLite rows, and local reminders are
cleared before a later sign-in can finish. Account cache writes are serialized
with clearing so an already-started save cannot recreate cleared rows. Server
logout is best effort with a five-second timeout; local logout does not await
network availability. Offline logout cannot guarantee immediate server token
revocation. Startup validates stored session data and prevents delayed restoration
from replacing a more recent login.

## Evidence and remaining gates

`queries.test.tsx`, `session.test.ts`, and `cache.test.ts` cover cached loading,
offline errors, late disk/server responses, cache failure/corruption, cancellation
before writes, account transitions, stale authorization failures, and logout races.
Run `npm run check` and the mobile web export, plus the
[Android preview acceptance](../requirements/android-preview.md).

Today snapshots are still keyed by their requested date. Recurring-task completion
and undo, goal completion/skipping, and write failure controls are covered by the
[Today actions slice](mobile-today.md). Composing a newly selected offline date
from `/snapshot`, local midnight rollover, snooze controls, notification
preferences/rescheduling, and iOS acceptance remain follow-up work.
