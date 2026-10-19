# CampusFlow — current state (audit 2026-10-18)

A summary of what exists today, written as the starting point for production
work. The detailed evidence lives in the linked records; this page does not
replace them.

## What the app does

CampusFlow is a native iOS/Android student planner (Expo/React Native, with a
web export) for University of Alberta Augustana students. The Today screen
combines the student's own classes, coursework, personal tasks, routines, saved
campus events and study sessions into one daily plan.

Implemented, with automated behaviour tests (see [MVP roadmap](development/mvp-roadmap.md)):

| Area | Features |
| --- | --- |
| Today | Derived `GET /today` plan, progress card, quick capture, next-class status, study windows, exams countdown, day-end review |
| Tasks | One-time and repeating tasks, steps (ADR 014), course links, grouped buckets, search |
| Academics | Student-created courses (ADR 015), manual coursework and exams (ADR 003), grade tracking (ADR 016), preparation plans (ADR 005) |
| Schedule | Class timetable with terms/rooms/instructors (ADR 004), weekly planner, month calendar |
| Focus | Task-linked timer, saved history (ADR 006), recovery after termination (ADR 007), weekly study report |
| Routines | Goals with cadence, routine library, streaks and weekly targets |
| Campus | Public Augustana Google Calendar ICS feeds, hourly import, saved events (ADR 008) |
| Wellness | Optional journal check-ins (ADR 012) |
| Reminders | Server reminder intent, local notification reconciliation, quiet hours, morning overview, reminder center |
| Account | Email/password auth (scrypt), password recovery (ADR 009), email verification (ADR 010), session lifecycle (ADR 011), data export, account deletion |
| Help | Offline help and data center |

## Architecture

npm-workspace monorepo ([overview](architecture/overview.md), [ADR 001](adr/001-initial-architecture.md)):

- `apps/mobile`: Expo Router app, TanStack Query, account-scoped SQLite cache.
- `apps/api`: one modular NestJS service with Prisma/PostgreSQL. It is the only
  database and Canvas client.
- `packages/contracts`: Zod DTOs. `packages/domain`: pure date/plan/streak rules.
- `ops/vps`: pinned Node 22 Dockerfile (build and runtime targets), hardened
  Compose file and an Nginx location include.

Data model: 23 Prisma models and 19 migrations. Entities stay separate (User,
Session, PersonalTask, Course, AcademicItem, ClassSchedule, StudyPlan,
FocusSession, Goal/GoalCompletion, Event/SavedEvent/CampusFeedState,
WellnessEntry, Reminder, NotificationPreference, CanvasConnection, plus the
auth token and quota tables).

## What works end to end

- All features above against a local API/PostgreSQL, on the web export, the
  Android emulator and the iOS simulator (CI native gates).
- The production container builds, migrates, passes the HTTP smoke checks and
  restores into a disposable database locally and in CI.

## What is missing or broken

- **API deployed 2026-10-18** at `https://workout.vakula-dev.com/campusflow-api`
  (see the [server runbook](development/server-beta.md)). No web app or
  store build points at it yet.
- **No mail provider, by decision (ADR 018).** Signup is open without email
  verification, and password reset by email is unavailable.
- **Canvas** works with fixtures only; institutional OAuth is unapproved.
- **iOS cold start** has a recorded 20-second watchdog failure in one native run.
- No owner-approved privacy policy, terms or support URL, and no demo account.
- No store signing or distribution channel; Android uses sideloaded preview APKs.

## Technical debt and risks

- Documentation is extensive but dense. The evidence records in
  `production-readiness.md` are long and hard to scan.
- Four unresolved dependency advisories (see `development/dependency-safety.md`).
- Passwords use scrypt rather than argon2/bcrypt. scrypt is an
  OWASP-recommended KDF, so this is acceptable and not a defect.
- Same-host backups only; there is no off-host disaster recovery.
- The server is shared with other apps (2 vCPU / 3.8 GB RAM), so the API runs
  with bounded memory, processes and logs.
