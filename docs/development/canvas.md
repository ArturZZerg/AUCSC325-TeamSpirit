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
before reading the connection or invoking the provider. Upserts and successful
freshness metadata commit in one transaction. Retries preserve internal UUIDs,
Main Goal selections and related history. Fixture rows use `source=canvas:fixture`
so they cannot overwrite institutional `canvas` records. Account ownership is part
of every external identity. No schema migration is needed.

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
