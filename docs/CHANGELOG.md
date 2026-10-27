# Changelog

## Unreleased

- Canvas grades and assessment groups (ADR 024): Canvas sync imports assignment
  groups, points and scores into each course's grade outline. Students can
  group their own assessments ("Quizzes 20%" or by points), change any weight,
  including Canvas ones, and reset Canvas weights. The current grade matches
  Canvas's group-by-group calculation. New `Course.assessmentGroups` column.

- Grade what-if calculator: on a course, try scores for ungraded assessments to
  see the grade so far, what's still needed for the target, or the projected
  final grade. Nothing is saved; `whatIfSummary` in the domain package.

- Nutrition (ADR 023): food diary with a textured plate view of carbs, protein,
  fiber and fat, Mifflin–St Jeor goals, USDA food search with usual foods first,
  quick add and repeat-yesterday, and the Augustana dining-hall menu with
  per-serving estimates, ½–3 servings and extra protein (Augustana students only,
  switchable). New NutritionProfile, UserFood, FoodLogEntry and DiningMenuDay tables.

- Gym v2 (ADR 022): own programs with an editor (or customize any built-in
  program), an 873-exercise public-domain library with photos and instructions,
  swap/add exercises mid-workout, optional RIR per set, body weight entries, and
  an idempotent openGym backup import (programs, exercises, workouts, weights).

- Self-hosted app updates (ADR 021): installed Android apps download new
  JavaScript from the owner's server on launch, overnight or from Settings → App
  updates, and are offered a new APK when native code changes. Adds
  `expo-updates`, `expo-background-task` and `expo-task-manager`.

- Gym tab (ADR 020): eleven programs by level and emphasis, a workout logger
  with prefilled targets, rest timer and double-progression advice, weekly goal
  and streak, personal bests and history. New `GymEnrollment`/`Workout` tables.

- Privacy policy, terms of use and support pages at
  `/campusflow/legal/`, linked from Help and the sign-up form.

- Timetable import: choose an `.ics` export, preview the detected weekly
  classes (duplicates unselected), and add the ones you keep. Uses the campus
  ICS reader in a new partial mode; adds `expo-document-picker` 55.0.17.

- Web app hosted at `https://workout.vakula-dev.com/campusflow/`, built by
  `scripts/build-hosted-web.mjs` and released atomically by `deploy.sh`.
- Signup open without email verification in production behind
  `ALLOW_UNVERIFIED_SIGNUP=true` (ADR 018); the sign-up screen says reset by
  email is unavailable.

- api/ops: synthetic demo account (`demo@example.com`) seeded through the public
  API with courses, grades, classes, coursework, a study plan, tasks, routines,
  journal entries and a saved campus event, reset nightly.

- ops: API deployed to the owner's server with `deploy.sh`, daily read-back-checked
  backups (`backup.sh`, restore rehearsed once) and a 5-minute readiness watchdog
  (`healthcheck.sh`).

- docs: production audit (`STATE`, `PRODUCT`, `COMPETITORS`, `APIS`, `ROADMAP`,
  `QUESTIONS`) and ADR 017 for owner-authorized deployment.

Earlier history: see merged pull requests and
[the MVP roadmap](development/mvp-roadmap.md).
