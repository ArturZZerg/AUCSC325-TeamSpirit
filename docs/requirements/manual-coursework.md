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
- Show saved success only after the API confirms the write; failed saves retain
  the draft. Guard repeated taps and dismissal during a save. Ask before deletion.
  Session changes discard private drafts. Previously cached reads remain useful.
- Manual entries flow into Today and snapshots through the existing read model.
  Canvas synchronization must leave their source and user-entered state intact.

Evidence: contract boundaries, API HTTP validation and PostgreSQL lifecycle
tests, date/form and editor tests, coursework-screen tests, and phone-width UI QA.
