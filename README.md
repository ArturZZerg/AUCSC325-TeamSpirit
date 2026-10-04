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

Live Canvas connection and synchronization remain disabled until
institution-approved backend OAuth is implemented. The API does not accept
personal Canvas tokens or client-selected Canvas URLs. Fixtures require
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
