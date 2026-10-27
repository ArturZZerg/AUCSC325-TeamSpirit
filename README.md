# CampusFlow

CampusFlow combines coursework, personal tasks, routines, campus events and
wellness check-ins into a daily student plan. The project uses Expo for iOS and
Android, NestJS for the API, and PostgreSQL through Prisma.

Today opens with your progress for the day, one-tap shortcuts and a checklist of
tasks, deadlines and routines. Type a task in plain language — `Essay due fri 5pm
#uni !high 45m` — and quick add fills in the deadline, category, priority and
estimate. Tasks are grouped by when they are due, routines track streaks with a
seven-day strip, the month calendar shows every dated task, deadline and saved
campus event, and an optional morning overview opens Today. The app follows the
system light or dark appearance, meets WCAG AA colour contrast in both, works
with VoiceOver and TalkBack, follows the device text size, and opens editors
without sliding when Reduce Motion is on
([mobile accessibility](docs/development/mobile-accessibility.md)).

Each course tracks its grade: weighted assessments, optional groups such as
"Quizzes 20%" or groups graded by points, a target and the average needed on the
rest. **What if…** tries scores for ungraded work without saving them. With
Canvas connected, scores and assignment groups import automatically, and any
weight can be changed or reset to the Canvas value
([ADR 024](docs/adr/024-canvas-grades-and-assessment-groups.md)).

From Today, open Coursework to add your own academic deadlines or review imported
work. Plan study time turns a deadline into a manageable preparation task with a
chosen day and duration. Focus space runs a timed work block, offers a short
break, and lets you explicitly finish the selected preparation task. Manual
coursework works without Canvas access; marking it finished records your own
progress. See [manual coursework](docs/requirements/manual-coursework.md),
[study planning](docs/requirements/study-planning.md), and
[focus workspace](docs/requirements/focus-workspace.md) for behavior and limits.

## Architecture

CampusFlow is one TypeScript monorepo with two apps and two shared packages. The
mobile app never talks to a database or to Canvas directly: everything goes
through one REST API, and the API is the only process that reaches PostgreSQL
and outside data sources. The full rules live in the
[architecture overview](docs/architecture/overview.md) and the
[ADRs](docs/adr/).

### The big picture

```mermaid
flowchart LR
  subgraph Device["Student device"]
    App["Mobile app<br/>Expo / React Native<br/>(Android, iOS, web)"]
    Cache[("SQLite cache<br/>per account")]
    Secure[("SecureStore<br/>session token")]
    Notif["Local notifications"]
    App --- Cache
    App --- Secure
    App --> Notif
  end

  subgraph Server["Server"]
    Nginx["Nginx (HTTPS)"]
    API["CampusFlow API<br/>NestJS · one process"]
    DB[("PostgreSQL<br/>via Prisma")]
    Static["Static files<br/>web app · OTA updates · exercise photos"]
    Nginx -->|"/campusflow-api/"| API
    Nginx --> Static
    API --> DB
  end

  subgraph Sources["External data sources"]
    Canvas["Canvas LMS<br/>REST API"]
    ICS["Augustana public<br/>Google Calendars (ICS)"]
    Wagner["Augustana dining hall<br/>menu page"]
  end

  App -->|"REST + JSON<br/>Authorization: Bearer"| Nginx
  API -->|student's own token| Canvas
  API -->|hourly| ICS
  API -->|every few hours| Wagner
```

| Piece | Where | What it does |
| --- | --- | --- |
| Mobile app | [`apps/mobile`](apps/mobile) | Screens (Expo Router), forms, REST client, TanStack Query, the offline SQLite cache, device reminders and self-hosted app updates |
| API | [`apps/api`](apps/api) | Accounts and sessions, every feature service, the Today read model, background syncs and all external integrations |
| Contracts | [`packages/contracts`](packages/contracts) | Zod schemas and DTO types for every request and response; both apps validate with the same schemas |
| Domain | [`packages/domain`](packages/domain) | Pure rules with no framework code: dates and time zones, recurrence, daily plan composition, reminders, gym and nutrition math |
| Database | PostgreSQL ([`apps/api/prisma`](apps/api/prisma)) | The single source of truth for account data; schema and migrations are managed by Prisma |

Dependencies only point one way: `mobile → contracts/domain` and
`api → contracts/domain`. The shared packages never import an app or each other,
and `npm run check` enforces it.

### How the app and the server talk

The app calls the API with plain `fetch` ([`src/lib/api.ts`](apps/mobile/src/lib/api.ts)).
The base address comes from `EXPO_PUBLIC_API_URL`. Signing in returns a random
session token; the app keeps it in SecureStore and sends it as
`Authorization: Bearer <token>`. The API stores only a SHA-256 hash of the token
and works out the user from it, so a client can never ask for someone else's data.
A `401` signs the app out.

```mermaid
sequenceDiagram
  participant S as Screen
  participant Q as TanStack Query
  participant C as SQLite cache
  participant A as API
  participant P as PostgreSQL

  S->>Q: open Today
  Q->>C: read last snapshot
  C-->>S: show cached plan right away
  Q->>A: GET /today (Bearer token)
  A->>P: read tasks, coursework, goals, saved events
  A->>A: build the plan with packages/domain rules
  A-->>Q: Today DTO (validated by contracts)
  Q->>C: save new snapshot
  Q-->>S: update screen and reconcile reminders
```

Reads work offline from the cache. Writes (create, edit, complete) need the API;
when the network is gone the app says the change was not saved instead of
pretending.

### API endpoints

All routes except `auth` and `health` need a session. Request bodies and query
strings are validated with the Zod schemas from `packages/contracts`.

| Area | Routes |
| --- | --- |
| Accounts | `/auth/*` (register, login, logout, verification, recovery), `/me` (profile, export, delete) |
| Today | `GET /today`, `GET /snapshot` — built on every request, never stored |
| Personal tasks | `/tasks` — CRUD, complete, snooze, main goal, checklist steps |
| Coursework | `/courses`, `/courses/:id/assessments`, `/courses/:id/assessment-groups`, `/academic-items` (+ reminders) |
| Canvas | `/canvas/*` — connect a token, status, sync, disconnect |
| Classes | `/classes` — weekly timetable, ICS calendar import preview |
| Study | `/study-plans`, `/focus-sessions` |
| Routines | `/goals` — CRUD, complete, snooze, pause, history |
| Campus events | `/events`, `/events/:id/saved`, `/events/sources` |
| Wellness | `/wellness` — check-ins and journal |
| Gym | `/gym/*` — exercises, programs, workouts, body weight, openGym import |
| Nutrition | `/nutrition/*` — goals, food search, diary, dining hall menu |
| Settings | `/notification-preferences` |
| Operations | `/health` liveness and readiness |

The Today screen is a read model: `GET /today` merges personal tasks, academic
items, routines and saved events into one list of `DailyPlanItem`s. Each item
keeps its own type, and actions go back to the owning endpoint (for example
`POST /tasks/:id/complete`). There is no Today table and no generic Today update.

```mermaid
flowchart LR
  T["PersonalTask"] --> R
  A["AcademicItem<br/>(manual or Canvas)"] --> R
  G["Goal occurrences"] --> R
  E["Saved Event"] --> R
  R["Daily plan rules<br/>packages/domain"] --> D["DailyPlanItem[]"] --> UI["Today screen"]
```

### Where the data comes from

Most data is typed in by the student. The API pulls the rest from outside sources
through provider adapters in
[`apps/api/src/integrations`](apps/api/src/integrations). An adapter fetches and
validates the outside data and turns it into CampusFlow records; application
services then save them. Every imported record keeps its `source` and
`externalId` with a unique key, so running a sync twice never makes duplicates.
A failed or partial fetch keeps the last good data.

| Source | Adapter | Brings in | How often |
| --- | --- | --- | --- |
| Canvas LMS | [`integrations/canvas`](apps/api/src/integrations/canvas) | Courses, assignments, quizzes, deadlines, submission status, scores and assignment groups (ADR 024), planner to-dos and course calendar events as private events (ADR 025); removes work deleted in Canvas after a full read | On demand, plus a background sync every 30 min when stale. Uses the student's own personal access token, sealed on the server ([ADR 019](docs/adr/019-canvas-personal-access-tokens.md)). Fixture data in development |
| Augustana public Google Calendars (ICS) | [`integrations/events`](apps/api/src/integrations/events) | Campus Rec and student-life events | Hourly; every 15 min after a failure ([ADR 008](docs/adr/008-public-campus-calendar-refresh.md)) |
| Augustana dining hall (Wagner) menu | [`integrations/dining`](apps/api/src/integrations/dining) | Breakfast, lunch and dinner dishes with calories | Today every 2 h, the next 4 days twice a day ([ADR 023](docs/adr/023-nutrition-and-dining-hall.md)) |
| USDA FoodData Central | [`integrations/food`](apps/api/src/integrations/food) | Food search with nutrients per 100 g | Bundled file in `apps/api/data`, searched in memory |
| free-exercise-db | `apps/api/data`, [`ops/vps/sync-exercise-media.py`](ops/vps/sync-exercise-media.py) | Exercise library names, instructions and photos | Bundled; photos copied to the server once |
| Student uploads | [`integrations/timetable`](apps/api/src/integrations/timetable), [`integrations/opengym`](apps/api/src/integrations/opengym) | Class schedule from an `.ics` file; gym history from an openGym backup | When the student imports |

The app never sees Canvas JSON or tokens, and no university credentials are
collected. Checked sources and their limits are listed in
[data sources](docs/APIS.md).

### Deployment

The API runs in a Docker container on one server behind Nginx
([`ops/vps`](ops/vps), [ADR 013](docs/adr/013-initial-server-beta.md),
[ADR 017](docs/adr/017-owner-authorized-deployment.md)). Images are built locally
and copied over; each deploy backs up the database, runs migrations and rolls back
if the readiness check fails. The same Nginx host serves the web build of the app
([ADR 018](docs/adr/018-unverified-signup-and-hosted-web.md)) and the
over-the-air JavaScript updates the Android app downloads
([ADR 021](docs/adr/021-self-hosted-app-updates.md)).

```mermaid
flowchart LR
  Dev["Developer machine<br/>docker build"] -->|"docker save | ssh"| Box
  subgraph Box["Server"]
    N["Nginx HTTPS"] --> C["campusflow-api container<br/>127.0.0.1:8780"]
    C --> PG[("PostgreSQL 16")]
    N --> W["/campusflow/ web app"]
    N --> U["OTA update files"]
  end
  Phone["Android APK"] --> N
  Browser["Browser"] --> N
```

## Development setup

Use Node.js 22 LTS and npm. All commands below run from the repository root.

```sh
npm ci
npm run build:shared
npm run db:generate
docker compose up -d postgres
```

The API reads its configuration from the process environment. The example file at
`apps/api/.env.example` lists the values; it is not loaded automatically. In
PowerShell, set the local development values in the same terminal that runs the
migrations and API:

```powershell
$env:DATABASE_URL = "postgresql://campusflow:campusflow_local_only@127.0.0.1:5432/campusflow"
$env:PORT = "3000"
$env:HOST = "127.0.0.1"
$env:CANVAS_MODE = "fixture"
$env:NODE_ENV = "development"
```

The Compose database credential is exclusively for local development.

```sh
npm run db:migrate
npm run dev:api
```

The API should now be listening at `http://127.0.0.1:3000`. Keep this terminal
running while testing it from a second terminal.

In a separate terminal:

```sh
npm run dev:mobile
```

## Local Canvas integration

Canvas credentials stay on the API. For deterministic development data, keep
`CANVAS_MODE=fixture`. First create a CampusFlow account and save its session
token in PowerShell:

```powershell
$email = "canvas-test-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@example.com"
$account = @{
	email = $email
	password = "a-long-test-password-123"
	displayName = "Canvas Test"
	timeZone = "America/Edmonton"
} | ConvertTo-Json

$session = Invoke-RestMethod -Method Post `
	-Uri "http://127.0.0.1:3000/auth/register" `
	-ContentType "application/json" -Body $account

$headers = @{ Authorization = "Bearer $($session.accessToken)" }
```

Connect the fixture and synchronize it:

```powershell
Invoke-RestMethod -Method Post `
	-Uri "http://127.0.0.1:3000/canvas/dev/connect" -Headers $headers

Invoke-RestMethod -Method Post `
	-Uri "http://127.0.0.1:3000/canvas/sync" -Headers $headers
```

Verify that Canvas data reached the API:

```powershell
Invoke-RestMethod -Method Get `
	-Uri "http://127.0.0.1:3000/canvas/status" -Headers $headers

Invoke-RestMethod -Method Get `
	-Uri "http://127.0.0.1:3000/courses" -Headers $headers

Invoke-RestMethod -Method Get `
	-Uri "http://127.0.0.1:3000/academic-items" -Headers $headers
```

To use real Canvas data, start the API with `CANVAS_MODE=token` and a
`CANVAS_TOKEN_KEY` (see `apps/api/.env.example`). Each student then opens
Settings → Canvas in the app, follows the steps to create a Canvas access token,
and connects ([ADR 019](docs/adr/019-canvas-personal-access-tokens.md)). The token
stays encrypted on the API. Institutional OAuth is still future work. Fixtures require
`NODE_ENV=development` (or `test`) and `CANVAS_MODE=fixture`; production cannot
enable them. See [Canvas development](docs/development/canvas.md) for scope and
verification.

Set `EXPO_PUBLIC_API_URL` to the API address reachable from your device. A physical
phone cannot reach your computer through `localhost`; use its development LAN
address. Android emulators commonly reach the host through `10.0.2.2`.
Native notification and SecureStore behavior requires a real device/development
build. The web export is useful for reviewing layouts and interaction flows.

For an installable Android phone preview, run `npm run build:android` after
configuring the Android SDK/JDK. See the [Android preview guide](docs/requirements/android-preview.md)
for prerequisites, USB installation, API connection, and device acceptance.

## Checks

```sh
npm run check
npm run build:web -w @campusflow/mobile
```

CI installs the root lockfile, generates Prisma, applies migrations to a fresh
PostgreSQL service, checks workspace boundaries, lints, type-checks, runs tests,
builds the API and exports the web preview. Device-level acceptance remains a
separate release gate.

API liveness/readiness, production startup requirements, the read-only
`release:smoke` command and guarded `release:restore-rehearsal` are documented in
[release operations](docs/development/release-operations.md). CI restores its
isolated test database and verifies records/relationships and dependency readiness.

## Project layout

| Directory | Responsibility |
| --- | --- |
| `apps/mobile/app` | Expo Router screens; `(tabs)` holds Today, Tasks, Campus, Gym, Wellness and Settings |
| `apps/mobile/src` | Feature logic and components, REST client (`lib`), cache, reminders and updates (`services`) |
| `apps/api/src` | Controllers and services per feature, Today, auth, background workers |
| `apps/api/src/integrations` | Canvas, campus events, dining, food, openGym and timetable adapters |
| `apps/api/prisma` | Database schema and migrations |
| `packages/contracts` | REST boundary schemas and DTOs |
| `packages/domain` | Pure date, recurrence, daily-plan, reminder, gym and nutrition rules |
| `ops/vps` | Dockerfile, Nginx snippets, deploy, backup and update scripts |
| `docs/architecture` and `docs/adr` | Accepted boundaries and decisions |
| `docs/requirements` | ToR extraction, implementation plan and acceptance status |

## Integrations and release status

Canvas works with a student's personal access token (ADR 019); institutional
OAuth still needs an approved developer key and is future work. Development
fixtures do not establish live university access. Never place Canvas secrets or
access tokens in the mobile app.

Offline support covers cached reads. Writes require the API. Local device
notifications update after a successful refresh; they cannot learn of changed
server deadlines while the device remains offline.

See `docs/requirements/implementation-plan.md` for scope and external gates.
Features explicitly marked future in the ToR remain in the backlog.
