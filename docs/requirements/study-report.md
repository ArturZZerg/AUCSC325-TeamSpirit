# Weekly study report

Product extension of ToR 3.2, 4 and 7 and ADR 006. Reach the report from focus
history, weekly review and My study plans without adding a navigation tab.

## Behavior

- Show Monday–Sunday saved focus seconds, block count, study days and daily bars.
  Completed and early-ended blocks both count their recorded seconds. Pauses and
  breaks remain excluded by recording. Include a previous full-week total for
  context; label the current week as in progress rather than claiming growth.
- Group by stable task ID, preserving captured titles if task details are absent.
  Unlinked/free/deleted-task blocks form a clearly labelled unlinked group. Use
  the latest task title/estimate when available, and show cached detail freshness.
- Compare this week's recorded time with the task's total estimate. A capped
  progress bar describes time versus estimate, never completion. Do not subtract
  measured time from estimated remaining work or infer academic achievement.
- Focus an available, open, nonrecurring task directly. Completed and recurring
  tasks remain history, without a misleading focus completion target. Existing
  active timers retain precedence over a new link.
- Use the account-local end date, shared calendar rules across DST and year
  boundaries, and exclude future-ended records. Accumulate seconds before display
  so several subminute blocks still count. Deduplicate stable session identity.

## Coverage and failure

Read a single 14-day history window covering the chosen and preceding weeks.
Mobile verifies account, timezone, complete selected-week coverage, unique IDs
and window membership before deriving a report. Unavailable/malformed history
shows an unavailable state, never zero study time. Valid cached history shows
its capture time and stays usable if the network or task-detail read fails.
Refresh retries both reads. Only explicit saved blocks count.

Evidence: `focus-report.test.ts` in domain and `study-report.test.ts` /
`study-report.test.tsx` in mobile, plus existing history/cache and API tests.
Run root checks, web export, responsive browser QA and native acceptance.

## By course

The report also rolls this week's recorded time up to courses
(`studyTimeByCourse`): a task's own course first, otherwise its study plan's
coursework course. Time on unlinked or course-less tasks, or while lists are
unavailable, is shown as Other rather than guessed. Bars use course colours.

## Explicit estimate comparison — 2026-11-22

The existing per-task report now shows how far the selected week's saved Focus
seconds are below or above the current task estimate, or that they match exactly.
Differences retain seconds; the existing percentage bar stays capped at 100%.
An open task remains labelled open even when recorded time exceeds its estimate.
A task without an estimate retains its actual time with an explicit missing
estimate message. Unavailable task details retain captured titles/time without
claiming an estimate is missing.

This extends the existing report rather than adding another screen or data flow.
It reuses task estimates and the validated Focus history API, summing completed
and interrupted blocks by task ID before comparison. Coursework preparation
tasks are eligible through their existing PersonalTask records; AcademicItems
have no duration estimate or direct Focus link, so no coursework estimate is
invented. The comparison is weekly recorded time versus the current total task
estimate, not lifetime actual duration, remaining work or completion percentage.
No API, database, dependency or architecture changes.

Focused validation:

```sh
npm run test -w @campusflow/mobile -- --runTestsByPath __tests__/study-report.test.ts __tests__/study-report.test.tsx
npm run test -w @campusflow/domain -- --runInBand --runTestsByPath __tests__/focus-report.test.ts
npx eslint apps/mobile/app/study-report.tsx apps/mobile/src/features/study-report.ts apps/mobile/__tests__/study-report.test.ts apps/mobile/__tests__/study-report.test.tsx
npm run typecheck -w @campusflow/mobile
git diff --check
```

Results: 30 mobile tests and 5 domain tests passed; targeted lint, mobile
typecheck and diff checks passed. New unit cases cover zero recorded time,
one-second below/equal/above boundaries, large differences and null/absent
estimates. Screen integration verifies multiple blocks including an early finish
(1,565 seconds versus 30 minutes gives 3m 55s below), exclusion of the previous
week, open over-estimate work, missing estimates, completed work and unavailable
task details. Expected and actual results agree; no confirmed defects.
Native visual/device testing and full suites were not run in this small session.
