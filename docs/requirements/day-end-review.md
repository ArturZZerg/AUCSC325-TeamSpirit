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

## Android fixture acceptance, 2026-10-14

Unchanged app source `72a13956b49c5af110cb6e78f5939fc339c0e481` also builds a
locally signed x86 preview, SHA-256
`1B787526277A32BF14C4F923DB6667BE9E3DE5C6CCD347AABD5E786283BCF545`.
Its actual v2 signature, x86_64 inventory, 25-permission policy, feature/API
presence and exclusion of eleven known QA credential values pass. The separate
ARM phone artifact is unchanged; no physical phone is used.

Only the marked project-owned API 36 AVD and isolated ADB port 5039 are used.
Ordinary native sign-in and Today's review action reach the new workspace.
Current task detail prefills October 15 as the schedule and retains October 14
as the deadline. Cancellation issues no PATCH; one explicit native Save issues
exactly one. An independent fixture GET confirms both dates, and the native
acknowledgment is visible beside the next-step controls.

With only the fixture API reverse removed, a force-stop and ordinary cold launch
restore the native encrypted session and SQLite-backed review reads. Recorded
progress and the 25-minute block remain visible with saved-data notices. The
offline editor requires fresh detail and offers Reload/Cancel without Save;
no extra PATCH occurs. At 320 logical pixels and actual Android font scale 1.5,
the review viewport and observed Back/planning controls fit system bars. The
layout is entered through Today after configuration changes, not accepted as an
incoming-link restoration test. Screenshots are inspected, original display
settings are restored, and the owned emulator/browser/fixture processes stop
with AVD data retained.

This establishes native UI/cache behavior using synthetic responses. It does
not establish PostgreSQL persistence, real account authentication, physical
hardware behavior or production readiness. Both standard PR/push checks pass
all 2,157 tests on the app source above. The feature's iOS run fails a public
Help-visible assertion before this private workspace is exercised. Final current
iOS acceptance, review, matched-head merge and post-main checks remain required.

## Integrated iOS API acceptance gate

The final feature is stacked on recovery PR #84 and its accepted storage parent.
All 1,140 integrated mobile tests and 33 iOS tooling cases pass, along with lint,
strict mobile types and thirteen native YAML documents.

The disposable macOS gate now creates a second owned task with both schedule and
deadline set to the current UTC account day through the ordinary API, plus one
25-minute saved focus record through the real focus endpoint. It retains the
original native Today-captured task and all original cold/cache/logout assertions.
The native review must display that saved study block, load the current review
task, cancel, and later explicitly save its default tomorrow schedule. Independent
contract-validated API reads require cancellation to leave both task records
unchanged, and save to change only the review task's schedule/version while keeping
its deadline and the original task intact. Duplicate, missing or extra tasks fail.
SQL verifies owned task/focus persistence and retention through logout.

Only the synthetic disposable account is used. Private screenshots, selectors,
variables and logs remain on the runner; published timelines contain only fixed
action/status/timing fields. The final source-bound proof must include these new
review results and the four original storage checks with successful cleanup.
Fresh actual native success is still required; local test passes do not establish
the integrated iOS behavior. The API-created focus fixture does not test a native
timer or establish production/hardware acceptance.
