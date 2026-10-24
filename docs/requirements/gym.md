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
