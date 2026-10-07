# Canvas fixture synchronization

Scope: ToR sections 9, 10 and 19. Live institutional Canvas access remains an
external release gate. This implementation enables deterministic academic imports
without changing ADR 001 or the accepted OAuth boundary.

## Connection boundary

Set both `NODE_ENV=development` (or `test`) and `CANVAS_MODE=fixture`.
Authenticated `POST /canvas/dev/connect` establishes an account-specific fixture
connection. Repeating it preserves successful sync timestamps. Production,
unspecified environments and other modes cannot enable fixture writes.

`POST /canvas/connect` and `GET /canvas/connect/start` return 503 until an
institution-approved backend OAuth implementation exists. No public endpoint
accepts Canvas tokens or client-selected Canvas URLs. Legacy nonfixture
connections cannot be overwritten or synchronized by the fixture service.
No HTTP Canvas fetching, pagination, token exchange or refresh is enabled.
No live account was used to validate this feature.

## Provider and persistence

`CanvasProvider` belongs to the API integration module and returns a complete,
normalized academic snapshot. `FixtureCanvasProvider` uses the same validated
mapping boundary. Provider payloads are never public DTOs. Mapping accepts UTC
or offset source instants and canonicalizes them to UTC, retains absent due dates,
and validates calendar dates, resource types and safe numeric IDs. Current-student
submission fields determine completion; assignment-wide submission aggregates do
not mark a student's work submitted. See the official
[assignments](https://developerdocs.instructure.com/services/canvas/resources/assignments)
and [submissions](https://developerdocs.instructure.com/services/canvas/resources/submissions)
field definitions.

The application revalidates the entire normalized batch before entity writes.
Incomplete batches, duplicates, dangling course references and limits (200 courses,
2,000 academic records) reject the import. Provider work has a five-second timeout
with an abort signal; the transaction itself is bounded at 30 seconds.

Connection and sync writes share a PostgreSQL advisory lock per account, acquired
before reading the connection or invoking the provider. Upserts, configured academic reminder reconciliation and successful
freshness metadata commit in one transaction. Retries preserve internal UUIDs,
Main Goal selections and related history. Fixture rows use `source=canvas:fixture`
so they cannot overwrite institutional `canvas` records. Account ownership is part
of every external identity. Academic reminder configuration adds the nullable
`AcademicItem.reminderLeadMinutes` column; existing records default to unconfigured.

Provider failure commits only generic failure/attempt metadata, preserving cached
entities and the last success. Database errors roll back all writes, including
freshness. Raw provider errors or tokens are never stored in public status.
An empty complete import succeeds; absence alone does not delete cached records.
Removal/archive reconciliation needs an explicit source coverage design.

Today and snapshot retain the existing consistent persisted read model, account
coverage and private-event visibility. Neither invokes Canvas.

## Verification and remaining gates

Run `npm run check`. CI runs the PostgreSQL suites with a disposable database and
also exports the mobile web build. Local integration suites are skipped if
`DATABASE_URL` is absent; a skipped suite is not database verification.

- `canvas-provider.spec.ts`: payload validation, identity limits, UTC/date edge
  cases, student submission state and deterministic fixtures without network.
- `canvas-boundaries.spec.ts`: authentication, explicit environment gates,
  rejected token/URL input, sanitized errors and token-free status DTOs.
- `canvas-sync.spec.ts`: PostgreSQL idempotency, changed deadlines, failed-batch
  preservation, transactional rollback, concurrent sync order, account isolation
  and persisted Today/snapshot reads.

Institutional approval, registered developer key/scopes/callback, backend OAuth
state and encrypted token lifecycle, authorized live-account tests, planner/calendar
imports and source coverage/reconciliation remain future integration work. This
fixture implementation does not claim the live Canvas MVP gate is satisfied.

## Explicit academic deadline reminders (ToR 10)

Authenticated `GET /academic-items/:id/reminder` returns
`{ "academicItemId": "<UUID>", "leadMinutes": null }` until configured.
`PUT /academic-items/:id/reminder` accepts exactly `{ "leadMinutes": 1440 }`
for 24 elapsed hours before the deadline, `{ "leadMinutes": 0 }` at the deadline,
or `{ "leadMinutes": null }` to clear. Lead time is a nonnegative integer within
PostgreSQL's signed Int range. Missing fields, fractions, negatives, unknown
fields, and other-account IDs are rejected. The response includes the item UUID
and current leadMinutes. The [mobile Coursework editor](mobile-academics.md)
uses this configuration surface; imports do not enable reminders by default.

The nullable column stores durable **relative intent**, not a delivery time.
`Reminder.fireAt` alone cannot recover that intent after a deadline disappears.
No backfill enables existing items. The existing Reminder table is the delivery
projection, linked through `academicItemId`, with the same UUID retained across
deadline changes and temporary suppression. Configuration and imports acquire
the same User-row `FOR NO KEY UPDATE` lock as Main Goal selection before writing
courses or academics. Canvas takes its existing per-account sync advisory lock
first; User-lock holders never acquire that advisory lock. Main Goal selection,
reminder configuration, and sync therefore serialize before taking subordinate
row locks, including retained items omitted from an import. Different accounts
lock different User rows. This also prevents stale active-course reads even for
newly configured items omitted from the import. Academic-item row locks additionally serialize
reconciliation with academic updates, so repeated or concurrent requests cannot
create multiple null-occurrence reminders. All writers must use this transaction
hook; the existing nullable composite unique key alone is not sufficient.

- Timed deadlines subtract elapsed lead minutes in UTC, including across DST.
- Absent and date-only deadlines produce no invented midnight delivery time.
  An extreme lead that places delivery before the supported four-digit-year
  wire range is also suppressed while configuration is retained.
- Submitted/graded items and explicitly inactive courses suppress delivery.
  `missing`/`unsubmitted` items remain actionable.
- Suppression retains leadMinutes and disables an existing Reminder. If no
  reminder exists yet, no placeholder fire time is stored. Restoring an
  actionable timed deadline re-enables the same row (or creates the first one).
- Explicit clearing deletes delivery intent. A later sync cannot recreate it.
  Explicit database deletion of an AcademicItem cascades its reminder; a later
  re-import is a new, unconfigured item. No new academic deletion endpoint is added.
- Imports never infer deletion from omission, even in accepted complete batches.
  An explicit course active-state change reconciles retained configured items,
  including items omitted from that batch. Provider deletion tombstones remain
  outside the current provider contract; filtered/absent records are not tombstones.

The generic ReminderService hook reads normalized persistence only. It runs after
academic upserts and before successful sync freshness, inside the same transaction.
Any persistence/reconciliation failure rolls back all successful sync writes.
Rejected provider batches preserve previous academics, reminder intent and last
success, while retaining the existing sanitized failure-attempt metadata.
Configuration changes and their reminder projection also commit atomically.

`GET /reminders` and the mobile scheduler contract are unchanged. Enabled intent
is returned with `targetKind=academicItem`, the existing ID and recalculated
`fireAt`. Device reconciliation cancels/reschedules that ID rather than adding a
second notification. Academic category preferences, account-local quiet hours,
permission and expiry remain device policies; disabling a category does not erase
server configuration. Device refresh is required to apply server changes; an
offline device cannot receive immediate cancellation without a push mechanism.

Verification: `academic-reminders.spec.ts` runs against PostgreSQL and covers
configuration, real FK failure rollback, injected reconciliation rollback,
provider rejection, restoration, concurrent writes, isolation, Main Goal and
Today/snapshot parity. Domain tests cover UTC/DST and suppression policy;
contracts tests validate explicit configuration; mobile reminder tests exercise
academic DTO rescheduling, cancellation, category re-enabling and quiet hours.

The PostgreSQL concurrency regression pauses sync after an academic upsert and
observes the competing transaction with `pg_blocking_pids`: Main Goal selection
must wait on the User row before writing either academic item. It covers moves
in both directions, configuration/clearing during a deadline change, retained
omitted items, and another account completing writes while the first is paused.
