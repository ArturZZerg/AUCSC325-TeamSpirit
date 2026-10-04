# Mobile Today actions

This slice supports ToR sections 3.4, 4, 5, and 7: routine occurrence states,
daily-plan interaction, and personal-task completion.

Today sends completion changes to the owning task or goal endpoint. A recurring
task sends the read model's occurrenceKey for both completion and undo; a
one-time task omits it. Goal completion and skipping also use the supplied
occurrenceKey, which can differ from the displayed date because the goal has
its own timezone. A goal missing its occurrence date asks the user to refresh
instead of submitting an invented date.

Controls respect the read model's allowedActions. Personal tasks offer completion
or undo; active goals offer completion and skipping when permitted. Completed
and skipped goals, academic submission states, and events have no completion
control. Goal undo is not exposed by the current API.

While a write and its query invalidation are pending, action buttons are disabled
and the selected button shows Saving. An immediate guard also rejects repeated
taps before React rerenders. Failures appear on the affected card, preserve the
displayed server state, and allow retry. Today does not optimistically claim an
offline write succeeded. The existing account-scoped mutation hook refreshes
queries after successful writes; the refreshed plan determines the displayed
state. Pull to refresh retries reads, including when cached items are shown.

## Automated evidence

`apps/mobile/__tests__/today.test.tsx` covers one-time and recurring completion
and undo, timezone-specific goal completion/skipping, missing goal occurrence
dates, permitted controls, failed writes/retries, repeat taps, server-state
rendering, and refreshing cached data after a read failure.

Run `npm run check` and `npm run build:web -w @campusflow/mobile`. Native
interaction still needs the [Android preview acceptance](../requirements/android-preview.md)
and iOS validation.

Local verification on 2026-10-03: all 13 Today cases passed; `npm run check`
passed with 201 tests passing and 39 database-dependent tests skipped because
no test database was configured. The mobile web export also passed. Native
device validation has not been performed for this slice.

## Next task

Make Today follow the account's calendar day, including local midnight and app
resume. New offline dates still need snapshot-based composition. Snooze controls,
Main Goal selection, goal history/editing, and notification reconciliation remain
separate follow-up work.
