# Malformed reminder-suppression cache regression

AUCSC 325 software-testing task, October 25, 2026. Separate from the midterm
roadmap update; no roadmap files changed. Covers ToR 13/19 and REMINDER-03/04.

## Failure and fix

The suppression loader parsed the whole ledger with `schema.parse`. Valid JSON
with the wrong shape repeatedly rejected loading, including before a successful
server reminder response could be accepted. Treating it as an empty ledger would
risk reauthorizing obsolete notifications from older cached reminder lists.

The loader now accepts existing valid arrays and a recovery envelope in the same
account-scoped cache row. Schema-invalid values enter conservative recovery:
personal reminders are withheld until an owned, epoch-current server response
provides an allow-list. That list is persisted and continues filtering old cached
IDs after offline relaunch. Acknowledged changes still use the existing per-task
barrier; academic reminders and other accounts remain independent.

## Results

- Regression-first: all three new cases failed against the original source
  (null, wrong top-level object, malformed entry).
- Fixed source: 60 tests passed across `malformed-task-reminder-suppression`,
  `confirmed-task-reminders`, `reminders` and `device-reminders` suites.
- Controlled mutation: temporarily removed the recovery allow-list check from
  `filterTaskReminders`. All three new cases failed because obsolete personal
  intent was returned. Restored the exact pre-mutation file (`cmp` passed), then
  reran the four suites: all 60 passed. No mutation remains.
- `npm run build:shared`, mobile TypeScript check, ESLint on both changed source/
  test files, and `git diff --check` passed. No full test suite was run.
- Local packages required reinstalling from the unchanged lockfile with
  `npm ci --ignore-scripts --no-audit --no-fund`; no dependency changes.

Reproduce the focused checks:

```sh
npm test -w @campusflow/mobile -- --runTestsByPath \
  __tests__/malformed-task-reminder-suppression.test.ts \
  __tests__/confirmed-task-reminders.test.tsx \
  __tests__/reminders.test.ts __tests__/device-reminders.test.tsx
npm run build:shared
npm run typecheck -w @campusflow/mobile
npx eslint apps/mobile/src/services/task-reminder-suppression.ts \
  apps/mobile/__tests__/malformed-task-reminder-suppression.test.ts
```

## Limits and next step

This covers JSON-decodable, schema-invalid suppression data. The generic cache
reader still treats invalid JSON as missing; physical disk corruption recovery
is outside this fix. Storage failures still require retry, and process termination
before durable suppression can lose new knowledge. Corrupt-ledger offline
recovery deliberately withholds personal alarms until refresh; it cannot infer
lost intent. Existing native alarms require successful reconciliation/cancellation.
The tests use controlled cache/Expo boundaries, not physical devices. Older app
versions cannot read the new recovery envelope. Next: targeted native offline
relaunch and failed-refresh acceptance for this recovery path.
