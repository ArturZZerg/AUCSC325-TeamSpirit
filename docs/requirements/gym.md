# Gym

Product extension of ToR 15 (wellness); architecture in
[ADR 020](../adr/020-gym-programs-and-workouts.md).

- **Choose a program.** The Gym tab lists eleven built-in programs filtered by
  experience (beginner, intermediate, advanced), emphasis (for women, for men,
  everyone; unisex programs always stay visible) and setting (gym, dumbbells,
  no equipment). A program page shows its days, exercises, sets × reps, rest,
  cues and tips; the student picks kg or lb and a weekly goal (1–7).
- **Know what is next.** The tab shows the next day in the rotation after the
  last workout of the program, its exercises and estimated length, and lets the
  student pick a different day.
- **Log fast.** Every set is prefilled from the progression target, so a typical
  set is one tap. Ticking a set starts the prescribed rest timer (+30 s, skip,
  vibration at the end). Sets can be added/removed and a note attached. The
  workout survives navigation and app restart and is saved only on Finish.
- **Progress.** Each exercise shows the last result and advice: first session,
  add one rep to the weakest set, increase by the equipment step once every set
  reaches the top of the range, hold after reps below the range, or ease back in
  after three weeks away. Bodyweight exercises suggest a harder variation.
- **Stay consistent.** A Monday-based week view with the weekly goal, progress
  bar and a streak of weeks that met the goal; an unfinished week never breaks
  it. Finishing shows time, sets, volume and new personal bests.
- **History.** Recent workouts expand to their sets and can be deleted.

Evidence: `packages/domain/__tests__/gym.test.ts`,
`packages/contracts/__tests__/gym.test.ts`, `apps/api/test/gym-db.spec.ts`
(idempotent concurrent saves, ownership, validation, export, erasure),
`apps/mobile/__tests__/gym-feature.test.ts`, `gym-screen.test.tsx` and
`workout-screen.test.tsx`; browser walk-through on Expo web at phone width.

## Own programs, library and import (ADR 022)

- **Own programs.** Create a program from scratch or "Customize as my own" on any
  built-in program: name, days (reorder, archive, delete; at least one active),
  exercises per day with sets, rep range, rest and a note. Enroll like any program.
- **Exercise library.** 873 public-domain exercises (free-exercise-db) searchable
  by name prefix, muscle and equipment, with photos and step-by-step
  instructions; students can create their own exercises.
- **Flexible workouts.** Swap or add exercises during a workout; optional RIR
  (reps in reserve) per set when "Track effort" is on.
- **openGym import.** Settings → Gym → Import from openGym takes an openGym
  backup and adds the program, exercises (English names, merged copies), every
  completed strength set, RIR and body weights. Repeating it adds nothing twice.

Evidence: `packages/domain/__tests__/gym.test.ts` (library),
`packages/contracts/__tests__/gym.test.ts`, `apps/api/test/opengym-import.spec.ts`,
`apps/api/test/gym-db.spec.ts`, `apps/mobile/__tests__/program-editor.test.tsx`,
`gym-feature.test.ts`; browser walk-through with a real openGym backup.

## Saved opening hours — 2026-11-22

Gym → Set gym hours saves a weekly schedule independently of program enrollment.
Each Monday–Sunday entry is Open (24-hour opening/closing times), Closed, or Not
set. Weekdays and weekends can differ. A closing time before opening means the
following day (Saturday 20:00–02:00 ends Sunday). Closed means no new opening on
that day; it does not shorten a previous day's overnight period. The explicit
IANA timezone defaults to the account zone and can be changed for the gym.
Equal opening/closing times are rejected as ambiguous; 24-hour operation and
split opening periods are outside this small extension.

The Gym section displays the saved schedule and timezone, including closed and
unknown days. Missing schedules are explicitly labelled. Cancel never writes;
failed saves preserve the draft for retry; saving disables edits and dismissal.
An acknowledged save remains visible while waiting for a fresh overview.

Persistence uses one nullable `User.gymOpeningHours` JSONB preference, validated
by contracts; no new service or table. Authenticated `PUT /gym/opening-hours`
accepts `{ openingHours: { timeZone, days } }`, or null to remove saved hours.
`GET /gym` includes `openingHours`; old cached records without that optional
field still load as unknown. The existing account-scoped Gym cache and mutation
refresh are reused. Account export includes `gymOpeningHours`; erasure removes
it with the account. Apply migration `20261122000000_gym_opening_hours` before
deploying the API; regenerate Prisma and the readiness schema manifest.

Inspection found program rotation, suggested weekly rhythms and recorded workout
history, but no future workout date/time scheduler. Requirement 3's conditional
out-of-hours warning therefore does not apply. No workout scheduler is added.

### Focused validation

```sh
npm run db:generate
npm run schema:manifest
npm run build:shared
npm run test -w @campusflow/contracts -- --runInBand --runTestsByPath __tests__/gym-opening-hours.test.ts __tests__/gym.test.ts __tests__/account.test.ts
npm run test -w @campusflow/mobile -- --runTestsByPath __tests__/gym-opening-hours.test.tsx __tests__/gym-screen.test.tsx __tests__/gym-feature.test.ts
# DATABASE_URL pointed only at an isolated temporary PostgreSQL instance:
npm run db:migrate
npm run test -w @campusflow/api -- --runTestsByPath test/gym-db.spec.ts test/account-db.spec.ts test/health-db.spec.ts
npm run typecheck -w @campusflow/contracts
npm run typecheck -w @campusflow/api
npm run typecheck -w @campusflow/mobile
node scripts/check-boundaries.mjs
node scripts/schema-manifest.mjs --check
git diff --check
```

Results: 31 contract, 18 mobile and 23 real PostgreSQL API tests passed (72 total).
Targeted ESLint on changed TypeScript/TSX files, all three workspace typechecks,
shared builds, boundary and readiness-manifest checks passed. All migrations
applied successfully on the disposable database, which was stopped afterward.

New cases verify different weekday/weekend hours, overnight/closed/unknown days,
invalid/equal times and zones, legacy cached records, editing/removal, pending
controls, cancel, failed-save retry, stale overview after acknowledged save,
account isolation, export, enrollment independence and anonymous-write rejection.
Expected and actual results agree. No existing product defects confirmed.
Full suites and native visual/device checks were not run. Next step: review and
check the editor on a phone before deploying the migration and API.
