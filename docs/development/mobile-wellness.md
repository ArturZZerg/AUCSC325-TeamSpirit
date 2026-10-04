# Goal management and check-ins

This slice implements goal management in ToR 12 and lightweight check-ins in
ToR 15. Wellness creates and edits daily, selected-weekday, and weekly-target
goals through the existing authenticated entity APIs. New goals default to the
account timezone; existing goals keep their own timezone. Editing omits reminder,
pause, snooze, and completion fields, preserving those values on the server.

Completion and skip actions use the current day in the goal timezone. Paused,
off-day, and already recorded occurrences do not offer a new completion. Weekly
targets can be recorded on any day. Account-scoped, validated completion history
is readable from SQLite when the network fails. Missing history is unavailable,
not an invented empty result. History from another goal fails validation.

Weekly targets show completed occurrence dates in the goal's Monday–Sunday
calendar week through its current local date. Skips, future dates, other goals
and duplicate dates do not increase progress. A known empty history shows zero;
missing history shows unavailable. Cached history remains usable when refresh
fails, and the existing goal-local midnight/resume clock resets the displayed
week. Pausing retains progress, and reaching the target allows extra completions.
This is a read projection; weekly targets do not acquire mandatory daily Today
occurrences or a new persisted counter. Editing a target applies to the current
view while preserving occurrence history.

Forms validate titles, schedules and IANA zones. Failed writes preserve drafts,
show errors and support retry; pending writes disable repeat submission. Deleting
a goal requires confirmation and explains that completion history is removed;
pausing preserves it. Reads refresh through the existing account mutation lifecycle.
Offline writes are not queued.

## Explicit goal reminders

Each goal offers Set/Edit reminder through the existing goal API. The editor
uses the goal's own timezone, even when it differs from the account zone, and
sets one chosen future instant. It shares timed-input validation, failure/retry
handling and pending guards with task reminders. Missing/repeated DST times
require correction. Removal sends only `reminder: null`; unchanged instants close
without replacing intent. The goal's schedule, pause state and history are
preserved. Paused goals can edit configuration, with delivery inactive until
resume. Cards show server-refreshed values and paused status. Saved date-only
configuration requires an explicit time. Account quiet hours/category settings
still apply through the existing root device service. Recurring generation is
separate work; this editor does not promise a daily repeating notification.

Check-ins validate integer ratings from 1 to 5, send explicit nullable mood,
energy, stress and note fields, and use the current account day. Notes clear only
after a successful save. Existing server history remains the authoritative record.

## Validation

`goal-form.test.ts`, `goal-editor.test.tsx`, `wellness.test.tsx` and the goal
history cases in `queries.test.tsx` cover schedule/date boundaries, nullable
check-ins, validation, retries, deletion, pending controls and account isolation.
Run the root check and mobile web export. Native device acceptance remains open.
`goal-reminder.test.tsx` covers goal-zone conversion, precision retention,
expired/DST input, removal, paused edits, retry/pending guards and refreshed cards.
Existing task reminder cases verify behavior through the shared form/editor.
`weekly-goal-progress.test.ts` in domain and `weekly-goal-progress.test.tsx` in
mobile cover week/year/leap/DST boundaries, goal-local rollover, exclusions,
cached/unavailable history, paused goals and extra completion after the target.

## Next task

The optional breathing pause now counts down from an end time, so delayed
callbacks or app suspension do not extend the minute. It suspends callbacks in
the background, recalculates on resume, supports cancellation and restart, and
cleans up on unmount. It stays local to the mounted screen and schedules no
alarms. `breathing-pause.test.tsx` covers elapsed time, delayed callbacks,
background/resume, cancellation, restart, repeat starts and cleanup.

Quiet-hour editing is implemented in [notification settings](mobile-reminders.md).
Task-editor submission, timed scheduling and recurrence editing are implemented
in [the task slice](mobile-tasks.md), including search/filter and explicit reminder
controls. Completed-task conversion now requires explicit undo. Persisting
explicit goal reminder intent with pause/resume lifecycle is implemented in the
API. Mobile goal reminder controls using the goal's timezone are implemented.
Saved-event reminder intent now supports replacement and unsave cleanup.
Mobile event reminder controls now use validated account-owned reads.
Task/goal snooze now postpones active explicit intent without reactivating paused
or completed targets. Weekly-target progress now uses validated completion history
and the goal's local week. Next, expose the existing optional task duration field
in the mobile editor with contract-bounded validation, clearing and preservation.
