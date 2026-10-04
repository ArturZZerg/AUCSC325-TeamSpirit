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

Forms validate titles, schedules and IANA zones. Failed writes preserve drafts,
show errors and support retry; pending writes disable repeat submission. Deleting
a goal requires confirmation and explains that completion history is removed;
pausing preserves it. Reads refresh through the existing account mutation lifecycle.
Offline writes are not queued.

Check-ins validate integer ratings from 1 to 5, send explicit nullable mood,
energy, stress and note fields, and use the current account day. Notes clear only
after a successful save. Existing server history remains the authoritative record.

## Validation

`goal-form.test.ts`, `goal-editor.test.tsx`, `wellness.test.tsx` and the goal
history cases in `queries.test.tsx` cover schedule/date boundaries, nullable
check-ins, validation, retries, deletion, pending controls and account isolation.
Run the root check and mobile web export. Native device acceptance remains open.

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
API. Mobile goal reminder controls using the goal's timezone are next.
