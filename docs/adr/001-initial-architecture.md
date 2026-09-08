# ADR 001 — Initial CampusFlow architecture

Status: Accepted

Date: 2026-09-08

Scope: Phase 0 architecture bootstrap; documentation only.

## Context

CampusFlow is a four-developer AUCSC 325 project for iOS and Android. The
[Terms of Reference v0.2](../../ToR.docx) defines a daily workflow combining
Canvas work, personal tasks, recurring goals, campus events, and basic wellness.
The existing [development rules](../../AGENTS.md) specify Expo, NestJS,
TypeScript, Prisma/PostgreSQL, separate entities, provider isolation, and cached
use. At this decision, the repository contains those rules and the ToR, with no
application implementation to migrate.

The team needs clear ownership and shared semantics without maintaining several
repositories or operating distributed services. Canvas authorization and event
feed availability must not prevent personal-task development or cached reads.

## Decision

1. **One monorepo.** Use npm workspaces and one root lockfile. Place the Expo app
   in `apps/mobile`, the NestJS backend in `apps/api`, and shared runtime packages
   in `packages/contracts` and `packages/domain`. Reserve `packages/config` for
   reused tooling configuration. Keep requirements, architecture, and ADRs in
   `docs`. Introduce no build orchestrator until a demonstrated need exists.

2. **One backend with explicit modules.** NestJS owns identity enforcement,
   application services, persistence, synchronization, and provider integration.
   Prisma accesses one PostgreSQL database, eventually hosted on Supabase as
   specified in the ToR. Expo owns presentation, device integration, and SQLite
   caching. Mobile calls only CampusFlow REST for application data.

3. **Separate domain and transport.** `packages/domain` contains pure entities,
   date/recurrence rules, daily-plan composition, and reminder calculation.
   `packages/contracts` contains REST DTOs and Zod boundary schemas. Both apps
   can consume both packages; neither package imports an app or the other
   package. App-level mapping prevents provider JSON and Prisma models from
   becoming public contracts.

4. **Keep distinct entities.** Adopt User, Course, AcademicItem, PersonalTask,
   Goal, GoalCompletion, Event, SavedEvent, WellnessEntry, Reminder,
   NotificationPreference, and CanvasConnection. Ownership and source-scoped
   identities are mandatory. A DailyPlanItem is a display projection, not a
   replacement entity or generic Task table.

5. **Derive `/today`.** Authenticated `GET /today?date=YYYY-MM-DD` reads saved
   domain records for the user's timezone. It returns a daily list, upcoming
   deadlines, campus event suggestions, and freshness metadata, following the
   [overview's inclusion and ordering rules](../architecture/overview.md#today-read-model).
   Do not store a Today table or fetch Canvas in the read path. Mutations remain
   with the owning entity services. Reuse pure composition for offline reading.

6. **Isolate providers in the API.** A CanvasProvider port imports normalized
   courses and academic work. An EventProvider port imports normalized event
   occurrences, implemented by Canvas and ICS adapters. Providers return records
   plus coverage metadata; synchronization services own persistence. Use scoped
   unique external keys, idempotent upserts, and complete-batch reconciliation
   so repeats, changed deadlines, and partial failures preserve correct data.

7. **Use backend Canvas OAuth.** Choose authorization-code OAuth with an HTTPS
   API callback, user-bound single-use state, server-side token exchange/refresh,
   and approved read scopes. Keep Canvas credentials off mobile. CampusFlow
   account identity is independent of optional Canvas connection. The
   [Canvas OAuth overview](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth.md)
   establishes that hosted-instance developer keys require institutional admin
   involvement and multi-user access uses OAuth. UAlberta enablement is not
   verified; fixture providers are the development fallback, not proof of a
   working production integration.

8. **Make time and cache semantics explicit.** Use UTC instants for timed values,
   calendar dates for date-only values, and IANA zones for local schedules.
   Derive day boundaries with timezone-aware rules. PostgreSQL is authoritative;
   account-scoped SQLite enables cached reads. Initial writes require the API.
   Notification intent belongs to backend services; a mobile service reconciles
   local Expo schedules using shared calculations and stable identifiers.

## Alternatives considered

| Alternative | Reason not selected |
| --- | --- |
| Separate mobile/backend repositories | Adds contract release and coordination work for a small team without a current isolation requirement. |
| Microservices or additional queues | Deployment and consistency costs exceed current needs; module boundaries allow later extraction if evidence supports it. |
| Mobile calling Canvas or PostgreSQL directly | Spreads credential handling, mapping, access control, and synchronization across clients. |
| A universal Task table and stored Today list | Conflates external submission state with personal completion and introduces duplicated, stale derived data. |
| Live provider calls inside `/today` | Makes the core daily experience depend on external availability and latency. |
| Full offline mutation synchronization immediately | Requires durable retries and conflict semantics before the first useful vertical slice; the ToR requires cached access, not a specific offline-write protocol. |

## Consequences

The team can change mobile, API, and shared contracts atomically while developing
personal tasks independently of Canvas. One pure planning implementation keeps
server and cached behavior aligned. Normalized provider data allows another
event source without changing the Campus UI.

The backend remains necessary for writes and fresh data. Cached reads can be
stale and must show freshness. Local notification schedules cannot learn about
server-side changes until refresh. Scoped external identities and recurrence
require careful mapping and tests. A monorepo does not itself enforce boundaries;
the scaffolding task must add dependency checks and CI.

## Follow-up and acceptance gates

This ADR accepts architecture, not deployed functionality. Phase 0 is complete
when AGENTS.md, the overview, and this record consistently cover layout,
ownership, entities, Today, and provider boundaries without application code.

Next, scaffold workspaces and CI using the ToR's Jest, React Native Testing
Library, Supertest, and Maestro stack. Select CampusFlow account/session
authentication before personal tasks end-to-end. Implement the behavior gates
listed in the overview as their features are built.

Before claiming Canvas MVP completion, obtain an enabled institutional developer
key, callback registration, appropriate scopes, and evidence from an authorized
test account. Before claiming campus-event MVP completion, verify one usable
structured source. The supplied [UAlberta Canvas site](https://canvas.ualberta.ca/)
alone confirms neither dependency. Hosting provisioning, offline write conflict
policy, recurrence details, and reliable push delivery are outside this bootstrap.

Change these accepted decisions with a subsequent ADR and update the overview
and development rules together.
