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
and a retry button. An offline permission grant may reuse validated saved data;
missing preferences are not replaced with invented defaults. Errors and pending
controls do not claim a preference write succeeded.

## Evidence and remaining gates

`reminders.test.ts`, `device-reminders.test.tsx`, `notification-settings.test.tsx`,
and domain `quiet-hours.test.ts` cover changed times, deletion, preferences,
permissions, quiet-hour/DST boundaries, duplicate prevention, concurrent refresh,
logout during native scheduling, cached settings, errors, retry, and app resume.
Run `npm run check` and the mobile web export.

Real iOS/Android permission and delivery acceptance remains outstanding. This
service reconciles existing API intent; adding date-only/recurring reminder intent,
goal/event reminder persistence, quiet-hour editing, and reliable remote deadline
updates remain separate tasks. No push delivery service is introduced.

## Next task

Add goal creation, editing, deletion, and completion history to Wellness, with
account/goal timezone dates and explicit write failure controls.
