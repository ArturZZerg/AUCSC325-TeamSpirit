# Reminder center and native tap workflow

ToR 13 and 19: delivered nudges need a useful next step without exposing private
student titles on a lock screen or following an arbitrary notification URL.

## Requirements

- REMINDER-01: Settings opens an account-protected, system-bar-safe Reminder
  center. Upcoming, earlier and all-saved views use effective reminder instants,
  the account IANA zone and available quiet-hour preferences. Local title/type
  search and incremental display support longer lists. Earlier times never imply
  successful notification delivery; missing preferences remain explicitly unknown.
- REMINDER-02: A selected reminder resolves its subject only from the active
  account's existing validated task, academic, goal or saved-event reads. Show
  its details and reuse the owning editor for reminder changes. Tasks can open
  their existing editor or exact Focus target; completed/recurring tasks withhold
  that Focus action. Navigation alone never starts time or writes data. Missing
  subjects/identities have useful refresh/browse recovery without asserting deletion.
- REMINDER-03: Existing SQLite-backed queries show saved data during failed
  refresh. Unavailable reads are distinct from confirmed empty arrays. Changes
  still require the API; no notification action silently completes, reschedules
  or saves work. Editors and selection state unmount on account/token changes.
  A same-account timezone update closes local-time editors before their input
  could be reinterpreted in the new zone; the selected saved reminder remains usable.
- REMINDER-04: New local schedules retain generic title/body and contain only
  existing account/stable/fire identities plus the reminder UUID. Reconciliation
  upgrades older pending schedules once and still prevents duplicates. There is
  no provider secret, student title, arbitrary URL or native action command.
- REMINDER-05: A root mobile response adapter handles startup and later default
  taps. Verify the CampusFlow marker, UUIDs, matching request/stable identities
  and optional explicit reminder ID. Legacy owned stable IDs remain readable.
  Discard unsupported/custom actions, malformed identities, signed-out taps and
  different accounts. Reject incompatible context as soon as ordinary restoration
  completes, even before navigation mounts; a later matching login must not revive
  that discarded tap. Valid owned context waits for mounted navigation;
  a changed token invalidates a queued response. Consume the native last response
  and deduplicate recent callbacks in bounded memory. Native read failures do not
  prevent startup or future taps. Web registers no native notification listener.
- REMINDER-06: A tap opens only `/reminders` with a validated identity, never a
  payload URL/target. The screen rechecks optional account context and validates
  scalar reminder IDs. Removed/replaced reminders cannot invent a task. Ordinary
  account gating and its account-only sign-in continuation remain unchanged.

## Verification

`reminder-center.test.tsx` exercises all four editors, exact Focus identity,
completed/recurring restrictions, filters/search/refresh, failed and partial reads,
unknown/invalid/cross-owner links, editor isolation and DST/quiet-hour semantics.
`reminder-response.test.tsx` covers cold/warm navigation, late account/token changes,
sign-out, startup/listener duplication, legacy IDs, malformed identities, native
failure and listener cleanup. Existing reconciliation tests cover one-time schedule
upgrade, generic content, category/permission/quiet-hour changes and no duplicates.

Signed native acceptance and exact artifacts are recorded in the
[Android evidence](android-reminder-center-2026-10-12.md). Local
notification schedules cannot learn server changes while offline, Android delivery
can be inexact, and this center is not a delivery log. Physical Android and iOS
acceptance remain release gates.
