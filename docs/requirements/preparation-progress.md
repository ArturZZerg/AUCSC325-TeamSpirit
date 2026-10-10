# My study plans

Extends preparation planning (ToR 3.2, 4, 7; ADR 005). Students return through
Today, Tasks or Coursework to a searchable Active / Finished / Archived workspace.
Each plan shows current sessions, a completion fraction, estimated minutes left,
the next scheduled step and earlier sessions to revisit. Progress derives from
ordinary task records, including completions made in Today, Tasks or Focus.
Deleted sessions leave the group; an empty group does not claim 100% completion.
Missing estimates stay explicit. Estimates are not measured focus minutes.

The current academic deadline takes precedence over captured planning context,
including a removed deadline. Changed deadlines and deleted academic sources are
labelled without rescheduling tasks or changing submission state. A timed session
is earlier only after its estimated end; flexible sessions are earlier after their
calendar day passes. Interpret dates and midnight in the account timezone.

Expand sessions to complete/undo, focus, edit/move and configure reminders using
the existing owning services. The whole workspace refreshes after successful
mutations and on foreground resume. Failed writes leave existing progress and
drafts in place; pending actions block duplicate writes. No offline writes.

Rename and archive/restore operate on plan metadata only. Archiving keeps tasks
and reminders in the daily plan. It preserves the request key: a stale creation
retry cannot recreate an archived plan. Cached reads are validated and scoped to
the account; loading/error/unavailable/empty/saved states remain distinct. Private
search, expanded rows and editors remount on account/session changes.

Verify contracts, database ownership/archive preservation and retry conflicts,
progress/date rules, query/cache lifecycle, navigation, pending/failure behavior,
responsive UI and a synthetic real-API progress/edit/focus/archive flow. Native
interaction and notifications require a separate authorized device run.
