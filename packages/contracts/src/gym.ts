import { z } from 'zod';
import { dateSchema, idSchema, instantSchema, timeZoneSchema } from './index';

/**
 * Built-in catalog ids, exercise-library ids and own-item UUIDs. The API checks
 * that an id is known to the account (ADR 020, ADR 022).
 */
const itemIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, 'Unknown program item.');
export const gymUnitSchema = z.enum(['kg', 'lb']);
export const gymMuscleSchema = z.enum(['chest', 'back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'core']);
export const gymEquipmentSchema = z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other']);
export const gymLoadSchema = z.enum(['external', 'added', 'bodyweight']);

export const saveGymEnrollmentSchema = z.object({ programId: itemIdSchema, unit: gymUnitSchema, weeklyTarget: z.number().int().min(1).max(7),
  trackRir: z.boolean().default(false) }).strict();
export const gymEnrollmentSchema = saveGymEnrollmentSchema.extend({ trackRir: z.boolean(), startedAt: instantSchema, updatedAt: instantSchema }).strict();

/** RIR: reps in reserve, 0 (failure) to 5. */
export const workoutSetSchema = z.object({ weight: z.number().min(0).max(1500).nullable(), reps: z.number().int().min(1).max(100),
  rir: z.number().int().min(0).max(5).nullable().optional() }).strict();
export const workoutExerciseSchema = z.object({ exerciseId: itemIdSchema, sets: workoutSetSchema.array().min(1).max(20) }).strict();
const workoutFields = z.object({
  programId: itemIdSchema, dayId: itemIdSchema, title: z.string().trim().min(1).max(120),
  startedAt: instantSchema, endedAt: instantSchema, unit: gymUnitSchema,
  exercises: workoutExerciseSchema.array().min(1).max(30), note: z.string().trim().max(1000).nullable(),
});
const validWorkout = (value: z.infer<typeof workoutFields>) => {
  const span = Date.parse(value.endedAt) - Date.parse(value.startedAt);
  return span >= 0 && span <= 5 * 3600_000 && new Set(value.exercises.map(item => item.exerciseId)).size === value.exercises.length;
};
const workoutMessage = 'A workout lasts at most five hours and lists each exercise once.';
export const saveWorkoutSchema = workoutFields.extend({ requestKey: z.string().min(8).max(120) }).strict().refine(validWorkout, workoutMessage);
export const workoutSchema = workoutFields.extend({ id: idSchema, createdAt: instantSchema }).strict().refine(validWorkout, workoutMessage);

/** A student's own exercise; `mediaId` borrows photos and instructions from the library. */
export const saveUserExerciseSchema = z.object({
  name: z.string().trim().min(1, 'Name the exercise.').max(80), equipment: gymEquipmentSchema, load: gymLoadSchema,
  muscles: gymMuscleSchema.array().min(1, 'Choose at least one muscle.').max(6), note: z.string().trim().max(1000).nullable(),
  mediaId: itemIdSchema.nullable(),
}).strict();
export const userExerciseSchema = saveUserExerciseSchema.extend({ id: idSchema, createdAt: instantSchema, updatedAt: instantSchema }).strict();

export const prescribedExerciseSchema = z.object({ exerciseId: itemIdSchema, sets: z.number().int().min(1).max(10),
  repMin: z.number().int().min(1).max(100), repMax: z.number().int().min(1).max(100), restSeconds: z.number().int().min(0).max(600),
  note: z.string().trim().max(1000).nullable().optional() }).strict().refine(value => value.repMin <= value.repMax, 'The lowest reps must not exceed the highest.');
export const programDaySchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), name: z.string().trim().min(1, 'Name the day.').max(60),
  focus: z.string().trim().max(120), exercises: prescribedExerciseSchema.array().max(20), archived: z.boolean().optional() }).strict();
const programFields = z.object({ name: z.string().trim().min(1, 'Name the program.').max(80), days: programDaySchema.array().min(1, 'Add at least one day.').max(14) });
const uniqueDays = (value: z.infer<typeof programFields>) => new Set(value.days.map(day => day.id)).size === value.days.length
  && value.days.some(day => !day.archived);
const programMessage = 'Each day needs its own id and at least one day must be active.';
export const saveUserProgramSchema = programFields.strict().refine(uniqueDays, programMessage);
export const userProgramSchema = programFields.extend({ id: idSchema, createdAt: instantSchema, updatedAt: instantSchema }).strict().refine(uniqueDays, programMessage);

export const saveBodyWeightSchema = z.object({ weight: z.number().min(20).max(1000), unit: gymUnitSchema }).strict();
export const bodyWeightEntrySchema = saveBodyWeightSchema.extend({ date: dateSchema }).strict();

/** Recent account history used for progression, rotation, statistics and the week view. */
export const gymRecentDays = 400, gymRecentLimit = 500;
export const gymOverviewSchema = z.object({
  accountId: idSchema, timeZone: timeZoneSchema, capturedAt: instantSchema, enrollment: gymEnrollmentSchema.nullable(),
  workouts: workoutSchema.array().max(gymRecentLimit), exercises: userExerciseSchema.array().max(500),
  programs: userProgramSchema.array().max(50), bodyWeights: bodyWeightEntrySchema.array().max(gymRecentDays),
}).strict();
export const gymImportResultSchema = z.object({
  exercises: z.number().int().nonnegative(), programs: z.number().int().nonnegative(), workouts: z.number().int().nonnegative(),
  bodyWeights: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), programId: idSchema.nullable(),
}).strict();
export const exerciseDetailsSchema = z.object({ id: itemIdSchema, instructions: z.string().array().max(30), photos: z.string().url().array().max(4) }).strict();

export type GymUnit = z.infer<typeof gymUnitSchema>;
export type SaveGymEnrollment = z.infer<typeof saveGymEnrollmentSchema>;
export type GymEnrollment = z.infer<typeof gymEnrollmentSchema>;
export type SaveWorkout = z.infer<typeof saveWorkoutSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type SaveUserExercise = z.infer<typeof saveUserExerciseSchema>;
export type UserExercise = z.infer<typeof userExerciseSchema>;
export type SaveUserProgram = z.infer<typeof saveUserProgramSchema>;
export type UserProgram = z.infer<typeof userProgramSchema>;
export type BodyWeightEntry = z.infer<typeof bodyWeightEntrySchema>;
export type GymOverview = z.infer<typeof gymOverviewSchema>;
export type GymImportResult = z.infer<typeof gymImportResultSchema>;
export type ExerciseDetails = z.infer<typeof exerciseDetailsSchema>;
