# Weekly planner

ToR sections 4, 17 and 19 permit a calendar accessed through Today. The **Plan
your week** entry opens a Monday–Sunday planner without adding another bottom tab.
Students can browse weeks, compare daily open-item counts, inspect deadlines and
scheduled work, and open the selected date in Today to act on its occurrences.

One validated `/snapshot?date=<Monday>` read provides a consistent week. The
existing domain Today composer owns inclusion, ordering, recurrence and timezone
rules. No new table, generic mutation endpoint or dependency is introduced.
The summary counts unique occurrence keys, so overdue work carried through the
week counts once; separate recurring occurrences count individually. Finished
and skipped items are explicitly grouped in the summary label. Open deadlines
are counted on their account-local due date.

The account-scoped cached snapshot appears during network failure. Every day
must be inside its advertised coverage; uncovered days display unavailable,
and partial-week counts explicitly include only available days. Snapshot owner,
timezone and schema validation prevent foreign or corrupt cache disclosure.
Refresh failure and source freshness remain visible. Date selection resets on
account/session change, and foreground resume refreshes the snapshot.

Automated verification: `weekly-planner.test.ts`, `planner.test.tsx`, and
`planning-snapshot.test.tsx` cover calendar boundaries, recurring identities,
deduplicated overdue work, local deadlines, partial/corrupt cache, navigation,
refresh and session changes. Run `npm run check` and
`npm run build:web -w @campusflow/mobile`. Browser QA verifies the layout;
new native flows still require device acceptance.

Local verification on 2026-10-07: all 400 mobile tests passed with a 15-second
per-test budget (the default five-second budget timed out an existing reminder
test under local load). Lint/boundaries, TypeScript checks, API/shared builds,
web export and Android build-script tests passed. API tests passed with 124
database-dependent cases skipped locally; hosted CI supplies PostgreSQL and
runs the standard `npm run check`. Browser fixture QA checked navigation and
320px, 390px and 1100px layouts; the page had no horizontal overflow at 320px.
The temporary preview route was removed before export and commit.
