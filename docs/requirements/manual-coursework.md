# Manual coursework

Extends the coursework workspace and ToR daily-plan requirements with academic
deadline entry independent of Canvas approval; ownership is defined in ADR 003.

- Students can add, edit and delete manual coursework, choose assignment, quiz,
  discussion or other coursework, and optionally associate an owned course.
- A deadline may be absent, a calendar date, or an account-local date and time
  converted through the shared domain rules to UTC. Reject invalid dates and
  missing/ambiguous DST times. Preserve an existing exact instant when editing
  unrelated fields, including instants with seconds or during a DST fold.
- Manual coursework can be marked finished or reopened. This records personal
  progress only. It never submits to Canvas or invents a grade.
- Source, external identity, owner and grade cannot be injected. Foreign-owned
  courses and academic items, and imported-item edits/deletion return 404.
- Changes reconcile reminder intent under the same account/item locks as sync.
  Deletion removes reminders, including legacy unlinked target records.
- Archiving/restoring a student-created course reconciles its owned academic
  items in the same transaction, including retries of an explicit activity state.
  Preserve reminder identity and lead configuration; use existing eligibility
  rules for timed deadlines, unfinished state and course activity. `leadMinutes:
  null` is explicit No reminder; `Reminder.enabled` is derived eligibility, not
  a separate user setting. Course changes leave notification categories intact.
- Deleting a student-created course preserves coursework through `ON DELETE SET
  NULL`, then reconciles the affected items against no-course eligibility in that
  transaction. Configured eligible intent may return; disabled configuration,
  finished work and absent/date-only deadlines do not acquire delivery intent.
- Course activity/deletion takes the existing academic account lock before the
  course and academic rows. Concurrent academic edits/reassignment and explicit
  reminder changes serialize; a reconciliation failure rolls back course state,
  relation clearing and reminder writes together.
- Show saved success only after the API confirms the write; failed saves retain
  the draft. Guard repeated taps and dismissal during a save. Ask before deletion.
  Session changes discard private drafts. Previously cached reads remain useful.
- Manual entries flow into Today and snapshots through the existing read model.
  Canvas synchronization must leave their source and user-entered state intact.

Evidence: contract boundaries, API HTTP validation and PostgreSQL lifecycle
tests, date/form and editor tests, coursework-screen tests, and phone-width UI QA.
The additive [iOS coursework gate](ios-simulator-preview.md#native-coursework-editor)
requires actual native no-op/Cancel, exact deadline preservation, explicit
clearing and creation, each followed by independent API readback. Local harness
tests validate its rejection rules; only a complete source-matched simulator run
accepts those native interactions.

`apps/api/test/course-reminders-db.spec.ts` provides PostgreSQL evidence for
course archive/restore/delete, eligibility and opt-out, stable reminder identity,
retry/duplicate prevention, rollback, ownership and both concurrency orders.
Its concurrency cases observe real PostgreSQL lock waits and verify another
account can progress. Local native schedules still learn these backend changes
through successful refresh; physical notification delivery is separate acceptance.
