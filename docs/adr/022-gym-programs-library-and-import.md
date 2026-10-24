# ADR 022 — Own programs, exercise library, body weight and openGym import

Status: Accepted.

Date: 2026-10-23

Extends [ADR 020](020-gym-programs-and-workouts.md).

## Context

ADR 020 shipped a fixed catalog of programs. The owner trains with a personal
Push/Pull/Legs program in a self-hosted openGym (41 workouts, own exercises,
notes, RIR per set, weights in lb, daily body weight) and wants to train from
CampusFlow instead, with openGym's main features: own editable programs,
statistics and body weight, and exercise demonstrations.

openGym's code is AGPL and its exercise animations have unresolved ownership
(its own NOTICE declines to redistribute them), so neither is copied. Its data
belongs to the owner and is imported. ExerciseDB names reach openGym under MIT
(via hasaneyldrm/exercises-dataset) and are used only to translate imported
exercise ids into English names, with the notice kept.

## Decision

- **Exercise library.** [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
  (Unlicense, 876 exercises, two photos each) is converted by
  `scripts/build-exercise-library.mjs` into a slim index in `packages/domain`
  (id, name, equipment, load kind, primary/secondary muscles, level, category).
  Instructions and photos stay out of the app bundle: the API serves
  instructions, and photos are synced to the owner's server and shown as a
  two-frame start/finish animation. Built-in catalog exercises gain a `mediaId`
  into this library. Muscles are normalised to one CampusFlow list.
- **Own exercises and programs.** `UserExercise` (name, equipment, load kind,
  muscles, note, optional `mediaId`, optional unique `sourceKey`) and
  `UserProgram` (name, JSONB days of prescribed exercises, validated by
  contracts). A program day may be `archived`: kept for history, skipped by the
  rotation. Enrollment may point at a catalog program or an own program of the
  same account; deleting the enrolled program removes the enrollment. Exercise
  ids are resolved catalog → library → own exercise.
- **Workouts.** A set may carry RIR (0–5). A saved exercise must be known to the
  account (catalog, library or own) and match its load kind; it no longer has to
  be in the chosen day, so a student can swap or add exercises mid-workout.
- **Body weight.** `BodyWeightEntry` (one per account calendar date, value and
  unit). It feeds stats now and nutrition goals later (ADR 023).
- **openGym import.** `POST /gym/import/opengym` accepts an openGym state or
  backup JSON (read as a bounded raw body, ≤ 4 MB) and is idempotent:
  exercises by `sourceKey = opengym:<id>`, workouts by request key
  `opengym-<id>`, body weight by date, the program by `sourceKey`. Scheduled
  routines become program days in weekday order; other routines referenced by
  history become archived days. Only completed sets are imported. The owner can
  run it from Settings with a file, or once from the server.
- **Statistics** are derived on the device from saved workouts (no stored
  aggregates): per-exercise best estimated 1RM and top set over time, personal
  records, a training calendar heatmap, weekly sets per muscle and the body
  weight trend.

## Consequences

The library index adds roughly 120 kB to the app bundle. Photos depend on the
owner's server; without them the app falls back to text instructions. Imported
names come from ExerciseDB's English names where openGym referenced its ids;
other imported exercises keep the owner's own names and can be renamed.
