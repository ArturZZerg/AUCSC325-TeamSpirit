# Initial server and native beta

The owner authorized existing-server hosting on 2026-10-12. Read-only discovery
verified `root@95.217.239.38`, valid HTTPS on `workout.vakula-dev.com`, Nginx,
PostgreSQL 16.15, Docker and Node 18. Preserve its existing applications.
[ADR 013](../adr/013-initial-server-beta.md) records the temporary hosting policy;
eventual Supabase hosting and all application boundaries remain intact.

## Prepared release

`ops/vps/Dockerfile` pins the inspected Node 22.23.3 Debian image by digest,
uses the single root lockfile for API/shared workspaces, generates Prisma and
builds shared/API code. The `build` target retains migration tooling; `runtime`
has pruned production dependencies and runs as `node`, without API test output.
`.dockerignore` limits context to those workspaces/configuration and excludes
environment files, generated output and local data. The owner chose to keep
source local after a prepared source transfer was rejected by automatic approval
review. Do not transfer the source archive or build source on the server. A
locally built runtime image contains readable compiled JavaScript and needs
separate explicit approval before transfer. Keep protected server environment
files outside its release directory/image.
An optional `build_ca` BuildKit mount supplies public certificates from an
already trusted development network. It never includes private keys or persists
in either image; TLS verification stays enabled. Ordinary hosting builds need
no mount. CI builds the runtime and checks real production readiness/closed
signup against its own disposable database before continuing web/restore gates.

Build/tag both targets by the reviewed commit, never overwrite an accepted tag:

```sh
docker build -f ops/vps/Dockerfile --target build -t campusflow-build:<commit> .
docker build -f ops/vps/Dockerfile --target runtime -t campusflow-api:<commit> .
```

Create only the dedicated `campusflow` PostgreSQL database and non-superuser
`campusflow` login; do not reuse another application's role/database. Generate
its password and the independent authentication key directly into root-owned
`/etc/campusflow/api.env` with mode 600. Never print them or put them in arguments,
Dockerfiles, APKs, source or PRs. Protected configuration must contain:

| Setting | Initial beta value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST`, `PORT` | `127.0.0.1`, `8780` |
| `DATABASE_URL` | Dedicated local PostgreSQL database/role, bounded connection pool |
| `CORS_ORIGIN` | `https://workout.vakula-dev.com` |
| `AUTH_RATE_KEY` | Independent stable random 32-byte canonical base64 secret |
| `AUTH_SOURCE_MODE` | `loopback` |
| `REGISTRATION_MODE` | `closed` |
| `RECOVERY_DELIVERY`, `CANVAS_MODE` | `disabled` |

After backing up the dedicated database, run reviewed migrations with the build
image and protected environment file. Inspect actual readiness before publication.
Set `CAMPUSFLOW_IMAGE` to the accepted immutable runtime image for
`docker compose -f ops/vps/compose.yaml up -d`. The Compose template bounds
resources/logs, drops capabilities and uses a non-root read-only runtime.

## HTTPS and source quotas

Back up the existing Nginx configuration. Install the reviewed
`ops/vps/nginx-location.conf` and include it **inside only the authorized HTTPS
server block**. Check `nginx -t` before reload. The new `/campusflow-api/` path
proxies to loopback port 8780, replacing forwarded client headers. Preserve every
existing route; compare existing health/public pages before and after reload.
Native builds use `https://workout.vakula-dev.com/campusflow-api` without a trailing
slash. This temporary hostname/path is not a new commercial brand/domain.

The source policy defaults to the socket. Opt-in loopback mode requires explicit
loopback binding and accepts exactly one valid IP only from an actual loopback
peer. The proxy must overwrite the header; local applications/admins are trusted.
Test forged/chained headers via the actual HTTPS route and verify private quota
records without printing addresses, keys or request bodies. General proxy trust
must remain disabled. Closed signup and disabled mail are intentional launch
limits; a synthetic acceptance account is not proof of mailbox delivery.

## Acceptance and rollback

Record source commit/image digest, configuration setting names (not secrets),
migration/readiness result, HTTPS live/ready and anonymous rejection, actual
synthetic authenticated reads/writes, container UID/binding/resource limits,
unchanged other-app health, and restart persistence. Rehearse encrypted backup
restore into an exact generated disposable database on this host; preserve the
source. Daily same-host backups alone do not establish off-host recovery.

Build a fresh signed Android preview with the chosen HTTPS API before installing
with `adb install -r`; preserve existing app data and do not silently uninstall
on a signature conflict. Test ordinary sign-in, Today/task/journal mutations,
force-stop/relaunch, offline cold reads, reconnection, reminders and malformed
incoming links on the supplied device. Verify real scheduled/delivered/cancelled
notifications; source tests and a signed APK do not establish this behavior.

Rollback the new container to the previous accepted image and restore only the
new Nginx include/configuration if needed. Do not roll back PostgreSQL by deleting
student records or discard the active database. A schema/data rollback requires
a separately reviewed plan. Remove only an identity-verified disposable restore
database. Never stop unrelated applications or run broad Docker cleanup.

Current local evidence: both image targets build, all twelve migrations apply
to a dedicated synthetic PostgreSQL 17 database, and the non-root read-only
runtime passes fifteen HTTP requests covering readiness, closed signup,
anonymous rejection, ordinary login, owned tasks/Today, revisioned journal
editing and private export. A guarded restore preserves 23 tables/23 synthetic
records and removes only its generated restore database. The final root check
passes 1,907 tests, lint, boundary/schema checks, types and builds.

The Pixel is unlocked and the signed preview is installed with existing app
data retained. Ordinary native sign-in, Today, native task creation (25-minute
estimate/date-only deadline), and journal editing (optional ratings/note,
revision 5) reach the authoritative local API. The first local rebuild
reused the earlier HTTPS JavaScript bundle despite selecting a local API. The
preview workflow now reruns only the release bundle task. Metro partitions its
transforms by the selected API because Expo suppresses reset-cache in CI mode;
native compile caches remain reusable. Verify the API inside the resulting APK
after an origin change before installation. Its local API uses ADB reverse,
so this does not establish independent hosting.
The corrected APK passes origin/privacy inspection and v2 signature verification
(SHA-256 `3BAC903B4416FEED6C46D9F07382A00619DAFF3291AAB8F1D0569790BB83F838`).
Offline/lifecycle/reminder acceptance is continuing. Device inspection also finds
the standalone journal header under the Android status bar; fixing standalone
screen insets is the next separate slice. The HTTPS preview is built but its
endpoint is not deployed. No source was
uploaded, and no CampusFlow server service/database/route was installed.
Production availability, mail, iOS, store and backup policy remain unverified.

## Deployed state (2026-10-18, ADR 017)

`main` @ `59bd8c0258e4` runs as `campusflow-api` (Compose project `campusflow`)
at `https://workout.vakula-dev.com/campusflow-api`. Observed: readiness 200,
closed signup capability, anonymous `/today` 401, ready again after
`docker restart`, non-root `node` user, read-only root, 768 MB / 128-pid limits,
loopback-only `127.0.0.1:8780`, and the four existing host routes unchanged (200
before and after the Nginx reload). `CAMPUS_CALENDARS=augustana` imported 91
events. The Nginx include sits only in the HTTPS server block; the pre-change
site file is backed up under `/var/backups/campusflow/`.

Operations, all from the repository's `ops/vps/`:

- `deploy.sh` (run locally from a clean, pushed `main`) builds and transfers
  commit-tagged images, backs up, migrates, recreates and smoke-tests, and
  rolls back the image if the new container is not ready. On a network with
  TLS inspection, pass the inspecting proxy's **public** root certificate as
  `BUILD_CA`.
- `backup.sh`: root cron at 03:40 UTC writes verified `pg_dump` custom-format
  files to `/var/backups/campusflow` (mode 700) with 14-day retention. A restore
  into a generated `campusflow_restore_*` database matched the source (18
  migrations, 91 events, 24 tables) and was then dropped.
- `healthcheck.sh`: root cron every 5 minutes logs readiness failures to
  `/var/log/campusflow-health.log`, and restarts only this container once Docker
  marks it unhealthy.

Still open: an authenticated production smoke (needs the demo account), off-host
backups, mail, and public signup.
