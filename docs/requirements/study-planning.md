# Coursework study planning

Extends ToR 3.2 and 7 (personal study tasks), 4 (daily plan), and 9 (read-only
academic data). From Coursework, **Plan study time** opens a guided planner:
choose a preparation step, edit the title and notes, reserve 25/50/90 minutes,
and select a calendar date with an optional account-local start time.

The planner creates an ordinary `university` PersonalTask through `POST /tasks`.
It has a schedule and estimate, with no duplicate academic deadline. The notes
capture the coursework title, course and deadline at the time of planning;
this is context, not a synchronized relationship. Subsequent Canvas updates
remain visible on the academic record. Study-task completion never changes
submission state. Tasks, Today, weekly planning, cache and reminder editing
reuse the established task behavior without new storage or dependencies.

The date chips use calendar arithmetic across DST. Explicit times reject missing
and ambiguous local times. A day after the deadline shows a warning without
preventing deliberate catch-up work. Failed writes retain the draft and expose
retry; pending writes block editing, duplicate taps and dismissal. Account/session
changes dismiss private drafts. Submitted/graded work has no planning action.

Automated evidence: `study-plan.test.ts`, `study-plan-editor.test.tsx`, and
`academics.test.tsx`. Run root checks and Expo web export. Native keyboard,
screen-reader and touch behavior require an updated device build.
