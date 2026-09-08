# CampusFlow — AI Development Rules

## Accepted Architecture Baseline

Read [the architecture overview](docs/architecture/overview.md) and
[ADR 001](docs/adr/001-initial-architecture.md) before implementation.
The product requirements remain in [ToR.docx](ToR.docx).

Phase 0 establishes documentation only. The directories and contracts below
describe the target architecture; they are not implemented yet.

* Use one TypeScript monorepo with npm workspaces and one root lockfile.
* `apps/mobile` owns presentation, device capabilities, and SQLite caching.
* `apps/api` is one modular NestJS backend and the only PostgreSQL/Canvas client.
* `packages/contracts` owns REST DTOs and Zod boundary schemas, never Prisma or
  provider payloads. `packages/domain` owns pure entities and business rules.
* Both apps may import these packages. Shared packages must not import apps;
  contracts and domain remain independent. Map between them in the apps.
* `packages/config` is reserved for shared tooling configuration when needed.
* `GET /today` is an authenticated, derived read model. Never persist a Today
  table or use a generic Today endpoint to mutate different entity types.
* Keep Canvas/Event provider ports and implementations inside the API integration
  modules. Return normalized records; application services own persistence.
* Keep Canvas OAuth credentials and tokens on the backend. Institutional OAuth
  approval is unverified; use fixtures until a supported connection is available.
* Store timed values as UTC instants, date-only values as calendar dates, and
  recurrence zones as IANA identifiers. Apply shared domain rules for day bounds.
* PostgreSQL is authoritative; SQLite is an account-scoped cache. Initial offline
  support guarantees reads. Offline writes need a separate conflict/retry design.

Change accepted architecture through a subsequent ADR; do not silently diverge.

## Project

CampusFlow is a cross-platform iOS/Android student-life management application.

Its purpose is to combine:

* Canvas academic data
* personal tasks
* recurring goals/routines
* campus events
* reminders/notifications
* lightweight wellness features

into one simple daily student workflow.

The core product experience is the **Today / Daily Plan**.

The application should answer:

1. What do I need to do today?
2. What academic deadlines are coming?
3. What personal tasks do I have?
4. What campus events are happening?
5. What routines/goals should I complete?

CampusFlow is not a Canvas clone.

---

# Current Technology

Use the established stack unless an architectural decision explicitly changes it.

## Mobile

* React Native
* Expo
* TypeScript
* Expo Router
* TanStack Query
* Zustand where local application state is needed
* React Hook Form
* Zod
* Expo SQLite for persistent local/offline data
* Expo Notifications

## Backend

* Node.js
* NestJS
* TypeScript
* REST API
* Prisma
* PostgreSQL

## Infrastructure

* GitHub
* GitHub Actions
* monorepo

---

# Repository Structure

Expected high-level organization:

```text
apps/
  mobile/
  api/

packages/
  contracts/
  domain/
  config/

docs/
  requirements/
  architecture/
  adr/
```

Do not introduce additional services, databases, queues, frameworks, or infrastructure unless there is a demonstrated need.

Prefer simple architecture.

---

# Core Domain Entities

Keep conceptually different entities separate.

Primary entities include:

* User
* Course
* AcademicItem
* PersonalTask
* Goal
* GoalCompletion
* Event
* SavedEvent
* WellnessEntry
* Reminder
* NotificationPreference
* CanvasConnection

Do NOT create one giant generic `Task` entity for Canvas assignments, personal tasks, events, routines, and wellness activities.

They may be converted to a shared UI representation such as:

```ts
DailyPlanItem
```

but the underlying domain entities must remain separate.

---

# Daily Plan

The Today screen is a core domain feature.

It combines relevant data from multiple sources:

```text
AcademicItem ─┐
PersonalTask ─┤
Goal ─────────┼──> DailyPlanItem[] ───> Today Screen
Event ────────┘
```

Do not store the Today screen itself as database state.

Generate it from domain data.

---

# Canvas Architecture

Canvas is an external integration and must be isolated.

Correct:

```text
Canvas API
    ↓
CanvasProvider / CanvasAdapter
    ↓
CampusFlow domain models
    ↓
application services
    ↓
API
    ↓
mobile
```

Incorrect:

```text
React component
    ↓
Canvas API directly
```

Mobile UI must never depend on Canvas-specific JSON.

Canvas responses must be converted to CampusFlow domain models.

The Canvas integration should support:

* courses
* assignments/planner items
* relevant calendar events
* submission/status data where useful

Synchronization must be idempotent.

Running synchronization repeatedly with unchanged Canvas data must not create duplicate records.

External records should normally contain:

```text
source
externalId
```

with appropriate unique constraints.

---

# Campus Event Architecture

Campus events may come from multiple sources.

Use a provider abstraction.

Example:

```ts
interface EventProvider {
    fetchEvents(...): Promise<Event[]>;
}
```

Possible implementations:

* CanvasEventProvider
* IcsEventProvider
* future university-specific providers

The Campus UI must not depend on which provider supplied an event.

---

# Date and Time Rules

Date/time logic is high risk.

Use one consistent internal representation.

Never scatter timezone conversion logic across UI components.

Explicitly test:

* timezone conversion
* daylight saving transitions
* midnight deadlines
* missing due time
* missing due date
* changed deadlines
* overdue calculations

---

# Notifications

Notification logic must be implemented behind a notification/reminder service.

Screens must not directly contain notification scheduling logic.

A task deadline change must correctly update its reminder.

Deleting a personal task must remove associated scheduled notifications.

Repeated synchronization must not create duplicate notifications.

---

# Offline Behaviour

Previously synchronized information should remain usable when the network or Canvas is unavailable.

Prefer:

```text
Open application
    ↓
show locally cached data immediately
    ↓
request fresh server state
    ↓
update UI
    ↓
update local cache
```

Do not make normal application usage dependent on Canvas responding instantly.

---

# MVP Priorities

Build approximately in this order:

1. Foundation / repository / CI
2. Personal tasks end-to-end
3. Today screen
4. Canvas integration
5. Academic items
6. Campus events
7. Notifications
8. Recurring goals/routines
9. Basic wellness
10. MVP stabilization

Advanced AI planning and gamification are not core MVP dependencies.

---

# Development Rules

Before modifying code:

1. Read the relevant existing implementation.
2. Read relevant requirements and architecture documentation.
3. Check whether similar functionality already exists.
4. Avoid creating duplicate abstractions.

During implementation:

* follow existing project conventions;
* prefer small understandable changes;
* do not silently redesign architecture;
* do not add dependencies unnecessarily;
* avoid unrelated refactoring;
* maintain strict TypeScript typing;
* validate external input;
* handle failures explicitly;
* do not hardcode secrets;
* never log Canvas access tokens;
* do not commit credentials.

When architectural changes appear necessary, explain the problem and proposed change before implementing it.

---

# Testing Rules

Every meaningful requirement should eventually trace to automated tests.

Whenever implementing behaviour:

1. identify the relevant requirement;
2. implement or update automated tests;
3. test normal behaviour;
4. test important failure/edge cases.

Testing levels may include:

* unit
* component
* integration
* API
* end-to-end

Particular attention should be given to:

* Canvas mapping
* synchronization
* duplicate prevention
* dates/timezones
* task state
* notification calculation
* offline behaviour

Do not write tests that only reproduce implementation internals.

Tests should validate externally meaningful behaviour.

---

# AI-Generated Code Rules

AI-generated implementation is not automatically trusted.

Before accepting generated code:

* inspect the diff;
* verify that it matches existing architecture;
* verify types;
* run tests;
* run linting;
* run TypeScript checks;
* inspect edge cases.

Do not introduce large AI-generated refactors unrelated to the active task.

If existing architecture appears problematic, document the issue instead of silently replacing it.

---

# End-of-Session Handoff

At the end of every significant coding session report:

## Completed

What was implemented.

## Files / Modules Changed

Important affected modules.

## Tests

What tests were added and which commands were run.

## Decisions

Any important architectural or implementation decisions.

## Problems / Risks

Anything unresolved.

## Next Recommended Step

One concrete next task.


