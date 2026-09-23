# CampusFlow

CampusFlow combines coursework, personal tasks, routines, campus events and
wellness check-ins into a daily student plan. The project uses Expo for iOS and
Android, NestJS for the API, and PostgreSQL through Prisma.

## Development setup

Use Node.js 22 LTS and npm. All commands below run from the repository root.

```sh
npm ci
npm run build:shared
npm run db:generate
docker compose up -d postgres
```

Configure the API environment using `apps/api/.env.example`. The Compose database
URL is `postgresql://campusflow:campusflow_local_only@localhost:5432/campusflow`.
The included database credential is exclusively for local development.

```sh
npm run db:migrate
npm run dev:api
```

In a separate terminal:

```sh
npm run dev:mobile
```

Set `EXPO_PUBLIC_API_URL` to the API address reachable from your device. A physical
phone cannot reach your computer through `localhost`; use its development LAN
address. Android emulators commonly reach the host through `10.0.2.2`.
Native notification and SecureStore behavior requires a real device/development
build. The web export is useful for reviewing layouts and interaction flows.

## Checks

```sh
npm run check
npm run build:web -w @campusflow/mobile
```

CI installs the root lockfile, generates Prisma, applies migrations to a fresh
PostgreSQL service, checks workspace boundaries, lints, type-checks, runs tests,
builds the API and exports the web preview. Device-level acceptance remains a
separate release gate.

## Project layout

| Directory | Responsibility |
| --- | --- |
| `apps/mobile` | Expo Router screens, forms, account cache and device reminders |
| `apps/api` | Identity, feature services, providers and PostgreSQL persistence |
| `packages/contracts` | REST boundary schemas and DTOs |
| `packages/domain` | Pure date, recurrence and daily-plan rules |
| `docs/architecture` and `docs/adr` | Accepted boundaries and decisions |
| `docs/requirements` | ToR extraction, implementation plan and acceptance status |

## Integrations and release status

Canvas requires an institution-approved developer key, callback and authorized
test account. Development fixtures do not establish live university access.
Campus event imports require a configured usable structured feed. Never place
Canvas secrets or access tokens in the mobile app.

Offline support covers cached reads. Writes require the API. Local device
notifications update after a successful refresh; they cannot learn of changed
server deadlines while the device remains offline.

See `docs/requirements/implementation-plan.md` for scope and external gates.
Features explicitly marked future in the ToR remain in the backlog.
