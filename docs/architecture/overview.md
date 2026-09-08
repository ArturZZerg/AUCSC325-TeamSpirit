# CampusFlow architecture overview

Status: accepted architecture baseline, 2026-09-08. Implementation has not begun.
Decision record: [ADR 001](../adr/001-initial-architecture.md).
Requirements: [Terms of Reference v0.2](../../ToR.docx), especially sections 4,
7, 9–13, 18–19 and the technology table. Development rules: [AGENTS.md](../../AGENTS.md).

CampusFlow combines academic work, personal tasks, routines, and campus events
into a daily plan. It must remain useful without a working Canvas connection.
This document fixes module ownership and behavior boundaries, not a complete
database schema or API specification.

## Repository and stack

Use one TypeScript monorepo with npm workspaces, one root lockfile, and workspace
scripts for checks. Start with ordinary workspace tooling; no monorepo build
orchestrator is needed. This is the target layout, not a claim that it exists:

```text
apps/
  mobile/                 Expo application for iOS and Android
  api/                    Modular NestJS REST backend
packages/
  contracts/              Public request/response DTOs and Zod schemas
  domain/                 Pure entities, date rules, and daily-plan composition
  config/                 Shared lint/TypeScript configuration, when needed
docs/
  requirements/           Requirement elaboration and test traceability
  architecture/           Current architecture
  adr/                    Decision history
```

Mobile uses React Native, Expo Router, TanStack Query, React Hook Form, Zod,
Expo SQLite, and Expo Notifications. Use Zustand only for local UI state that
needs sharing; do not create a second server-data store in it.

The backend uses Node.js, NestJS, Prisma, and PostgreSQL. Retain the ToR choice
of Supabase-hosted PostgreSQL for eventual hosting; no service is provisioned
in this phase. Mobile accesses data through NestJS, including when PostgreSQL
is hosted by Supabase. Supabase client-side database access and Supabase Auth
are not implied by the database hosting choice.

Retain Jest, React Native Testing Library, Supertest, Maestro, and GitHub Actions
as the planned testing/CI stack. Pin compatible versions during repository
scaffolding, not in this architecture document.

## Boundaries and dependency direction

| Module | Owns | Must not own |
| --- | --- | --- |
| `apps/mobile` | Screens/navigation, forms, REST client, query lifecycle, account-scoped SQLite cache, device permissions and notification scheduling adapter | Canvas HTTP calls/JSON, Prisma, database credentials, Canvas secrets, authoritative access control |
| `apps/api` | Authentication/authorization, application services, Prisma repositories, synchronization, provider adapters, reminder intent | Mobile components or device scheduling APIs |
| `packages/contracts` | Versioned REST shapes, Zod request/response validation, public error shapes | ORM models, credentials, Canvas/ICS payloads, business services |
| `packages/domain` | Framework-independent entities/value types, planning/recurrence/date rules, reminder calculation | HTTP, storage, environment variables, NestJS, Expo, React, provider SDKs |
| `packages/config` | Shared development configuration when there is actual reuse | Runtime business logic or secrets |

Allowed runtime dependencies are `mobile -> contracts`, `mobile -> domain`,
`api -> contracts`, and `api -> domain`. Neither shared runtime package imports
the other or an app. App-level mappers translate between domain and wire shapes;
database and provider records never become public DTOs by convenience.

Organize the API as a modular monolith: identity, personal tasks, academics,
goals, events, wellness, reminders, Today, and integrations. Modules own their
writes and expose application services; Today reads their normalized data.
These are code boundaries within one process, not separate services.

```text
Canvas / approved event feeds
              |
       API provider adapters
              |
     application services <--> PostgreSQL via Prisma
              |
      domain daily-plan rules
              |
           REST DTOs
              |
       mobile query/cache <--> SQLite
              |
         Today screen
```

## Domain model

The following are conceptual entities, not migration definitions. CampusFlow
IDs are internal identifiers; provider IDs are opaque strings retained separately.

| Entity | Responsibility and relationships |
| --- | --- |
| `User` | CampusFlow identity and preferred IANA timezone; owns private data. Canvas identity is optional. |
| `Course` | A user's imported course projection, scoped to their Canvas connection. Course membership sharing is unnecessary for the MVP. |
| `AcademicItem` | Imported assignment, quiz, discussion, or planner work; belongs to a user, optionally a Course. Holds deadline and external submission/grading state. |
| `PersonalTask` | User-owned task with title, notes, optional schedule/deadline, priority/category, and completion state. No Course is required. Recurrence belongs to this feature when implemented. |
| `Goal` | User-owned recurring activity with schedule or weekly target, timezone, pause and snooze rules. |
| `GoalCompletion` | A goal occurrence's completion/skip history; unique per user, goal, and occurrence key so retries do not double-count. |
| `Event` | Source-normalized event details and occurrence time. Public campus events have a source/feed scope; private Canvas calendar events retain user ownership. |
| `SavedEvent` | User-to-Event association, unique per pair, with explicit inclusion in the daily plan. Saving never changes the source Event. |
| `WellnessEntry` | Private, dated mood/energy/stress check-in. Wellness activities use Goals; check-in history is not a task. |
| `Reminder` | User-owned reminder intent targeting an eligible entity/occurrence, with a fire time and stable identity. Target ownership/existence must be validated. |
| `NotificationPreference` | Per-user category enablement and reminder/quiet-time preferences. Device permission remains a separate mobile concern. |
| `CanvasConnection` | User, approved Canvas base URL, external account ID, encrypted token material, expiry and synchronization status. Secrets stay out of DTOs. |

Keep completion state separate from temporal labels such as today/upcoming/
overdue. An AcademicItem's submitted or graded status is not interchangeable
with a PersonalTask checkbox. MVP Canvas import is read-only; Today must not
offer an action that implies submitting coursework through CampusFlow.

The ToR's manually chosen Main Goal is an optional dated reference on the
selected PersonalTask or AcademicItem, with at most one selection per user/date
enforced by an application transaction. It is user intent, not a persisted
Today list. Exact fields/constraints belong to the relevant feature design.

## Today read model

Decide on authenticated `GET /today?date=YYYY-MM-DD`. The optional date defaults
to today's date in the user's stored IANA timezone. The API derives the user
from the session; it does not accept a client-supplied owner ID. Invalid dates
receive a validation error. Authentication failures are distinct from unavailable
external sources.

The response contains the effective `date`, `timeZone`, `generatedAt`, source
freshness (`lastSuccessfulSyncAt` and current availability), and these groups:

| Group | Inclusion rule |
| --- | --- |
| `items` | Tasks/academic work scheduled or due on the selected day, still-open work overdue before that day, goal occurrences scheduled that day, and saved events explicitly included in the plan that overlap that day. Include items completed that day so they do not disappear after a checkoff. |
| `upcoming` | Incomplete tasks/academic deadlines in the next seven local calendar days, excluding records already in `items`. |
| `campusEvents` | Accessible campus events overlapping the selected day, for discovery. Exclude events already included in `items`. These suggestions do not become user commitments automatically. |

An undated task stays in Tasks unless explicitly scheduled or selected as that
day's Main Goal. A weekly-count goal does not invent a mandatory daily occurrence;
it contributes when its schedule or explicit user selection includes the day.
Completed or submitted work is not overdue. Snoozing changes a planned action
time, never the source deadline or its overdue status.

`DailyPlanItem` is a discriminated union with `kind` (`academic`, `personalTask`,
`goal`, `event`), internal entity ID, optional occurrence key, title, normalized
schedule/deadline, completion/source state, temporal label, and allowed actions.
Use a stable key from kind + entity ID + occurrence key. Do not merge unrelated
items because their titles match.

Order `items` by Main Goal first, overdue next, then timed entries chronologically,
then date-only/untimed entries; use priority and stable key as tie-breakers.
Sort `upcoming` by deadline and `campusEvents` by start time, with stable keys
breaking ties. Domain rules receive explicit date, zone, and current time so
tests and offline composition are deterministic.

The API reads persisted domain records and applies `packages/domain` planning
rules. **A Today read never waits for a live Canvas fetch.** A failed source can
therefore return cached items plus its unavailable/stale status. An unsynced
source is distinguished from a successful empty result. A database failure must
not be represented as an empty plan.

There is no Today table and no generic `PATCH /today` mutation. Actions go to
their owning task, goal, or saved-event services. SQLite may cache normalized
records and a disposable response snapshot; the same domain rules regenerate
Today when the local date changes, while preserving the source freshness age.

## Canvas and event provider ports

Keep both ports in API integration modules. Domain types remain provider-neutral.
Provider adapters fetch and validate external data, follow pagination, and map
records; they never write repositories or schedule notifications.

| Port | Input | Output and ownership |
| --- | --- | --- |
| `CanvasProvider.fetchAcademicSnapshot` | Authorized connection context and bounded synchronization window | Normalized Course and AcademicItem records, external keys, and explicit coverage/completeness metadata. Includes usable submission state. |
| `EventProvider.fetchEvents` | Source context, visibility/owner scope, and time window | Normalized Event occurrences, external keys, and coverage/completeness metadata. |

Use `CanvasAdapter` to implement the academic port. `CanvasEventProvider` and
`IcsEventProvider` implement the event port. They may share API-internal Canvas
transport/authentication helpers. Canvas calendar entries representing an
assignment map to the same AcademicItem identity; standalone calendar events
map to Event. This prevents a deadline appearing twice through different APIs.
The Campus screen consumes the same Event DTO regardless of provider.

External identity is scoped, never just `externalId`: use user/connection or
public-feed scope + source + resource type + external ID + occurrence key where
needed. Canvas numeric IDs from separate institutions/users cannot collide.
ICS recurring occurrences need a stable source occurrence identity, not a title
or mutable start time. Repeated imports upsert on database-enforced unique keys.
Different feeds are not automatically deduplicated by title/time.

Synchronization services own transactions, upserts, reconciliation, and reminder
updates. Validate a complete bounded batch before replacing its stored view;
failed or partial pagination must not erase cached records. Archive removals
only when explicit source deletion or authoritative complete coverage proves
them, preserving user-owned history. An item leaving a fetch window is not a
deletion. Concurrent syncs for the same connection are serialized/coalesced.

Initially run sync on explicit refresh and a staleness check when opening the
app. Periodic synchronization can run in the existing API process when needed,
with persisted last-run state and overlap protection; no queue or scheduler
service is required. This document does not create any scheduled jobs.
Provider timeouts/rate limits use bounded retries and retain last successful
data. Exact polling intervals and supported resource scopes belong to the
integration implementation.

### Canvas OAuth and UAlberta access

Use backend-mediated authorization-code OAuth with a registered HTTPS backend
callback. Mobile starts connection while signed into CampusFlow, opens the
system browser, and later reads connection status from the API. The callback
validates a short-lived, single-use state bound to that CampusFlow user and
connection attempt. Token exchange/refresh happens on the server. Never send
Canvas tokens or the client secret through a mobile deep link or public DTO.

Canvas documents institution-admin-issued developer keys for hosted instances;
multi-user applications must obtain tokens through OAuth. Therefore a working
student login is not evidence that CampusFlow has API authorization. See the
[official OAuth overview](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth.md).

Request only the approved read scopes needed for implemented imports. Store
token expiry, refresh server-side, preserve the existing refresh token when a
refresh response omits it, and require reconnection if refresh fails permanently.
Use the documented authorization/token endpoints; see
[OAuth endpoints](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth_endpoints.md)
and [developer keys](https://developerdocs.instructure.com/services/canvas/oauth2/file.developer_keys.md).
These are CampusFlow integration decisions; tenant enablement remains unverified.

The supplied [UAlberta Canvas URL](https://canvas.ualberta.ca/) redirected to
university SSO during the unauthenticated check on 2026-09-08; that browser fetch
ended in an SSO error. No authenticated Canvas API request was made. Do not infer
developer-key availability, API scopes, or usable event feeds from this check.

Before real integration, obtain institution approval, an enabled developer key,
approved read scopes and callback registration, then exercise an authorized test
account. Until then, develop against fixture providers behind these same ports.
Do not build a student-facing personal-token paste flow or scrape SSO pages.
Fixtures enable development but do not satisfy the ToR's live Canvas MVP gate.

## Data, time, offline use, and reminders

PostgreSQL is authoritative for account data. Every private read/write enforces
ownership in the API, including saved events and Canvas course data. CampusFlow
authentication is separate from optional Canvas authorization; choose the actual
identity/session mechanism before the first authenticated end-to-end feature.
Encrypt provider tokens at rest with a server-managed key outside the database;
exclude secrets and private wellness content from logs.

Use a discriminated temporal model: timed values are UTC instants serialized as
ISO 8601 with `Z`; date-only values are `YYYY-MM-DD` without an invented time;
absence is explicit. Recurrence retains a local schedule and IANA timezone.
Compute day bounds as `[local midnight, next local midnight)`, not midnight plus
24 hours. An exact midnight deadline belongs to the day it starts. Date-only
work becomes overdue after its whole local date passes; timed incomplete work
becomes overdue after its due instant. Missing deadlines never imply overdue.
All-day event ranges use an exclusive end date. Adapters normalize source
semantics once; screens only format the resulting values.

Mobile shows account-scoped SQLite data immediately, then refreshes from the
API through TanStack Query and updates the cache. Cover all records needed for
the selected plan window, including open overdue work; keep coverage metadata
so missing cache data is not shown as a confirmed empty plan. Clear the account's
cache and scheduled notifications on sign-out/account switch. Initial offline
support is cached reading; writes require the API and must show a clear failure
without claiming a change was saved. A durable write outbox and conflict policy
are deferred to a separate decision if offline editing becomes required.

The API owns reminder intent and target changes. Pure domain rules calculate
desired fire times; a mobile reminder service reconciles them against Expo
Notifications using stable per-device identifiers. Screens only call that service.
Task edits reschedule, deletion cancels, and repeated sync/reconciliation does
not duplicate notifications. Permissions and user preferences are honored.
Changed server deadlines reach local scheduling on the next successful refresh;
delivery while the app cannot refresh is not guaranteed by this local scheduling
design. Reliable remote updates would require a later push-delivery decision.

## Validation and next gates

No application checks exist yet. Future behavior tests must trace to the ToR:

| Requirement | Required evidence when implemented |
| --- | --- |
| ToR 4–6, daily plan/state/priority | Mixed-source composition, deterministic ordering, Main Goal uniqueness, undated and completed items, user isolation, local midnight rollover |
| ToR 7, personal tasks | Create/edit/delete/complete and failure paths through API and mobile; no Course/Canvas dependency |
| ToR 9–10, Canvas and sync | Fixture mapping, repeated and concurrent sync, changed deadlines, cross-endpoint identity, partial failure preservation, token refresh/revocation |
| ToR 11–12, events | Equivalent DTOs across providers, visibility isolation, idempotent saving, recurrence identity, no duplicate Today entry |
| ToR 10, 13, 19, cache/reminders | Cold offline startup, account switch, unavailable/unsynced distinction, edit/delete reminder reconciliation and duplicate prevention |
| ToR 3.4, 5, goals | Daily/weekly schedules, occurrence completion retries, pause/skip/snooze without history loss |
| Cross-cutting dates | IANA conversion, both DST transitions, exact midnight, date-only/no-date cases, changed deadlines and overdue boundaries |

The next task is repository/workspace and CI scaffolding with empty app/package
entry points and runnable lint/typecheck/test commands. Then choose account
authentication and build personal tasks end-to-end before Today and integrations.
Institutional Canvas approval and at least one usable event feed remain external
MVP dependencies. Recurrence syntax, retention policy, and push delivery details
are feature-level follow-ups, not permission to redesign the baseline.
