# Day-end review

Extends the ToR daily planning, personal task, routine and wellness requirements
(3.4, 4, 17, 19) and the existing weekly review and ADR 006 focus history. Today
opens **Review this day** for its displayed account-local date. The protected
leaf workspace connects recorded progress, study time, explicit tomorrow planning
and the existing check-in journal without adding a navigation tab.

## Behavior

- Browse elapsed days, return to Today and open tomorrow's plan. Invalid,
  repeated or future date parameters fall back to the current account day.
  Tomorrow always means the day after the current account day, including when
  reviewing an older day. An unselected day follows local midnight.
- Count personal tasks and routine check-ins by recorded completion instant in
  the account timezone, using the existing weekly review rules. Repeating task
  occurrences remain distinct; skipped routines, deleted records and undone
  completions do not count. A saved plan is separate from recorded progress.
- Show saved focus seconds and finished/early-ended block counts using the
  existing study report's fourteen-day history query/cache window. Pauses and
  breaks are excluded; overnight blocks belong to their account-local end day.
  Reject foreign, malformed, duplicate or uncovered history. Respect capture
  time and the current instant; missing records never become zero minutes.
- Offer unfinished one-off personal tasks included in the selected day's latest
  saved plan. **Plan for tomorrow** loads the exact current task through the
  existing editor before prefilling only its calendar-date schedule. Its freshly
  loaded deadline is retained. Current complete/repeating tasks are not prefilled.
  Existing optimistic freshness and grouped draft-rebase rules remain active.
- Opening, reading and cancellation do not mutate records. Only explicit Save
  uses the existing task PATCH. Failed saves retain the draft and explain that
  the outcome could not be confirmed. Acknowledged saves show feedback beside
  the next-step controls; a preserved deadline may keep the task in the old plan.
- Show progress and study capture times independently. Valid cached sections
  remain readable after a failed refresh. Missing coverage shows unavailable
  states, not an empty-success claim. Refresh retries both sources; resuming
  refreshes study history alongside the existing snapshot lifecycle.
- Reset private editing on account, credentials or timezone changes. Do not
  show a late save acknowledgment in a new owner/credential scope. Hide the
  underlying workspace from accessibility while the editor is open.

## Boundaries and verification

No new API, database table, persisted review, offline write queue, notification
or inferred academic achievement is introduced. The existing daily projection,
account-scoped snapshot/cache, focus history, task editor and wellness journal
retain their ownership. PostgreSQL remains authoritative.

Behavioral evidence: `day-review.test.ts`, `day-review-screen.test.tsx`,
`task-edit-freshness.test.tsx` and `today.test.tsx`. Cover actual completion versus
deadline dates, repeating occurrences, skips, capture cutoffs, account isolation,
missing coverage, impossible durations, overnight/DST boundaries, midnight,
fresh-task scheduling, explicit save/cancel, failed drafts and late acknowledgments.

Local checks on 2026-10-14: all 1,128 mobile tests pass, root lint/boundary/schema
checks and strict mobile TypeScript pass, and a fresh Expo web export succeeds.
An isolated loopback browser fixture exercises ordinary sign-in and the connected
review, history, journal and tomorrow actions. One observed PATCH changes the
schedule from October 14 to October 15 while retaining the October 14 deadline;
the success notice is visible at the restored scroll position. Cancellation
issues zero PATCH requests. Screens and controls fit 320 and 1280 pixels and
150% CSS zoom without horizontal overflow. The fixture journal endpoint is not
implemented; its navigation is verified, while journal loading remains covered
by the existing journal tests. Browser CSS zoom is not native dynamic type.

Native build/interaction acceptance, exact-head CI, review and merge remain
separate gates. This browser fixture does not establish real API persistence,
device cache/lifecycle behavior, notification delivery or production readiness.
