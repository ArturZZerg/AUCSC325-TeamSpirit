import { Temporal } from '@js-temporal/polyfill';
import { resolveExercise } from './exercise-library';
import { convertWeight, estimatedOneRepMax, type LoggedWorkout, type WeightUnit } from './gym';
import type { GymExercise, Muscle } from './gym-catalog';

type DateOnly = string;
const localDate = (instant: string, timeZone: string) => Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDate();
const round = (value: number) => Math.round(value * 10) / 10;

/** Statistics are derived from saved workouts on the device; nothing is stored (ADR 022). */
export interface ExercisePoint { date: DateOnly; topWeight: number | null; bestOneRepMax: number | null; bestReps: number; volume: number; sets: number }
export function exerciseHistory(workouts: readonly LoggedWorkout[], exerciseId: string, unit: WeightUnit, timeZone: string): ExercisePoint[] {
  return [...workouts].sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt)).flatMap(workout => {
    const entry = workout.exercises.find(item => item.exerciseId === exerciseId);
    if (!entry?.sets.length) return [];
    const sets = entry.sets.map(set => ({ ...set, weight: set.weight === null ? null : convertWeight(set.weight, workout.unit, unit) }));
    const weights = sets.map(set => set.weight).filter((value): value is number => value !== null);
    const estimates = sets.map(estimatedOneRepMax).filter((value): value is number => value !== null);
    return [{ date: localDate(workout.endedAt, timeZone).toString(), topWeight: weights.length ? Math.max(...weights) : null,
      bestOneRepMax: estimates.length ? round(Math.max(...estimates)) : null, bestReps: Math.max(...sets.map(set => set.reps)),
      volume: Math.round(sets.reduce((sum, set) => sum + (set.weight ?? 0) * set.reps, 0)), sets: sets.length }];
  });
}

export interface PersonalRecord { exerciseId: string; name: string; date: DateOnly; weight: number | null; reps: number; oneRepMax: number | null; sessions: number }
/** Best set per exercise: highest estimated 1RM when loaded, otherwise most reps. Most-trained first. */
export function personalRecords(workouts: readonly LoggedWorkout[], unit: WeightUnit, timeZone: string, own: readonly GymExercise[] = []): PersonalRecord[] {
  const records = new Map<string, PersonalRecord>();
  for (const workout of workouts) for (const entry of workout.exercises) {
    const name = resolveExercise(entry.exerciseId, own)?.name;
    if (!name) continue;
    let current = records.get(entry.exerciseId);
    if (current) current.sessions++;
    for (const set of entry.sets) {
      const weight = set.weight === null ? null : convertWeight(set.weight, workout.unit, unit);
      const oneRepMax = estimatedOneRepMax({ weight, reps: set.reps });
      const better = !current || (oneRepMax !== null ? oneRepMax > (current.oneRepMax ?? 0) : current.oneRepMax === null && set.reps > current.reps);
      if (better) {
        current = { exerciseId: entry.exerciseId, name, date: localDate(workout.endedAt, timeZone).toString(), weight, reps: set.reps,
          oneRepMax: oneRepMax === null ? null : round(oneRepMax), sessions: current?.sessions ?? 1 };
        records.set(entry.exerciseId, current);
      }
    }
  }
  return [...records.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export interface HeatmapDay { date: DateOnly; workouts: number; sets: number; future: boolean }
/** Monday-based weeks ending with the current week, oldest first; each inner array is Monday..Sunday. */
export function trainingHeatmap(workouts: readonly LoggedWorkout[], today: DateOnly, timeZone: string, weeks = 16): HeatmapDay[][] {
  const counts = new Map<string, { workouts: number; sets: number }>();
  for (const workout of workouts) {
    const key = localDate(workout.endedAt, timeZone).toString(), value = counts.get(key) ?? { workouts: 0, sets: 0 };
    counts.set(key, { workouts: value.workouts + 1, sets: value.sets + workout.exercises.reduce((sum, entry) => sum + entry.sets.length, 0) });
  }
  const end = Temporal.PlainDate.from(today), monday = end.subtract({ days: end.dayOfWeek - 1 });
  return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, day) => {
    const date = monday.subtract({ weeks: weeks - 1 - week }).add({ days: day }), key = date.toString();
    return { date: key, workouts: counts.get(key)?.workouts ?? 0, sets: counts.get(key)?.sets ?? 0, future: Temporal.PlainDate.compare(date, end) > 0 };
  }));
}

/** Sets per muscle in the account-local week starting `monday`: listed (primary) muscles count fully, library secondary muscles count half. */
export function weeklyMuscleSets(workouts: readonly LoggedWorkout[], monday: DateOnly, timeZone: string, own: readonly GymExercise[] = []): Partial<Record<Muscle, number>> {
  const start = Temporal.PlainDate.from(monday), totals: Partial<Record<Muscle, number>> = {};
  for (const workout of workouts) {
    const offset = start.until(localDate(workout.endedAt, timeZone)).days;
    if (offset < 0 || offset > 6) continue;
    for (const entry of workout.exercises) {
      const exercise = resolveExercise(entry.exerciseId, own) as (GymExercise & { secondary?: readonly Muscle[] }) | undefined;
      for (const muscle of exercise?.muscles ?? []) totals[muscle] = (totals[muscle] ?? 0) + entry.sets.length;
      for (const muscle of exercise?.secondary ?? []) totals[muscle] = (totals[muscle] ?? 0) + entry.sets.length / 2;
    }
  }
  return totals;
}

export interface WeightTrendPoint { date: DateOnly; weight: number; average: number }
export interface WeightTrend { points: WeightTrendPoint[]; latest: number | null; change30: number | null }
/** Body weight in one unit with a trailing 7-day average; the 30-day change compares averages, not single noisy days. */
export function bodyWeightTrend(entries: readonly { date: DateOnly; weight: number; unit: WeightUnit }[], unit: WeightUnit): WeightTrend {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map(entry => ({ date: entry.date, weight: convertWeight(entry.weight, entry.unit, unit) }));
  const points = sorted.map((entry, index) => {
    const from = Temporal.PlainDate.from(entry.date).subtract({ days: 6 }).toString();
    const window = sorted.slice(0, index + 1).filter(other => other.date >= from);
    return { ...entry, average: round(window.reduce((sum, other) => sum + other.weight, 0) / window.length) };
  });
  const last = points[points.length - 1];
  if (!last) return { points, latest: null, change30: null };
  const cutoff = Temporal.PlainDate.from(last.date).subtract({ days: 30 }).toString();
  const before = [...points].reverse().find(point => point.date <= cutoff);
  return { points, latest: last.weight, change30: before ? round(last.average - before.average) : null };
}
