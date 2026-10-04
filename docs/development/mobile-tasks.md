# Mobile personal-task editing

This slice implements the basic create/edit/delete/complete experience from ToR
section 7. It does not require a Canvas connection or course.

The Tasks screen mounts a new editor for each opening. Cancelling discards the
draft; editing another task loads that task's current values. Category and
priority use the shared contract options. Titles and calendar dates are validated
before submission, and failures leave the draft available for retry. Saving
disables inputs and dismissal until the request completes.
The submission guard starts before asynchronous form validation, so rapid save
taps cannot launch parallel writes. Validation failures and failed saves release
the guard for correction or retry.

An empty description and the No deadline choice send explicit nulls when editing.
Existing timed deadlines and schedules are preserved exactly unless the user
chooses to replace or remove them. The editor supports separate date-only or
timed deadlines and schedules, plus daily and selected-weekday recurrence with
contract-bounded repeat intervals. Scheduled dates anchor recurrence before
deadlines; recurring tasks cannot lose their only anchor. Removing recurrence
allows both date fields to be cleared explicitly.

New timed values use shared domain conversion from the account timezone to UTC.
Date-only values remain calendar dates. Explicit input rejects missing or repeated
DST wall times with a correction message. Existing instants in a repeated hour
can still be retained exactly. Tasks displays instants in the account timezone,
including schedule and repeat details. Unchanged scheduling/recurrence is omitted
from updates; reminder, duration, and completion fields are preserved.

## Explicit timed reminders

Each task offers Set/Edit reminder with account-local date and HH:MM input.
New times must be in the future and identify one UTC instant; missing/repeated
DST times require correction. The request updates only reminder configuration,
and removal sends an explicit null. Keeping an existing instant closes without
rewriting its intent, including fractional-second and repeated-hour values.
Saved date-only configuration requires a chosen delivery time rather than an
invented default. This sets one explicit time, including for recurring templates.

Failed writes preserve drafts and support retry; pending saves block repeat taps
and dismissal. Server refresh supplies the displayed reminder value. Settings
owns notification permission and category/quiet-hour preferences; the root
reminder service owns native reconciliation. Completed one-time tasks retain
configuration for undo while delivery intent stays inactive. No offline writes
or repeating reminder generator is introduced in this slice.

## Personal-task search and filters

Search matches task titles and descriptions without case sensitivity and trims
outer whitespace. Category and open/completed selections combine with search;
Clear filters restores all personal tasks. Completion filters use the same
template-level completion field as the task-list API; recurring occurrence
progress remains on Today. Academic work stays in its own list below.

Filtering reads the complete validated account task list in memory or SQLite,
so controls remain usable offline and never replace the persisted list with a
filtered subset. Missing data is unavailable rather than an invented zero count;
known empty results have an explicit message. Results update after successful
entity mutations. Filter text and selections reset at account boundaries,
including when returning to the previous account.

Deletion requires confirmation and reports failure without hiding the task.
One-time tasks support completion and undo. Recurring occurrences belong to Today
and require their occurrence date; Tasks does not send a template-level completion.

## Main Goal selection

Tasks offers **Make Main Goal today** for open personal tasks (including undated
tasks) and unsubmitted academic work. Recurring tasks must occur on the account's
current local date. Selection calls the owning task POST or academic PATCH
endpoint with that date; the API serializes selection and clears the previous
task/academic choice. **Remove Main Goal** sends an explicit null, including for
an already completed selection. The star reflects refreshed server data, with
no optimistic offline selection. Pending writes disable other controls and block
repeat taps; failed writes preserve the selection and allow retry.

## Automated evidence

| Behavior | Tests |
| --- | --- |
| Valid request shapes, explicit clearing, exact timed-deadline preservation, calendar validation, recurrence anchor protection | `apps/mobile/__tests__/task-form.test.ts` |
| Editor initialization, cancelled drafts, validation, save/retry/pending states, delete confirmation/failure, completion failure | `apps/mobile/__tests__/task-editor.test.tsx` |
| Timed scheduling, recurrence creation/edit/removal, interval/weekdays/anchor validation, preservation, account-zone display, failed drafts | `apps/mobile/__tests__/task-scheduling.test.tsx` |
| Explicit local-time conversion, midnight/leap dates, DST gaps and overlaps | `packages/domain/__tests__/local-clock.test.ts` |
| Search/category/completion combinations, cache reuse, empty/unavailable results, refreshed data, correct action targets, account reset | `apps/mobile/__tests__/task-filters.test.tsx` |
| Timed reminder UTC input, expired/DST validation, removal, unchanged configuration, pending/retry controls and refreshed display | `apps/mobile/__tests__/task-reminder.test.tsx` |

Run `npm run check` and `npm run build:web -w @campusflow/mobile`. Use the
[Android preview workflow](../requirements/android-preview.md) for real-device
validation. Query/cache refresh behavior and offline startup are covered by the
[cache lifecycle slice](mobile-cache.md); recurring completion/undo and goal
completion/skipping are covered by the [Today actions slice](mobile-today.md).
`main-goal.test.tsx` covers account-date selection, undated and recurring tasks,
academic routing, clearing, replacement, pending controls, and offline retry.
New-date offline composition is covered by the snapshot tests. Native device
acceptance remains outstanding.

## Next task

Prevent assigning a repeat rule to a completed one-time task until completion
has been explicitly undone. Enforce this at both mobile and API boundaries so
converting an already closed task cannot leave every future occurrence completed.
