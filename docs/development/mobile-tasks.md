# Mobile personal-task editing

This slice implements the basic create/edit/delete/complete experience from ToR
section 7. It does not require a Canvas connection or course.

The Tasks screen mounts a new editor for each opening. Cancelling discards the
draft; editing another task loads that task's current values. Category and
priority use the shared contract options. Titles and calendar dates are validated
before submission, and failures leave the draft available for retry. Saving
disables inputs and dismissal until the request completes.

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
New-date offline composition and native device acceptance remain follow-up work.
