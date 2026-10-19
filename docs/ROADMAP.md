# Production MVP roadmap

Completed feature slices 1–30 are recorded in the
[MVP product roadmap](development/mvp-roadmap.md). This backlog covers what
remains between that feature set and a production MVP that a brand-new student
can install and use. Priority is top to bottom. Blocked items link to
[QUESTIONS.md](QUESTIONS.md).

| # | Task | Size | Status |
| --- | --- | --- | --- |
| 1 | Hosted API on the existing server | L | Done 2026-10-18 |
| 2 | Automated daily backups with a tested restore | S | Done 2026-10-18 |
| 3 | Uptime check and structured error logging | M | Probe done; JSON logging pending |
| 4 | Demo account with realistic sample data | S | Done 2026-10-18 |
| 5 | Hosted web app at `/campusflow/` | M | Done (ADR 018) |
| 6 | Android build against the hosted API, with acceptance on emulator | M | Pending (after 1) |
| 7 | Privacy policy, terms and support pages | M | Draft pending; publish blocked: Q3 |
| 8 | Public signup | M | Done without email (ADR 018) |
| 9 | Import class timetable from an ICS file | M | Pending |
| 10 | Lighthouse 90+ on main web screens | M | Pending |
| 11 | Home-screen next-class/today widget (Android) | L | Pending |
| 12 | Full new-user production run and release report | M | Pending |

## 1. Hosted API on the existing server

*As a student, I want the app to reach a real server so my data syncs without
the developer's PC.*

- The runtime image from a reviewed `main` commit runs on the server under the
  hardened Compose file, bound to loopback, restart `unless-stopped`.
- A dedicated `campusflow` database and role with secrets in a mode-600 env file.
- `https://workout.vakula-dev.com/campusflow-api/health/ready` returns 200; other
  apps on the host stay healthy and unchanged.
- Campus feeds enabled (`CAMPUS_CALENDARS=augustana`) with an observed import.
- Survives `docker restart` and a container recreate; the migration runs only
  after a database backup.

## 2. Backups and restore

*As the owner, I want daily backups I have actually restored once.*

- A daily cron job writes a compressed `pg_dump` of `campusflow` to a root-only
  directory with 14-day retention.
- One restore into a generated disposable database is verified (table/row
  counts match), then that database is removed.
- Documented in the runbook. Off-host copies stay a separate, recorded gap.

## 3. Monitoring

- Liveness/readiness are probed every 5 minutes with failures logged; a
  restart-on-failure policy is in place.
- API errors are logged as structured JSON with no secrets or bodies; Docker
  log rotation is bounded.

## 4. Demo account

- A script provisions a synthetic demo user with courses, classes, coursework,
  tasks, routines and journal entries relative to "today", without printing
  credentials. It is idempotent (re-running resets the data) and removable.

## 5. Hosted web app

- The Expo web export is served over HTTPS with the COOP/COEP headers, uses the
  hosted API and can be added to the home screen.
- Core screens read from cache offline after first load.

## 6. Android against the hosted API

- A signed preview APK built with the hosted API URL, with the API origin
  verified inside the APK, and sign-in/Today/task/reminder checks on the emulator.

## 7. Legal pages

- Drafts of the privacy policy, terms and support pages, accurate to actual data
  handling. Published at configurable URLs and linked from Help and Settings.
  No university branding.

## 8. Public signup

- `REGISTRATION_MODE=verified` with a real SMTP provider. Signup, verification,
  password reset and the deliverability of each are observed in production.

## 9. ICS timetable import

*As a student, I want to import my class schedule file instead of typing every
class.*

- Upload/pick an `.ics` file, preview the detected weekly classes, edit them and
  save as ordinary ClassSchedule records. Duplicates are detected; invalid files
  get a clear error.

## 11. Widget

- An Android home-screen widget showing the next class and the count due today,
  refreshed from the cache.
