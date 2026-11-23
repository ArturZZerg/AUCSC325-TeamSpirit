# Recurring-task regression review — 2026-11-22

Scope: merged PRs #155, #157, #158, #161 and #167; reviewed on main
`422a604`. Requirements: ToR 4/7; architecture overview's derived Today model,
separate schedule/deadline, local-calendar recurrence and midnight rules.

Existing coverage already checks weekday/acronym context, midnight as 23:59 in
Quick Add, repeat phrases and invalid intervals, recurring request creation,
Monday-based biweekly scheduling, separate deadlines, occurrence completion and
duplicate prevention. Task-form/scheduling tests also cover anchor validation,
UTC conversion and unchanged edits. The following combinations were uncovered;
no existing assertions or production code changed.

| Added case | Expected result | Actual result |
| --- | --- | --- |
| `Study for SAT every other week fri due midnight`, entered October 14 in Edmonton | Preserve `Study for SAT`; Friday biweekly recurrence; deadline October 16 at 23:59 (`2026-10-17T05:59:00Z`); no schedule invented | Matches; passes |
| Monday/Sunday biweekly recurrence anchored Sunday December 27, 2026 | No pre-anchor occurrence; December 27 included; December 28 and January 3 excluded; January 4 and 10 included in the next active Monday–Sunday week | Matches; passes |
| Saturday 09:00 task with Sunday 00:00 deadline, repeated across New York spring DST | Next schedule March 14 at 13:00Z; deadline March 15 at 04:00Z; same March 14 occurrence visible on both days, overdue just after midnight, absent from Coming up on its deadline day | Matches; passes |

Validation (focused only):

```sh
npm run build:shared
npm run test -w @campusflow/domain -- --runInBand --runTestsByPath __tests__/planning.test.ts __tests__/recurring-deadline.test.ts
npm run test -w @campusflow/mobile -- --runTestsByPath __tests__/quick-add.test.ts __tests__/quick-add-functional.test.ts __tests__/quick-add-bar.test.tsx __tests__/task-form.test.ts __tests__/task-scheduling.test.tsx
npx eslint apps/mobile/__tests__/quick-add.test.ts packages/domain/__tests__/planning.test.ts packages/domain/__tests__/recurring-deadline.test.ts
npm run typecheck -w @campusflow/domain
npm run typecheck -w @campusflow/mobile
git diff --check
```

Results: domain 36/36, mobile 64/64; shared build, targeted ESLint and both
workspace typechecks pass. Domain tests are typechecked by ts-jest (the domain
build/typecheck includes source only). No full suites or native/API flows run.

Confirmed defects: none. The first mobile run exposed an incorrect new test
assumption that create requests explicitly send `scheduled: null`; existing
`taskFormRequest` intentionally omits an absent schedule. The new assertion now
checks that omission. No product fix is proposed.

Decision: tests and this report only; no dependencies or architecture changes.
Next step: review the PR and its CI results before merging.
