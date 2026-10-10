# Classes and study windows in daily planning

This connects the [class timetable](class-timetable.md) to the ToR's daily plan
and task scheduling (sections 4 and 7), following ADR 004. Students can see
their next room and create an editable study block without copying times by hand.

## Behavior

- Today shows a compact next/in-progress class and a study-time action. The
  weekly planner shows the selected day's complete class agenda and study windows.
  Classes keep their own identity and never receive task completion actions.
- Suggest 30- or 60-minute blocks inside 08:00–20:00 in the account timezone.
  Subtract class intervals, incomplete scheduled tasks with estimated durations,
  and explicitly planned saved events. Deadlines alone, unscheduled tasks,
  completed tasks and unsaved campus suggestions do not reserve time.
- Merge overlapping busy intervals, leave ten minutes around commitments and
  round suggested starts forward to a quarter hour. Exclude elapsed/past time.
  All-day planned events reserve the whole day. Recurring task times and recorded
  occurrence completions follow the existing shared domain rules.
- Require validated account/timezone snapshot coverage and a loaded timetable.
  Missing or malformed data does not become an empty/free day. DST class warnings,
  timed tasks without estimates (including possible previous-day spillover) and
  planned events without end times on their start day withhold suggestions.
  Label saved/stale timetable and plan data and offer refresh.
- A suggestion is based on saved commitments, not a guarantee of availability.
  Unrecorded activities and external-source changes can still take time. Only the
  earliest three windows are shown, with that limit stated.
- Choosing a window opens the existing task editor with university category,
  scheduled local date/time and estimated minutes. The student reviews/edits and
  explicitly saves an ordinary PersonalTask. Cancel creates nothing; offline
  failures retain the draft. Existing mutation invalidation refreshes all plans.
- Update next/in-progress class and remaining windows at minute boundaries while
  active. Suspend in background; reconcile on resume. A selected future day starts
  minute updates when it becomes today. Historical dates do not keep a timer.

## Verification

Domain interval tests cover buffers, overlap merging, duration thresholds,
clipping, elapsed time and both historical DST transitions. Mobile mapping tests
cover coverage/account boundaries, task recurrence/completion, crossing-day
durations, saved/all-day/undated events, missing durations and task draft mapping.
Component and booking tests verify next-class status, duration choices, compact
Today, refresh, navigation, explicit save/cancel and failed draft preservation.
Clock tests cover minute boundaries, background/resume, midnight and cleanup.
Existing Today/planner action/timing suites remain isolated regression tests.

Run repository checks with PostgreSQL and mobile web export, plus responsive
browser QA and a real API booking. Native acceptance remains a separate gate.
Custom study hours, automatic scheduling and external calendar import are deferred.
