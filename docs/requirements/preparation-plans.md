# Coursework preparation plans

Extends ToR 3.2, 4 and 7 under ADR 005. From open Coursework, **Build a study plan**
lets a student choose an assignment or revision starter, 3/5/7 sessions, an estimate,
and start/finish dates. A preview distributes sessions over selected weekdays;
each title, date and optional local time is editable before an explicit save.
No time is reserved by opening or regenerating a preview. Flexible days do not
claim availability; dates after the source deadline show a catch-up warning.

The API atomically creates a StudyPlan and its university PersonalTasks. Sessions
have no copied academic deadline or implicit reminders. They participate in Tasks,
Today and the weekly planner immediately. A repeated identical per-account request
key returns the existing plan; a changed request conflicts. Foreign/missing or
finished coursework cannot create a new plan. Deletes preserve preparation tasks.

Failures retain the exact attempted request for safe retry. After an uncertain
save, editing is locked; closing directs the student to check saved tasks before
making another plan. Account/session changes discard private editor state.
Local wall times reject missing/ambiguous DST times. No dependency or offline
write mechanism is added. Cached plan reading remains account scoped.

Evidence: preparation plan contracts, calendar distribution, HTTP/database atomic
creation/isolation/retry tests, editor preview/edit/save/failure tests and Coursework
entry-point tests. Run root checks against PostgreSQL and Expo web export; native
keyboard/touch/screen-reader acceptance needs an updated device run.
