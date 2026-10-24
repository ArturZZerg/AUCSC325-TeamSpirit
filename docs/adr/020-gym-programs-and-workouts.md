# ADR 020 — Gym programs and recorded workouts

Status: Accepted.

Date: 2026-10-23

## Context

Students asked for strength training inside CampusFlow instead of a separate
app. The owner's earlier Telegram workout tool proved the useful core: a fixed
program, previous weights on every exercise, double-progression hints and a
weekly rhythm. That tool is Python/SQLite (and its later openGym deployment is
AGPL upstream code), so nothing is copied; only the owner's own rules are
re-expressed in TypeScript. ToR section 15 covers lightweight wellness; gym
training is a product extension of it and stays separate from Goal/WellnessEntry.

## Decision

- Add a sixth tab, **Gym**. Programs and the exercise library are static
  product content in `packages/domain` (`gym-catalog.ts`): eleven programs for
  beginner/intermediate/advanced levels, women-, men- and anyone-oriented
  emphasis, and gym, dumbbell-only or no-equipment settings. They are not
  stored per account and need no seed or migration to change.
- Pure rules in `packages/domain/src/gym.ts`: double progression advice,
  rotation to the next program day (skipped days are never lost), Monday-based
  account-local weekly consistency with a streak of weeks meeting the target,
  estimated session length, unit conversion and personal bests (Epley estimate).
- Two account-owned tables. `GymEnrollment` (one per user) holds the program,
  kg/lb unit and weekly target. `Workout` holds UTC start/end instants, the
  entered unit, a captured title and a JSONB array of exercises and sets,
  validated by `workoutSchema` on read and write. Sets are JSON because they are
  only ever read as part of their workout; no per-set query exists.
- The API validates catalog ids, that each exercise belongs to the chosen day,
  and the load kind (bodyweight sets carry no weight). Saves are idempotent by
  per-account request key with a payload hash, serialized by the existing
  account-first lock, exactly like FocusSession (ADR 006). Workouts may not end
  more than 30 s in the future. `GET /gym` returns the last 120 days (max 200)
  for progression, rotation and the week view.
- The workout in progress is device state (Zustand) mirrored to the
  account-scoped SQLite cache, so navigation or app restart keeps it; sign-out
  clears it with every other snapshot. Only Finish sends it. A failed save keeps
  the draft and its key, so retrying cannot duplicate. No offline write queue.
- Account export includes the enrollment and workouts; account erasure cascades.
- Workouts do not appear in `GET /today`. A later ADR may add a derived
  "today's workout" plan item.

## Consequences

Programs can be tuned by editing the catalog; saved workouts keep their ids, so
removing an exercise from a day only affects future workouts. Advice is advisory:
the student always records what they actually lifted. Device and native
acceptance (keyboard, vibration on rest end) remain separate gates.
