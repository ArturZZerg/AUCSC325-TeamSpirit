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
