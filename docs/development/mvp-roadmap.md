# MVP product roadmap

The next development slices prioritize useful student workflows. Common planner
patterns in MyStudyLife informed the choice of a weekly overview and a dedicated
coursework workspace; CampusFlow retains its existing native components, moss/sage
palette and Today-centered product model.

## Midterm prototype status

For the October 26, 2026 AUCSC 325 checkpoint (recorded October 25),
“implemented” means a prototype workflow exists, not physical-device acceptance
or production readiness. The numbered slices retain links to their requirements;
this status summary does not replace those specifications.

| Status | Scope and evidence |
| --- | --- |
| Implemented prototype | Today, personal tasks/steps/recurrence, weekly/month planning, coursework/courses/grades/exams, timetable, preparation plans, focus/history/report/recovery, routines, wellness, campus discovery, onboarding, account/privacy/help and reminder center. |
| Verified by automated checks | Existing behavior tests cover these slices. Merged [#120](https://github.com/ArturZZerg/AUCSC325-TeamSpirit/pull/120) reports 18 task-reminder integration regressions and passing full checks; [#121](https://github.com/ArturZZerg/AUCSC325-TeamSpirit/pull/121) reports 26 PostgreSQL course-reminder regressions and passing full checks. Results apply to the tested PR source, not blanket acceptance of current main. |
| Partial | Canvas syncs with each student's personal access token (ADR 019, 024, 025) and fixtures in development; institutional OAuth is still pending approval; reminders require refresh/native cleanup and further physical acceptance. Account recovery/verified signup code exists, but real email delivery is disabled; the hosted course prototype uses ADR 018 unverified signup. |
| Outstanding / limitations | See the [release backlog and unresolved P2 malformed reminder-suppression cache risk](../ROADMAP.md#aucsc-325-midterm-prototype--october-26-2026), and the scoped [readiness evidence](production-readiness.md). Offline guarantees are cached reads, not general offline writes. |

## Feature slices

1. **Weekly planner:** Monday–Sunday workload overview, per-day agenda, honest
   offline coverage and navigation into Today. Implemented in the planner slice.
2. **Academic workspace:** course filters, search, deadline groups, submission
   states, Main Goal selection and configurable deadline reminders. Use the
   existing authenticated academic/course/reminder APIs; no schema change needed.
   Implemented in the [Coursework slice](mobile-academics.md).
3. **Study focus:** a task-linked timer with pause/resume and breaks is implemented
   in the [Focus workspace](../requirements/focus-workspace.md). Durable history
   is implemented with explicit saving and weekly history under ADR 006.
4. **First-use onboarding:** help a student create their first task, choose a
   routine and understand optional academic connections with clear empty states.
   Implemented in the [guided setup](../requirements/student-onboarding.md), with
   progress derived from saved account data and direct creation through editors.
5. **Routine library:** editable study, everyday-life and wellbeing starters that
   become ordinary account-owned Goals after explicit review and save.
   Implemented in the [routine library](../requirements/routine-library.md), with
   12 ideas, searchable areas and configurable cadence.
6. **Weekly review:** show students meaningful completed work and routine progress
   from existing account records, with honest date coverage and no new gamification.
   Implemented in the [weekly review](../requirements/weekly-review.md), using
   recorded completion times and saved coursework status grouped by deadline.
7. **Class timetable:** student-owned weekly class schedules with term dates,
   rooms, instructors, overlap warnings and cached reading. Implemented in the
   [class timetable](../requirements/class-timetable.md) under ADR 004.
8. **Day capacity:** bring classes into Today/planner and suggest study windows
   around saved timed commitments, without inventing unavailable data. Implemented
   in [daily study planning](../requirements/day-study-windows.md), with editable
   30/60-minute task bookings and minute-level next-class status.
9. **Coursework preparation plans:** break an assignment or exam into editable,
   distributed study sessions and atomically save a retry-safe plan. Implemented
   in [preparation plans](../requirements/preparation-plans.md) under ADR 005.
10. **Preparation progress:** bring linked sessions, remaining estimates and
    catch-up scheduling together with focus and task completion. Implemented in
    [My study plans](../requirements/preparation-progress.md), with search,
    completion, session editing/reminders and reversible archive/restore.
11. **Account recovery:** let students safely recover access to their own data;
   choose and verify a production email delivery provider before enabling it.
12. **Recorded study time:** save finished/early focus blocks, retain retry-safe
    account history and read it offline. Implemented in the Focus history slice.
13. **Study report:** connect recorded time with weekly patterns and task estimates
    so students can choose their next preparation step without invented activity.
    Implemented in the [weekly study report](../requirements/study-report.md).
14. **Focus recovery:** recover unsaved blocks after app termination, excluding
    uncertain closed-app time and preserving exact failed-save requests. Implemented
    in [focus recovery](../requirements/focus-recovery.md) under ADR 007.
15. **Live campus discovery:** verified public Augustana calendars, hourly imports,
    persistent freshness and useful upcoming/saved browsing. Implemented in
    [campus discovery](../requirements/campus-discovery.md) under ADR 008.
16. **Workload inbox:** connect missed sessions, unscheduled tasks and coursework
    to reviewed scheduling, preparation and exact focus/plan actions. Implemented
    in [workload inbox](../requirements/workload-inbox.md), with honest partial
    reads, occurrence boundaries and account-isolated drafts.
17. **Account & privacy:** server-saved data export, usable JSON download/share,
    confirmed account deletion and local cleanup retry. Implemented in
    [account privacy](../requirements/account-privacy.md); ordinary web sign-in
    supports a self-service resource without persistent browser credentials.
    Native acceptance and hosted release evidence remain in the
    [production readiness record](production-readiness.md).
18. **Public email verification:** password-and-code mailbox proof, explicit
    registration capabilities and usable native verification/resend forms.
    Implemented under ADR 010; real provider delivery remains a release gate.
19. **Account access lifecycle:** restored/foreground session validation,
    ordinary sign-in after confirmed rejection, offline preservation and shared
    auth limits independent of SMTP. Implemented in
    [account access](../requirements/account-access-lifecycle.md) under ADR 011.
20. **Wellness journal:** tap-based optional check-ins, reviewed saved-day editing
    and deletion, bounded offline history, note search and sparse 7/30-day
    reflection. Implemented under ADR 012; see
    [journal requirements](../requirements/wellness-journal.md).
21. **Help & data center:** public offline answers, topic/search controls and
    useful workflow/account actions, with explicit preview limitations and
    configurable published privacy/support links. Implemented in
    [Help & data](../requirements/help-and-data.md); approved public pages,
    retention decisions and store declarations remain release gates.
22. **Actionable reminders:** account-owned reminder browsing, quiet-hour-aware
    timing and native taps that open the exact saved item with existing edit/focus
    controls. See [Reminder center](../requirements/reminder-center.md).

23. **Today dashboard:** progress card, icon shortcuts, floating capture and a
    checklist plan with human timing and a collapsible Done group.
24. **Grouped tasks:** Overdue/Today/Tomorrow/Next 7 days/Later/No date buckets,
    segmented completion filter, category chips and expandable task rows.
25. **Habit tracker:** goal-local streaks (skips neutral), a seven-day strip and
    weekly-target progress on each routine card; rules live in the domain package.
26. **Settings:** grouped list with profile card and real reminder switches; all
    tabs draw their own large titles.
27. **Month calendar:** account-zone month grid of task, coursework and saved-event
    dates (repeating tasks expanded), day agenda, open-day and capture actions.
    Built from the authoritative task/coursework/event lists rather than the
    eight-day snapshot window.

28. **Task steps:** checklist steps on one-time tasks, edited per step under a lock
    (ADR 014), shown in task rows, Focus and Today.
29. **Courses and grades:** student-created coloured courses (ADR 015) with weighted
    assessments, targets and "needed on the rest" (ADR 016); guided setup starts
    with courses and Today labels coursework by course.
30. **Exams:** an exam coursework kind, exam revision defaults and an Exams ahead
    countdown on Today.
31. **Grade what-if:** hypothetical scores for ungraded assessments, projected
    against the target and never saved (`whatIfSummary`).
32. **Canvas grades and groups (ADR 024):** assessment groups, Canvas scores and
    groups imported by sync, and weights the student can change and reset.
33. **More Canvas imports (ADR 025):** planner to-dos, private course calendar
    events, and removal of work deleted in Canvas after a full read.
34. **Accessibility:** WCAG AA contrast in both themes, reduce-motion sheets,
    44-point touch targets, and source and contrast audits in the test suite.

Each slice gets a branch, behavior tests, lint/typecheck/build/web export,
responsive visual checks, self-review, hosted CI and a reviewed merge. Native
acceptance remains a separate gate for new interactions. Temporary browser
fixtures and preview entry points never ship in the production application.

Release readiness now includes bounded PostgreSQL schema/migration health,
explicit production configuration, read-only release smoke and a guarded local
snapshot/restore rehearsal. See [release operations](release-operations.md);
CI restores its disposable test database as a required release verification step.

Commercial-release gates include institution-approved live Canvas OAuth and
an authorized integration test, email-backed account recovery and broader
iOS/Android acceptance. Hosting/TLS and campus-feed deployment were recorded
as delivered in the [release backlog](../ROADMAP.md); those prototype deliveries
do not establish production readiness.

## Integrated review of the October MVP stack

The October UI/product slices were combined and merged in PR #100; scoped
acceptance evidence is recorded in the [readiness record](production-readiness.md). The month calendar now reads repeating completion from the existing owned
planning snapshot only inside its declared coverage and for the matching task
revision. Missing, duplicate, future or foreign completion records remain
unavailable, and failed event reads cannot imply an empty day. It remains a
derived view with fixed links to the selected daily plan and existing editor.

Quick-add `next weekday` resolves in the following Monday–Sunday calendar week;
the visible preview remains editable before an explicit save. A disabled input
cannot submit through a retained keyboard action. Morning-overview activation
reconciles the saved preference after notification permission is granted, and
incoming overview dates use the shared calendar-date boundary schema.
