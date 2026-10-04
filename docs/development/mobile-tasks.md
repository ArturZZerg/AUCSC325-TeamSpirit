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
Date-only deadlines remain calendar dates. Existing timed deadlines are preserved
exactly unless the user explicitly chooses a date-only replacement or removal.
Schedule, recurrence, reminder, estimated duration, and completion fields are
omitted from this editor's update so their existing values are preserved. A
recurring task cannot lose its only schedule anchor. Time selection, recurrence
configuration, reminder editing, and task search/filter remain follow-up work.

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

Expose timed deadlines, scheduled dates/times, and daily/weekly recurrence in the
editor using account-timezone conversion and explicit DST validation. Preserve
existing instants exactly unless the user chooses to replace them.
