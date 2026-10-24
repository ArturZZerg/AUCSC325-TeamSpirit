import { z } from 'zod';
import { idSchema, instantSchema, timeZoneSchema } from './index';

/** Catalog identifiers are validated against the built-in catalog by the API (ADR 020). */
const catalogIdSchema = z.string().regex(/^[a-z0-9-]{1,60}$/, 'Unknown program item.');
export const gymUnitSchema = z.enum(['kg', 'lb']);
export const saveGymEnrollmentSchema = z.object({ programId: catalogIdSchema, unit: gymUnitSchema, weeklyTarget: z.number().int().min(1).max(7) }).strict();
export const gymEnrollmentSchema = saveGymEnrollmentSchema.extend({ startedAt: instantSchema, updatedAt: instantSchema }).strict();
export const workoutSetSchema = z.object({ weight: z.number().min(0).max(1500).nullable(), reps: z.number().int().min(1).max(100) }).strict();
export const workoutExerciseSchema = z.object({ exerciseId: catalogIdSchema, sets: workoutSetSchema.array().min(1).max(12) }).strict();
const workoutFields = z.object({
  programId: catalogIdSchema, dayId: catalogIdSchema, title: z.string().trim().min(1).max(120),
  startedAt: instantSchema, endedAt: instantSchema, unit: gymUnitSchema,
  exercises: workoutExerciseSchema.array().min(1).max(20), note: z.string().trim().max(500).nullable(),
});
const validWorkout = (value: z.infer<typeof workoutFields>) => {
  const span = Date.parse(value.endedAt) - Date.parse(value.startedAt);
  return span >= 0 && span <= 5 * 3600_000 && new Set(value.exercises.map(item => item.exerciseId)).size === value.exercises.length;
};
const workoutMessage = 'A workout lasts at most five hours and lists each exercise once.';
export const saveWorkoutSchema = workoutFields.extend({ requestKey: z.string().min(8).max(120) }).strict().refine(validWorkout, workoutMessage);
export const workoutSchema = workoutFields.extend({ id: idSchema, createdAt: instantSchema }).strict().refine(validWorkout, workoutMessage);
/** Recent account history used for progression, rotation and weekly consistency. */
export const gymRecentDays = 120, gymRecentLimit = 200;
export const gymOverviewSchema = z.object({
  accountId: idSchema, timeZone: timeZoneSchema, capturedAt: instantSchema,
  enrollment: gymEnrollmentSchema.nullable(), workouts: workoutSchema.array().max(gymRecentLimit),
}).strict();
export type GymUnit = z.infer<typeof gymUnitSchema>;
export type SaveGymEnrollment = z.infer<typeof saveGymEnrollmentSchema>;
export type GymEnrollment = z.infer<typeof gymEnrollmentSchema>;
export type SaveWorkout = z.infer<typeof saveWorkoutSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type GymOverview = z.infer<typeof gymOverviewSchema>;
