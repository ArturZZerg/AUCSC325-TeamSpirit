import { Temporal } from '@js-temporal/polyfill';
import type { GymExercise, PrescribedExercise, ProgramDay, TrainingProgram } from './gym-catalog';

export * from './gym-catalog';
export * from './exercise-library';

type DateOnly = string;
export type WeightUnit = 'kg' | 'lb';
export interface LoggedSet { weight: number | null; reps: number; rir?: number | null }
export interface LoggedExercise { exerciseId: string; sets: readonly LoggedSet[] }
/** A saved workout as the rules need it; timestamps are UTC instants. */
export interface LoggedWorkout { programId: string; dayId: string; endedAt: string; unit: WeightUnit; exercises: readonly LoggedExercise[] }
export interface LastPerformance { date: DateOnly; sets: LoggedSet[] }
export type ProgressionKind = 'first' | 'returning' | 'increase' | 'build' | 'hold';
export interface ProgressionAdvice { kind: ProgressionKind; message: string; targets: LoggedSet[] }

const poundsPerKg = 2.20462;
/** Weights are shown to the nearest half unit; plates and dumbbells are never finer. */
export const roundWeight = (value: number): number => Math.round(value * 2) / 2;
export const convertWeight = (value: number, from: WeightUnit, to: WeightUnit): number =>
  from === to ? value : roundWeight(to === 'kg' ? value / poundsPerKg : value * poundsPerKg);
/** Smallest sensible jump for each kind of equipment. */
export const weightStep = (exercise: Pick<GymExercise, 'equipment' | 'load'>, unit: WeightUnit): number => {
  if (exercise.load === 'added') return unit === 'kg' ? 2.5 : 5;
  const steps = { barbell: [2.5, 5], dumbbell: [2, 5], machine: [5, 10], cable: [2.5, 5], bodyweight: [2.5, 5], kettlebell: [4, 10], band: [1, 5], other: [2.5, 5] } as const;
  return steps[exercise.equipment][unit === 'kg' ? 0 : 1];
};
const formatWeight = (value: number, unit: WeightUnit) => `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
const daysBetween = (from: DateOnly, to: DateOnly) => Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days;
const localDate = (instant: string, timeZone: string) => Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDate().toString();

/** Most recent saved sets for an exercise in any program, converted to the requested unit. */
export function lastPerformance(workouts: readonly LoggedWorkout[], exerciseId: string, unit: WeightUnit, timeZone: string): LastPerformance | undefined {
  const latest = [...workouts].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))
    .find(workout => workout.exercises.some(item => item.exerciseId === exerciseId && item.sets.length > 0));
  const entry = latest?.exercises.find(item => item.exerciseId === exerciseId);
  if (!latest || !entry) return undefined;
  return { date: localDate(latest.endedAt, timeZone), sets: entry.sets.map(set => ({ reps: set.reps,
    weight: set.weight === null ? null : convertWeight(set.weight, latest.unit, unit) })) };
}

/**
 * Double progression: keep the weight until every prescribed set reaches the top
 * of the rep range, then add the smallest step and return to the bottom of the
 * range. Advice is a suggestion; the student always enters what they lifted.
 */
export function progressionAdvice(prescription: PrescribedExercise, exercise: GymExercise, last: LastPerformance | undefined,
  today: DateOnly, unit: WeightUnit): ProgressionAdvice {
  const { sets: count, repMin: low, repMax: high } = prescription;
  const start = exercise.load === 'added' ? 0 : null;
  const range = `${count} × ${low}–${high}`;
  if (!last) return { kind: 'first', targets: Array.from({ length: count }, () => ({ weight: start, reps: low })),
    message: exercise.load === 'bodyweight' ? `Aim for ${range} with good form. Your first session sets the baseline.`
      : `Pick a weight you can lift for ${range} with 1–2 reps to spare. Your first session sets the baseline.` };
  const done = last.sets.slice(0, count);
  const weight = exercise.load === 'bodyweight' ? null : done[0]?.weight ?? start;
  const same = done.every(set => set.weight === weight);
  const fill = (reps: (index: number) => number) => Array.from({ length: count }, (_, index) => ({ weight, reps: reps(index) }));
  if (daysBetween(last.date, today) >= 21) return { kind: 'returning', targets: fill(() => low),
    message: 'Welcome back! Start at your last weight for the bottom of the range and leave a few reps in the tank. Drop the weight if it feels heavy.' };
  if (done.length >= count && same && done.every(set => set.reps >= high)) {
    if (weight === null) return { kind: 'increase', targets: fill(() => high),
      message: 'You hit the top of the range on every set. Make it harder: slow the lowering phase to 3 seconds or move to a harder variation.' };
    const next = roundWeight(weight + weightStep(exercise, unit));
    return { kind: 'increase', targets: Array.from({ length: count }, () => ({ weight: next, reps: low })),
      message: `Every set reached ${high} reps — time to level up. Try ${formatWeight(next, unit)} for ${low}+ reps if your form stayed clean.` };
  }
  if (done.some(set => set.reps < low)) return { kind: 'hold', targets: fill(() => low),
    message: weight === null ? `Some sets fell below ${low} reps. Rest a little longer and focus on clean reps.`
      : `Some sets fell below ${low} reps. Stay at ${formatWeight(weight, unit)} and focus on clean reps; if it happens again, go a little lighter.` };
  const targets = fill(index => Math.min(Math.max(done[index]?.reps ?? low, low), high));
  if (!same) return { kind: 'build', targets, message: 'Your weights varied last time. Repeat what you managed and settle on one working weight.' };
  if (done.length < count) return { kind: 'build', targets, message: `Last time you logged ${done.length} of ${count} sets. Aim to complete all ${count} today.` };
  const weakest = targets.reduce((best, set, index) => set.reps < high && (best < 0 || set.reps < targets[best].reps) ? index : best, -1);
  if (weakest >= 0) targets[weakest] = { ...targets[weakest], reps: targets[weakest].reps + 1 };
  return { kind: 'build', targets, message: weakest >= 0
    ? `Same weight, one more rep on set ${weakest + 1}. Small wins add up.`
    : `Complete all ${count} sets at the same weight to unlock the next step.` };
}

/** Days that take part in the rotation; archived days only keep history readable. */
export const activeDays = (program: TrainingProgram): readonly ProgramDay[] => {
  const active = program.days.filter(day => !day.archived);
  return active.length ? active : program.days;
};
/** The next active day after the latest workout of this program; skipped days are never lost. */
export function nextProgramDay(program: TrainingProgram, workouts: readonly LoggedWorkout[]): ProgramDay {
  const days = activeDays(program);
  const latest = [...workouts].filter(workout => workout.programId === program.id && days.some(day => day.id === workout.dayId))
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))[0];
  const index = latest ? days.findIndex(item => item.id === latest.dayId) : -1;
  return days[(index + 1) % days.length];
}

/** Approximate session length: a short warm-up, about 40 seconds of work per set plus the prescribed rest, and a minute to set up each exercise. */
export const estimateDayMinutes = (day: ProgramDay): number =>
  Math.max(10, Math.round((300 + day.exercises.reduce((total, item) => total + 60 + item.sets * (40 + item.restSeconds), 0)) / 60 / 5) * 5);
export const estimateProgramMinutes = (program: TrainingProgram): number =>
  Math.round(activeDays(program).reduce((total, day) => total + estimateDayMinutes(day), 0) / activeDays(program).length / 5) * 5;

export interface GymWeekDay { date: DateOnly; workouts: number }
export interface GymWeek { from: DateOnly; days: GymWeekDay[]; count: number; target: number; streakWeeks: number }
/**
 * Monday-based account-local week. The streak counts consecutive previous weeks
 * that met the weekly target, plus this week once it is met; an unfinished
 * current week never breaks it.
 */
export function gymWeek(workouts: readonly Pick<LoggedWorkout, 'endedAt'>[], today: DateOnly, timeZone: string, target: number): GymWeek {
  const monday = Temporal.PlainDate.from(today).subtract({ days: Temporal.PlainDate.from(today).dayOfWeek - 1 });
  const perWeek = new Map<string, number>(), perDay = new Map<string, number>();
  for (const workout of workouts) {
    const date = Temporal.PlainDate.from(localDate(workout.endedAt, timeZone));
    const week = date.subtract({ days: date.dayOfWeek - 1 }).toString();
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1); perDay.set(date.toString(), (perDay.get(date.toString()) ?? 0) + 1);
  }
  const days = Array.from({ length: 7 }, (_, offset) => { const date = monday.add({ days: offset }).toString(); return { date, workouts: perDay.get(date) ?? 0 }; });
  const count = perWeek.get(monday.toString()) ?? 0;
  let streakWeeks = count >= target ? 1 : 0;
  for (let week = monday.subtract({ weeks: 1 }), guard = 0; guard < 104 && (perWeek.get(week.toString()) ?? 0) >= target; week = week.subtract({ weeks: 1 }), guard++) streakWeeks++;
  return { from: monday.toString(), days, count, target, streakWeeks };
}

/** Epley estimate; only meaningful for loaded sets of 12 reps or fewer. */
export const estimatedOneRepMax = (set: LoggedSet): number | null =>
  set.weight !== null && set.weight > 0 && set.reps <= 12 ? set.weight * (1 + set.reps / 30) : null;
const bestEstimate = (sets: readonly LoggedSet[], from: WeightUnit, to: WeightUnit) => Math.max(0, ...sets
  .map(set => estimatedOneRepMax({ ...set, weight: set.weight === null ? null : convertWeight(set.weight, from, to) }) ?? 0));
/** Exercises in `workout` whose best estimated one-rep max beats every earlier saved workout. */
export function personalBests(workout: LoggedWorkout, earlier: readonly LoggedWorkout[]): string[] {
  return workout.exercises.filter(entry => {
    const current = bestEstimate(entry.sets, workout.unit, workout.unit);
    const previous = earlier.filter(item => Date.parse(item.endedAt) < Date.parse(workout.endedAt))
      .map(item => bestEstimate(item.exercises.find(other => other.exerciseId === entry.exerciseId)?.sets ?? [], item.unit, workout.unit));
    return current > 0 && previous.some(value => value > 0) && previous.every(value => current > value);
  }).map(entry => entry.exerciseId);
}
/** Total lifted load in the workout's unit; bodyweight sets add nothing. */
export const workoutVolume = (exercises: readonly LoggedExercise[]): number =>
  Math.round(exercises.reduce((total, entry) => total + entry.sets.reduce((sum, set) => sum + (set.weight ?? 0) * set.reps, 0), 0));
