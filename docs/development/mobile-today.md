# Mobile Today actions

This slice supports ToR sections 3.4, 4, 5, and 7: routine occurrence states,
daily-plan interaction, and personal-task completion.

Today sends completion changes to the owning task or goal endpoint. A recurring
task sends the read model's occurrenceKey for both completion and undo; a
one-time task omits it. Goal completion and skipping also use the supplied
occurrenceKey, which can differ from the displayed date because the goal has
its own timezone. A goal missing its occurrence date asks the user to refresh
instead of submitting an invented date.

Today and Coming up cards display the read model's deadline and scheduled-work
values separately. Timed values use shared account-local formatting; date-only
values stay calendar dates and missing values have no invented timestamp.
Saved-event schedule values are labeled Starts. Recurring tasks use the supplied
occurrence timing without recalculating from a template. Cached timing remains
visible during refresh failure, and changed server deadlines update after refresh.

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

## Account calendar and app resume

Active tasks and goals offer **Snooze 1 hour** on the account's current day when
allowed by the read model. The action sends a UTC instant to the owning snooze
endpoint; goals retain their supplied occurrence key. Historical and future
plans hide this time-relative action. The existing API stores snooze at the task
or goal level; no occurrence-specific snooze persistence is introduced. Source
deadlines and overdue status are preserved. Pending controls, failure messages,
and retry behavior follow the same rules as completion.

With no explicit date parameter, Today uses the signed-in account's IANA timezone.
The query supplies the screen date, request date, and account-scoped cache key
together. The date heading represents that calendar date; timed campus events
display in the account timezone. A selected date stays fixed across midnight and
resume, while its data can still refresh.

The clock hook schedules the next local midnight using shared domain day bounds,
which handle daylight-saving transitions. Background/inactive states suspend that
timer. Returning to active reads the current clock, handles multiple missed days,
and refreshes Today even if the same-day query was still fresh. When resume changes
the date, refreshing joins the new date's request instead of cancelling it or
requesting yesterday again. Changing the account timezone also refreshes the
plan, even when the calendar date stays the same. Unmount removes the timer and
AppState listener.

Rollover uses the newly requested date's cache or composes it from the account's
validated snapshot using shared domain planning rules. The snapshot must match
the account and timezone and cover the requested date, including overdue work and
the seven-day upcoming list. Capture time and source freshness are retained while
temporal states use the current clock. Uncovered dates remain unavailable.

## Automated evidence

`apps/mobile/__tests__/today.test.tsx` covers one-time and recurring completion
and undo, timezone-specific goal completion/skipping, missing goal occurrence
dates, permitted controls, failed writes/retries, repeat taps, server-state
rendering, and refreshing cached data after a read failure.

`apps/mobile/__tests__/today-clock.test.tsx` covers account-date selection, exact
midnight and repeated rollover, both DST transitions, multi-day and same-day
resume, explicit dates, timezone/account changes, cleanup, query/cache date
identity, signed-out resume, and cached/uncached offline days. Screen tests also
cover the account date heading and timed event display.
`today-timing.test.tsx` covers separate deadlines/schedules, date-only/leap dates,
both DST transitions, local midnight, occurrence-specific values, Coming up,
event starts, missing timing, cached failures and refreshed/pending behavior.

DST regressions use historical transitions so fixed expectations remain stable
across runtime timezone database revisions. Scheduling always uses the running
device's timezone data for the current date.

Run `npm run check` and `npm run build:web -w @campusflow/mobile`. Native
interaction still needs the [Android preview acceptance](../requirements/android-preview.md)
and iOS validation.

Local verification on 2026-10-03: all 33 Today cases passed, including 20 new
calendar/lifecycle/display cases; `npm run check` passed with 221 tests passing
and 39 database-dependent tests skipped because
no test database was configured. The mobile web export also passed. Native
device validation has not been performed for this slice.

## Next task

Goal creation, editing, deletion, and history are covered in
[the Wellness slice](mobile-wellness.md). Reminder reconciliation is covered in
[the reminder slice](mobile-reminders.md). Main Goal selection is
available in [Tasks](mobile-tasks.md); Today displays the selected item first.
The [Android midnight report](../requirements/android-native-midnight-2026-10-04.md)
records actual offline background rollover, overdue recalculation and cold
restoration on Pixel 10 Pro XL. Continue the remaining foreground/iOS and
integration gates listed in the linked native reports. Web export and Jest cannot
prove native notification delivery or phone lifecycle behavior.
