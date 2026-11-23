# Changelog

## Unreleased

- Gym: a workout left untouched for 30 minutes finishes on its own. Ticked
  sets are saved with the last logged change as the end time, so the forgotten
  idle time is not counted; a workout with no ticked sets is dropped. A save
  that fails keeps the workout on the device for a manual Finish.

- Task templates (ADR 027): save a reusable title, description, estimate and
  up to 30 steps from Tasks → Add template, then use, edit, duplicate or delete
  it under View templates. Using a template opens the task editor prefilled for
  review; the new task keeps no link to the template. Task creation now accepts
  initial checklist steps, saved atomically with the task. Templates appear in
  the account export and are erased with the account. New `TaskTemplate` table
  and `/task-templates` routes.

- Today shows the steps of a one-time task under its row, so they can be ticked
  off without opening Tasks.

- Quick add repeats: `daily`, `every 2 days`, `weekly`, `every other week`,
  `every 2 weeks sat`, `every mon wed` and `every weekday` make the task repeat.
  A weekday repeat without a date starts on the next matching day. On their own,
  "daily", "weekly" and "weekdays" only count as repeats after the title (at the
  end or before a time), so "Weekly report" stays a title.

- Quick add fixes: `midnight` means the end of the named day (23:59), not its
  start; short weekday words such as "sat" or "sun" are dates only after
  on/next/due/by/before, at the end, or before a time, so "Study for SAT" and
  "Buy sun screen" stay plain titles.

- Fixed: a repeating task whose deadline falls after its scheduled day now
  stays on Today on the deadline day until completed, and appears once.

- Fixed: after changing the body-weight unit, the weight field's placeholder
  shows the new unit.

- Fixed: retried food-log saves are serialized so a retry cannot double-log.

- ci: `scripts/ci-local.sh <pr-number>` runs the `ci.yml` steps in Docker
  against a PR's merge ref and posts the `local-verify` status required on
  `main` while GitHub Actions is unavailable.

- More campus events (ADR 026): the Augustana Campus Events calendar (the one
  behind MyUAlberta) and Career Services now appear on Campus. Monthly and yearly
  events are supported for these feeds. A listing that Campus Events repeats from
  a more specific calendar shows once.

- Accessibility: colours meet WCAG AA contrast in light and dark mode (dark mode
  now uses dark text on accents), editors open without sliding when Reduce
  Motion or Remove animations is on, small controls reach 44-point touch
  targets, fixed-size number circles keep their shape at large text sizes, and a
  Help article explains the support. Tests check contrast for every colour pair
  and that every control has a role and a spoken name.

- More Canvas imports (ADR 025): to-dos from the Canvas planner (pages,
  ungraded discussions and the student's own notes) as "Other work", course
  calendar events as private events on Campus and Today, and removal of
  assignments and to-dos deleted in Canvas, with their reminders, once a course
  or the planner was read in full.

- Canvas grades and assessment groups (ADR 024): Canvas sync imports assignment
  groups, points and scores into each course's grade outline. Students can
  group their own assessments ("Quizzes 20%" or by points), change any weight,
  including Canvas ones, and reset Canvas weights. The current grade matches
  Canvas's group-by-group calculation. New `Course.assessmentGroups` column.

- Grade what-if calculator: on a course, try scores for ungraded assessments to
  see the grade so far, what's still needed for the target, or the projected
  final grade. Nothing is saved; `whatIfSummary` in the domain package.

- Canvas tokens: a "Before you connect" disclaimer with a required
  acknowledgement on Settings → Canvas, and a privacy policy update (effective
  27 October 2026) covering what a Canvas connection stores and imports, how the
  token is protected, and how disconnecting and backups treat it.

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
