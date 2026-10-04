# Campus event ingestion (Task 2)

LIVE CAMPUS EVENT SOURCE: BLOCKED — verified usable feed required.

No verified campus feed or feed configuration was found in the repository.
The deterministic fixtures exercise ingestion; they are not live campus data.
No schema migration is needed. Event UUIDs, the unique
`(source, sourceScope, externalId)` key, SavedEvent and wire DTOs are unchanged.

## Internal entry point

`EventSyncService` is registered in AppModule. An internal caller supplies a
trusted provider, source key and explicit half-open calendar coverage:

```ts
const result = await app.get(EventSyncService).sync(
  { source: 'campus:approved-feed', sourceScope: 'public' },
  new IcsEventProvider(async () => fixtureText, { timeZone: 'America/Edmonton' }),
  { from: '2026-03-01', through: '2026-04-01', timeZone: 'America/Edmonton' },
);
```

Import `EventSyncService` and `IcsEventProvider` from
`apps/api/src/integrations/events/`. This is a service entry point, not a public
URL import endpoint, cron job or automatic startup import. No environment
variables were added. Once a feed is verified, an operator can construct
`httpsCalendarLoader(approvedUrl)` instead of the fixture loader. Never pass an
untrusted client URL or source/scope into this internal entry point. Each stable
`campus:` source key must identify exactly one authoritative feed. Private feeds
use `user:<UUID>`; Canvas keys are not accepted by this service.

The operator must establish that the configured feed is a full snapshot covering
the requested window (not an undocumented paginated/truncated feed). Other
providers implement `EventProvider.fetchEvents(coverage)` with explicit
`complete`, `incomplete` or `failed` results. A complete empty batch is valid;
failures are not empty batches. Normalized records may include known identities
moved outside coverage, so existing records can still be updated.

## Normalization and limits

ICAL.js handles the ICS syntax; API-side Temporal conversion validates dates,
uses IANA zones and rejects ambiguous/nonexistent local times. Floating times
require an explicitly trusted provider timezone; the account/coverage timezone
is never guessed as the source timezone. Custom VTIMEZONE-only identifiers are
unsupported; recognized IANA TZIDs use the runtime IANA timezone rules.

Supported: DATE/DATE-TIME DTSTART and DTEND; UTC and IANA TZID values; all-day
(default one day) and multi-day exclusive ends; missing timed DTEND as a point;
DAILY/WEEKLY RRULE, INTERVAL, COUNT or UNTIL, weekly BYDAY, Monday WKST;
RDATE, EXDATE, detached RECURRENCE-ID overrides and cancellations. Whole-series
cancellation is supported. Recurrence values use original recurrence identity,
not the moved actual start. JSON tuples encode UID alone for single events and
UID plus original date/instant for recurring occurrences. Metadata changes do
not alter identity. A publisher that changes the recurrence identity itself
without RECURRENCE-ID is describing a different recurrence set; inferred matching
by title/location is intentionally avoided.

Unsupported forms (including MONTHLY/YEARLY rules, subdaily frequencies,
BYSETPOS, DURATION, EXRULE, RANGE=THISANDFUTURE, detached exceptions without a
master, conflicting duplicate masters) yield an incomplete batch, never a
best-guess schedule. Duplicate source versions are not arbitrarily selected by
sequence. The feed must publish an unambiguous current snapshot.

Limits: 1 MiB decoded payload, 2,000 VEVENTs/output records, 20,000 total recurrence
day steps, component depth 4, coverage at most 366 days. Hitting a bound invalidates
the whole batch. An ancient unbounded series may exceed the step budget and require
a provider enhancement before that feed is usable. Default load timeout is 5s.
HTTPS transport refuses redirects, credentials in URLs, noncalendar MIME,
unsuccessful statuses, overlarge declared or streamed bodies and invalid UTF-8.
Only operator-approved public HTTPS sources should be configured; it is not a
fetch proxy or a complete DNS/network egress policy.

## Persistence, completeness and user data

Sync acquires a PostgreSQL transaction-scoped advisory lock per source/scope
before fetching, preventing overlapping imports from committing stale fetched
snapshots out of order. Upserts and reconciliation share the transaction. Database
failures roll it back and propagate. Failed/incomplete results make no writes,
including otherwise valid partial events. Results report status, issue codes,
counts and successful coverage. No persistent sync freshness is claimed.

Complete imports update existing UUIDs and all normalized metadata. Newly seen
out-of-window records are not inserted; already known identities moved outside
coverage are updated. Missing records are reconciled only where their persisted
timing overlaps complete coverage. Out-of-window records remain intact.

Missing/cancelled **unsaved** records are deleted. Missing/cancelled **saved**
records retain their Event row and all SavedEvent state, including includedInPlan
and reminder relationships. The result reports `retainedSaved`. Retained rows
remain visible with their last known values; no new cancellation/staleness DTO
is invented. This deliberate preservation policy means a saved disappeared event
can still appear in Today until a later user action/source update. A distinct
archive/status experience would require a future product decision. A row lock
and saved-reference recheck protect concurrent saves against cascade deletion.

CanvasConnection, CanvasController and Canvas sourceStatus are untouched. Campus
sync results are separate from Canvas freshness. Today and snapshot still read
persisted data only. Ingestion does not recalculate relative reminder times.
Explicit saved-event reminder intent is handled by the event API lifecycle
described in [mobile-reminders.md](mobile-reminders.md), including replacement,
unsave cleanup and the existing SavedEvent foreign-key cascade.

## GET /events and frontend coordination

`from` and `through` accept valid YYYY-MM-DD dates or canonical UTC instants.
Dates become account-local midnight. The range is `[from, through)`; either bound
may be omitted; equal/inverted ranges return 400. Invalid dates, arrays/duplicate
parameters and unknown keys return 400. Category remains free text (max 240),
matching external event categories rather than personal-task enums.

Filtering uses actual timing overlap, including spanning/overnight events and
multi-day all-day ranges. Points at the lower bound are included; events ending
at that bound and points starting at the upper bound are excluded. Ordering uses
actual start in the reader's zone, then UUID. Visibility and saved/included flags
are unchanged. No mobile files or response DTOs changed; Pranav should use these
range semantics. Abizer's Canvas work remains isolated.

The current implementation reads visible/category-matching records before pure
domain filtering, avoiding an incorrect sortAt prefilter. Large datasets may
need a measured query/index optimization later; this is not pagination.

Continued development adds account-owned `savedReminder` metadata to GET /events
through `campusEventSchema`. Only the reader's SavedEvent contributes this field;
the normalized Event and snapshot entity contracts remain separate. Mobile now
validates/caches this configuration and offers explicit reminder controls in
[mobile-campus.md](mobile-campus.md). Older cached reads lacking metadata remain
readable with reminder editing unavailable until refresh.

## Verification

Unit fixtures: `apps/api/test/fixtures/campus-calendar.ts` and provider tests.
PostgreSQL/API cases: `apps/api/test/event-ingestion.spec.ts`, alongside all Task 1
suites. Supply DATABASE_URL pointing at a disposable local PostgreSQL database,
apply existing migrations, then run:

```sh
npm run db:generate
npm run build:shared
npm run test -w @campusflow/api
npm run test -w @campusflow/contracts -- --runInBand
npm run test -w @campusflow/domain -- --runInBand
npm run typecheck
npm run lint
npm run build -w @campusflow/api
git diff --check
```

Integration tests are skipped without DATABASE_URL; a skipped run is not evidence
of database correctness. No Docker or live source is necessary for these tests.
