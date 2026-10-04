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

Replace the static breathing-pause label with a working one-minute countdown
that handles cancellation, app resume and completion without background alarms.
