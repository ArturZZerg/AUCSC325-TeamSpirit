# Focus workspace

Product extension of ToR 3.2/7 (personal study tasks) and 4 (the daily workflow).
Reach Focus space from Today, or Focus from an open one-time task in Today/Tasks.
Choose a task or study freely; select 15/25/50 minutes or use a task's estimate
(capped at 90 minutes per block). Pause/resume, explicitly end/reset, take a
five-minute break, or start another block. Completion is a separate API action.

The timer and selected task are transient mobile UI state in Zustand. They
survive navigation and backgrounding within the running app. Explicitly saved
blocks use the account-owned FocusSession entity in [ADR 006](../adr/006-recorded-focus-sessions.md).
An absolute end instant avoids
interval drift: background time counts, paused time does not, and returning
after expiry shows completion once. The UI interval is suspended in background.
App termination discards unsaved time; this is stated on screen. No notification
delivery is promised. Logout, account switch and renewed login clear the timer
and private target immediately; stale-session callbacks cannot configure it.

Task selection uses account-scoped validated task reads. Completed, recurring,
unknown and foreign-account task IDs do not become completion targets. Recurring
occurrences continue to use Today. Existing active sessions take precedence over
new task deep links. Task completion requires an explicit tap, validates the
latest available task, uses the existing authenticated API action, guards rapid
repeat taps and retains retry after failures. No timer transition completes a
task or submits coursework automatically. Free focus works without network data.

Evidence: `focus-timer.test.ts`, `focus-store.test.ts`, `focus.test.tsx` and Today
navigation assertions. Run root checks and Expo export, then verify the phone
layout. Real-device background/process behavior remains a release acceptance gate.

## Recorded time and history

Finished blocks must be saved or explicitly discarded before changing the target
or starting another block/break. Ending early offers save or discard. Saves count
whole elapsed seconds (at least one), exclude pauses and breaks, and cap at actual
expiry even after a late app return. No timer action completes a task.

Failed saves freeze time and keep the identical request payload/key across screen
navigation for retry. Duplicate taps are guarded; controls/dismissal are disabled
while saving. Unsaved data is not a durable offline outbox. Closing the app or
signing out loses it. Task completion remains independently retryable.
If the server definitely rejects a task link because that task was deleted, the
student can explicitly save the captured title/time without the link using a new
save key. Uncertain network responses never offer this replacement request.

My focus history shows one Monday–Sunday window at a time, recorded seconds and
finished/early outcomes. Reads validate account, timezone, exact window, unique
record identities and half-open local end-date membership before caching. Offline
history displays freshness; absent history is unavailable rather than empty.

Evidence: real PostgreSQL `focus-db.spec.ts` (concurrent retries, ownership, input
boundaries, DST, deleted task history), plus `focus-history-query.test.tsx`,
`focus-history.test.tsx` and timer/save interaction tests.
