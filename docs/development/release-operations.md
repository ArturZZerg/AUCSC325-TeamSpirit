# API health, release smoke and local restore

The current release tools provide repeatable local evidence. Hosted production
targets, mail, native signing/devices and store declarations still require the
owner's deployment details and acceptance evidence. See
[production readiness](production-readiness.md).

## API deployment configuration

Set `NODE_ENV=production`, a valid PostgreSQL `DATABASE_URL`, explicit `HOST` and
`PORT`, and comma-separated **HTTPS origins** in `CORS_ORIGIN`. Origins must have
no credentials, paths, query strings, wildcards or loopback hosts. Native clients
can make authenticated requests without an Origin header. CORS is a browser
policy, not authentication. Use the chosen host's protected secret configuration;
do not commit credentials or print connection URLs.

Production also requires `AUTH_RATE_KEY`: 32 random bytes in canonical base64,
stored only on the API and shared across replicas. Use a stable secret independent
of `RECOVERY_OUTBOX_KEY`; SMTP can be disabled without disabling auth quotas.
Missing/invalid configuration stops startup with setting-name-only errors. Local
test/preview without this key keeps bounded process-local protections. Key rotation
changes quota identity and requires a reviewed rollout/abuse plan; never put it in
an `EXPO_PUBLIC_*` value or print the generated secret.

Use `CANVAS_MODE=disabled` (or leave it unset) until institutional authorization
is implemented and verified. Production refuses fixture mode. Existing Canvas
authorization endpoints remain disabled. Configure `CAMPUS_CALENDARS` explicitly
for the intended campus, or leave feeds disabled. Health never fetches providers.

Run `npm ci`, `npm run db:generate`, `npm run db:migrate` and `npm run build` for
the release. Review migrations and a real backup/rollback plan before applying
them to the chosen production database. The local rehearsal below does not
authorize a production migration. Preserve database transport security in the
host's connection settings; URL validation does not establish TLS.

- `GET /health/live`: 200 `{ "status": "alive" }` means this process responds.
- `GET /health/ready`: 200 `{ "status": "ready" }` requires PostgreSQL, every
  required application column/type/nullability and successfully applied migration
  checksums. Failure is a generic, uncached 503. It reveals no data/schema/errors.

Readiness is read-only, shares concurrent work, limits transaction acquisition
and duration, sets PostgreSQL statement timeout, and bounds the HTTP wait to
three seconds. A driver that remains hung does not start additional probes.
Readiness does not replace workload, backup, permission or device acceptance.
Prisma still connects during application startup; failed startup is an unhealthy
deployment, not a responding liveness endpoint. Shutdown hooks close the client.

After a schema/migration change, run `db:generate`, then `schema:manifest` and
commit the generated API manifest. Root lint rejects a stale client/manifest.
This generator uses the pinned Prisma 6 client metadata; extend its SQL type
mapping when adding a new native type. Do not edit the generated manifest.

## Read-only release smoke

Build web output in a **new empty directory** with `EXPO_PUBLIC_API_URL` set to
the actual intended API URL before Expo starts. `build:web` clears Metro cache.
Deploy that output, preserving the referenced entry/worker/WASM assets. Serve
JavaScript with JavaScript MIME and WASM with `application/wasm`; the HTML must
provide `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (or compatible `credentialless`).
Check the real web runtime on the intended host as well as these headers.

Provide environment variables to `npm run release:smoke`:

| Variable | Required value |
| --- | --- |
| `RELEASE_MODE` | `preview` or `production`, explicitly |
| `API_URL` | Actual API base URL, including an existing proxy prefix if used |
| `WEB_URL` | Web origin, with no application path |
| `RELEASE_BEARER` | Existing session for an authorized synthetic acceptance account |
| `RELEASE_USER_ID` | That account's UUID, for identity verification |

Keep the bearer in protected environment storage, not shell history, command
arguments or committed files. No account is created/deleted by this command.
It uses GET only, rejects redirects, checks health/CORS, anonymous `/me` rejection,
synthetic owner identity and `/tasks`/`/today` contracts, and follows the actual
HTML entry → Expo worker → SQLite WASM references. It checks response MIME,
WASM magic, isolation headers, the configured API literal and known QA fixtures.
Output reports stages/counts; failures never print private response bodies or
the bearer. Requests have ten-second limits and bounded response/reference sizes.

Production mode requires non-loopback HTTPS API and web targets. A localhost
preview cannot pass as production. A passing smoke establishes these checks
only; it does not run a native app, exercise all interactions, prove capacity,
or inspect unreferenced/stale files on a host. Publish only the new build output.

## Guarded local backup/restore rehearsal

This command is deliberately limited to an authorized **isolated test database**:
literal `127.0.0.1` or `::1`, an explicit non-default port above 1023, and a name
such as `campusflow_test` or `campusflow_timetable_test`. Port 5432, remote/DNS
hosts, non-test names and connection override parameters are refused. Optional
`schema` must be a simple SQL identifier. It never drops or truncates the source.

Build the API first. Set `REHEARSAL_DATABASE_URL` from protected local test
configuration, and set `PG_BIN` to a directory containing official `pg_dump` and
`pg_restore` clients for the server's major version (or newer). No service or
PostgreSQL installation is created by the command. Then run:

```text
npm run release:restore-rehearsal
```

CI instead uses `PG_DOCKER_CONTAINER` for its own disposable PostgreSQL service;
dump/restore clients run inside that container against its internal port 5432,
while Prisma accesses the explicitly mapped isolated port. The exported snapshot
must exist on that same server. No password is passed as a command argument.

The tool holds a read-only repeatable-read source snapshot and gives that snapshot
to `pg_dump`. It restores a custom archive into a newly generated
`campusflow_restore_<uuid>` database with `pg_restore --single-transaction`, checks
every application table and migration record by count/content hash, compares
PostgreSQL-rendered constraints/indexes, and runs actual restored readiness.
PostgreSQL's canonical constraint rendering handles equivalent extra parentheses
introduced by dump/restore. Local datasets are limited to 100,000 rows per table;
this is not a general production backup tool. Client operations have 60-second
limits. Cleanup selects only the exact generated database, including on failure.

Private archives/results remain in ignored `.local/restore-rehearsals/run-*`.
Protect that directory with OS access controls; dumps contain authentication and
private test records. Do not upload them with PR/CI evidence. Result JSON contains
only mode, timestamp, counts and cleanup/source-preservation flags. On comparison
failure, the ignored diagnostic contains hashes and schema definitions. A cleanup
failure identifies its disposable database for explicit local recovery.

Before production, the owner must choose and prove encrypted backup storage,
retention, access control, monitoring, RPO/RTO and a restore on the actual host.
This local result cannot establish any of those policies.

## Verified local evidence

Public signup uses `REGISTRATION_MODE=verified` only after the approved SMTP
configuration has passed real delivery acceptance. Production defaults to
`closed`; `preview` is rejected in production. Closed mode preserves ordinary
login for verified users. Local/test mode defaults to preview, preserving current
development accounts without inventing verified timestamps. Remove the example's
explicit preview value when preparing production configuration.

Apply migration `20261011020000_email_verification` before the new API build.
It adds a nullable verification timestamp and private token table, with no legacy
backfill or student data loss. Deploy the API and native client contract update
together: unverified public registration/login returns `verificationRequired`
instead of an access session. Old preview sessions fail public access and are
revoked on verification. Verification returns only `verified`, then requires
ordinary sign-in. Existing encrypted recovery jobs retain their original
associated-data/version format and can survive this additive deployment.

The `/auth/capability` response reports global mode and mail availability.
`/auth/verification/request` requires account email/password; confirmation also
requires the full email code. Real SMTP does not prove source/proxy policy or
native acceptance. ADR 011 supplies mail-independent shared login and
password-challenge limits. The deployed socket/trusted-proxy policy, key
configuration and abuse/capacity monitoring still need hosted acceptance.

Apply additive migration `20261012000000_owned_auth_limits` before the ADR 011
API build. It adds nullable ownership/cascade/index to the existing private rate
table; it creates no student entity or backfill. Password admission commits before
the deletion transaction, then the current password is checked under User lock.
The native client checks restored sessions on startup/foreground and handles a
still-current private 401 through ordinary sign-in and existing cleanup/retry.
Network failure leaves cached reads usable. Deployments must test actual proxy
source identity; forwarding headers are ignored until trust is explicitly configured.

On 2026-10-11, the existing PostgreSQL 18.4 isolated test database was dumped with
the official 18.6 client and restored: **19 tables / 163 records**, identical
content, constraints/indexes and readiness; source preserved and restore removed.
The initial version-17 client was rejected safely before any restore database
was created. Fresh Expo output served on loopback passed API health/CORS,
synthetic identity/daily data and its actual entry, worker and SQLite WASM checks.
These are local preview results. Hosted production and signed-device gates remain
unverified.

The ADR 010 verification build passes 1,759 tests and actual captured-delivery
signup/code-and-password confirmation/ordinary login on the running loopback API.
Its fresh preview artifacts pass health/CORS/private reads, referenced web entry/
worker/WASM isolation and native origin/privacy checks. The Android preview v2
signature verifies; no physical ADB device is attached. A further actual restore
matches **23 tables / 194 synthetic records**, including a live private verification
token, while preserving the source and removing the disposable restore database.
Responsive browser geometry and empty-form/account-return behavior pass at
320/390/1100px with 46px controls. Screenshot capture and actual browser verification
submission remain unverified; native component/API evidence covers completion.

ADR 011 passes **1,807 tests**, fresh Android/web artifacts and actual two-process
mail-disabled login/password quotas. The running API rejects revoked/expired
credentials and retains saved student data after ordinary login. Actual restore
matches **23 tables / 202 synthetic records**, including live owned quota rows,
with source preservation and generated-restore cleanup. Native ASCII/UTF16
content/origin/privacy scan, preview v2 signature and referenced web asset/API/
SQLite-isolation smoke pass. No ADB device is attached. Browser checks confirm
account continuation and disabled closed signup at 1280px with 46px controls;
new credential submission and hardware session/cleanup acceptance are unverified.
