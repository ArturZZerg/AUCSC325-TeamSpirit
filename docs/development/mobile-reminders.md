# Mobile reminder reconciliation

This slice supports ToR 13 and account isolation in ToR 19. The API owns reminder
intent. A mobile service compares that intent with Expo's scheduled notifications;
screens call the service without calculating fire times.

Stable identities contain the account and reminder ID. Each notification retains
its effective UTC fire time, so a changed time replaces the existing schedule.
Deletion, expiry, category disablement, and denied device permission cancel owned
notifications. Unrelated device notifications remain untouched. Legacy identities
are replaced once, and duplicate stable identities are removed.

The service serializes reconciliation and logout cleanup. It checks current
session ownership after device reads and before changes; logout invalidates queued
work and waits for an already-started native schedule before cancelling its result.
Failures leave the queue recoverable and expose account-scoped retry status.

Academic, personal, goal, and event category preferences are applied separately.
Shared domain rules delay an intent inside account-local quiet hours to their end,
without changing the source intent or deadline. The interval includes its start
and excludes its end; missing or equal bounds disable quiet hours. DST gaps move
the end forward; repeated hours choose an end that never precedes the intent.
A delayed notification is retained until its effective delivery time passes.

The root synchronizer uses validated cached reminder/preference reads, refreshes
both on app resume, and reruns reconciliation after changed reads or successful
mutations. Settings offers all four category toggles, explicit device permission,
and a retry button. Quiet-hour editing displays the account timezone, accepts
same-day and overnight intervals in 24-hour HH:MM format, and requires both bounds
or neither. Equal bounds are rejected by the editor to avoid ambiguous intent;
previously saved equal bounds still mean disabled. Disable clears both fields in
the draft; Save submits explicit nulls without changing category preferences.
Validation and failed writes retain input; pending writes block repeat saves and
dismissal. Successful saves refresh the existing preference/reminder lifecycle.
An offline permission grant may reuse validated saved data;
missing preferences are not replaced with invented defaults. Errors and pending
controls do not claim a preference write succeeded.

## Evidence and remaining gates

One-time task completion removes API delivery intent in the same transaction as
the state change, while retaining the task's reminder configuration. Undo restores
the latest configuration once; repeated undo preserves the reminder ID. Updates
to completed tasks keep configuration inactive. Recurring occurrence completion
does not cancel a separate future template intent. PostgreSQL core tests cover
completion/undo, retries, isolation and rollback on reminder failure. Mobile
mutation invalidation then removes or restores the native schedule through the
existing reconciliation service.

Goal creation and explicit reminder changes now persist delivery intent in the
same transaction as configuration. Ordinary edits preserve its identity. Pause
removes intent and retains configuration; paused edits remain inactive and resume
restores the latest configuration once. Repeated pause preserves the original
pause time and cleans legacy intent; repeated resume preserves the active intent
ID. Goal writes share a row lock with occurrence completion, and goal deletion
cascades reminder removal through the existing foreign key. PostgreSQL
`goal-reminders.spec.ts` covers lifecycle, concurrency, isolation and rollback.
Completing one occurrence preserves a separately chosen future reminder time.

`reminders.test.ts`, `device-reminders.test.tsx`, `notification-settings.test.tsx`,
`quiet-hours-form.test.ts`, `quiet-hours-editor.test.tsx`, and domain
`quiet-hours.test.ts` cover changed times, deletion, preferences,
permissions, quiet-hour/DST boundaries, duplicate prevention, concurrent refresh,
logout during native scheduling, cached settings, errors, retry, and app resume.
Run `npm run check` and the mobile web export.

Real iOS/Android permission and delivery acceptance remains outstanding. This
service reconciles existing API intent; adding date-only/recurring reminder intent,
event reminder persistence, and reliable remote deadline
updates remain separate tasks. No push delivery service is introduced.

## Next task

Goal creation, editing, deletion, and completion history are implemented in
[mobile-wellness.md](mobile-wellness.md). Reminder-specific follow-up work remains
listed in the acceptance gates above. Task-editor repeat submission is guarded
before asynchronous validation; timed scheduling and recurrence editing are
implemented along with task search/filter and explicit timed reminder controls.
Completed-task conversion now requires explicit undo. Explicit goal reminder
intent supports pause/resume and atomic edits. Mobile goal reminder controls use
the goal's timezone and preserve its schedule/history. Persist saved-event intent,
including replacement and unsave cleanup, next.
