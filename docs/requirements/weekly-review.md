# Student weekly review

Extends the ToR daily-planning, personal-task and routine requirements (3.4, 4,
17, 19) with a Monday–Sunday reflection on recorded student work. Today and the
weekly planner open **Review your week**. Students can browse previous weeks,
return to this week, open a covered day in Today, and act through existing Tasks,
Wellness, Coursework and planner workspaces.

The review uses one validated account snapshot through the existing query/cache
boundary. It creates no persisted review, completion, reminder or score.

- Personal tasks are counted by their actual completion instant in the account
  timezone. One-time tasks and distinct repeating occurrences remain separate;
  each saved occurrence counts once. Due dates never imply completion dates.
- Completed routine check-ins use their completion instants in the account zone.
  Skipped rows, missing completion timestamps and orphaned history are excluded.
  Paused routines retain recorded activity. Current cadence is informational;
  there is no reconstructed historical schedule, adherence percentage or streak.
- Coursework is grouped by account-local deadline on available elapsed days.
  Its current saved state distinguishes manual Done, Submitted, Graded, Open,
  Missing and unknown. No submission timestamp exists, so this section never
  claims a submission happened during the reviewed week. Fixture coursework is
  excluded explicitly. External-source freshness remains visible.

Counts include only dates inside advertised snapshot coverage, through the
earlier of capture time and the current instant. Future days are marked Ahead;
unloaded or stale days stay unknown. With no covered elapsed dates, totals and
empty-success claims are withheld. A failed refresh keeps validated saved reads
visible; retry, pull-to-refresh and the existing foreground refresh are available.
Session changes discard selected weeks and expanded private lists. No write is
offered through the derived review. Deleted and undone records no longer count.

Evidence: `weekly-review.test.ts`, `review.test.tsx`, Today/planner navigation
regressions. Verify account isolation, partial/stale coverage, actual completion
versus occurrence/deadline dates, duplicate prevention, skips, DST/local-midnight
boundaries, academic source/status semantics, week navigation and responsive UI.
Native interaction acceptance remains a separate gate.

Local verification on 2026-10-07: full root checks passed with all 348 API tests
against isolated PostgreSQL, 588 mobile tests, 50 contract tests, 139 domain tests
and three Android build-script tests. Final navigation/coverage/session tests and
TypeScript also passed. Browser QA against saved local API records showed two
task completions, one completed routine (a skipped routine was excluded), and
manual Done/Open coursework; future deadlines were excluded from elapsed-day
totals. Earlier-week navigation returned an honest empty review. Responsive
checks covered 320, 390 and 1100 pixels. The existing web device-reminder limitation
was visible; no authorized ADB device was available for native interaction QA.
