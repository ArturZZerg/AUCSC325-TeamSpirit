import { z } from 'zod';
import type { GymUnit, SaveWorkout, Workout } from '@campusflow/contracts';
import { findGymExercise, gymPrograms, lastPerformance, progressionAdvice, type GymAudience, type GymLevel, type GymProgram, type GymSetting,
  type LoggedWorkout, type ProgramDay } from '@campusflow/domain';

export const levelLabels: Record<GymLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const audienceLabels: Record<GymAudience, string> = { everyone: 'Anyone', women: 'For women', men: 'For men' };
export const settingLabels: Record<GymSetting, string> = { gym: 'Gym', dumbbells: 'Dumbbells', none: 'No equipment' };
export const goalLabels: Record<GymProgram['goal'], string> = { strength: 'Get stronger', muscle: 'Build muscle', toning: 'Tone & shape', fitness: 'Get fit' };
export type ProgramFilters = { level?: GymLevel; audience?: GymAudience; setting?: GymSetting };
/** Audience filters keep unisex programs visible; anyone can follow any program. */
export const filterPrograms = (filters: ProgramFilters, programs: readonly GymProgram[] = gymPrograms) => programs.filter(program =>
  (!filters.level || program.levels.includes(filters.level))
  && (!filters.audience || program.audience === filters.audience || program.audience === 'everyone')
  && (!filters.setting || program.setting === filters.setting));
export const levelText = (program: GymProgram) => program.levels.length === 3 ? 'All levels' : program.levels.map(level => levelLabels[level]).join(' – ');

export const toLogged = (workouts: readonly Workout[]): LoggedWorkout[] => workouts.map(({ programId, dayId, endedAt, unit, exercises }) => ({ programId, dayId, endedAt, unit, exercises }));

const draftSetSchema = z.object({ weight: z.string().max(12), reps: z.string().max(4), done: z.boolean() }).strict();
/** Device-only workout in progress; the server stores it only after Finish (ADR 020). */
export const gymDraftSchema = z.object({
  owner: z.string(), requestKey: z.string().min(8).max(120), programId: z.string(), dayId: z.string(), title: z.string(),
  unit: z.enum(['kg', 'lb']), startedAt: z.string().datetime(), note: z.string().max(500),
  exercises: z.object({ exerciseId: z.string(), sets: draftSetSchema.array().max(12) }).strict().array().max(20),
}).strict();
export type GymDraft = z.infer<typeof gymDraftSchema>;
export type DraftSet = GymDraft['exercises'][number]['sets'][number];

const newKey = () => `gym-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
/** Prefill every set from the progression target so a typical set is one tap. */
export function createDraft(owner: string, program: GymProgram, day: ProgramDay, unit: GymUnit, history: readonly Workout[], today: string, timeZone: string, now = new Date()): GymDraft {
  const logged = toLogged(history);
  return { owner, requestKey: newKey(), programId: program.id, dayId: day.id, title: day.name, unit, startedAt: now.toISOString(), note: '',
    exercises: day.exercises.map(item => {
      const exercise = findGymExercise(item.exerciseId)!;
      const advice = progressionAdvice(item, exercise, lastPerformance(logged, item.exerciseId, unit, timeZone), today, unit);
      return { exerciseId: item.exerciseId, sets: advice.targets.map(target => ({ weight: target.weight === null ? '' : String(target.weight), reps: String(target.reps), done: false })) };
    }) };
}

const number = (value: string) => { const text = value.trim().replace(',', '.'); return text && /^\d+(\.\d+)?$/.test(text) ? Number(text) : undefined; };
/** Completed sets only. Throws a student-facing message when a completed set is missing a value. */
export function draftToWorkout(draft: GymDraft, now = new Date()): SaveWorkout {
  const exercises = draft.exercises.map(entry => {
    const exercise = findGymExercise(entry.exerciseId)!;
    const sets = entry.sets.filter(set => set.done).map(set => {
      const reps = number(set.reps), weight = number(set.weight);
      if (!reps || !Number.isInteger(reps) || reps > 100) throw new Error(`Enter whole-number reps for ${exercise.name}.`);
      if (exercise.load === 'bodyweight') return { weight: null, reps };
      if (exercise.load === 'external' && weight === undefined) throw new Error(`Enter the weight you used for ${exercise.name}.`);
      if ((weight ?? 0) > 1500) throw new Error(`Check the weight entered for ${exercise.name}.`);
      return { weight: weight ?? 0, reps };
    });
    return { exerciseId: entry.exerciseId, sets };
  }).filter(entry => entry.sets.length > 0);
  if (!exercises.length) throw new Error('Tick off at least one set before finishing.');
  const endedAt = new Date(Math.max(now.getTime(), Date.parse(draft.startedAt)));
  // A forgotten open workout is capped at five hours instead of being rejected.
  const capped = new Date(Math.min(endedAt.getTime(), Date.parse(draft.startedAt) + 5 * 3600_000));
  return { requestKey: draft.requestKey, programId: draft.programId, dayId: draft.dayId, title: draft.title, unit: draft.unit,
    startedAt: draft.startedAt, endedAt: capped.toISOString(), note: draft.note.trim() || null, exercises };
}
export const draftProgress = (draft: GymDraft) => {
  const sets = draft.exercises.flatMap(entry => entry.sets);
  return { done: sets.filter(set => set.done).length, total: sets.length };
};
export const formatDuration = (milliseconds: number) => {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
};
export const formatClock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
export const formatSets = (sets: readonly { weight: number | null; reps: number }[], unit: GymUnit) =>
  sets.map(set => set.weight === null ? `${set.reps} reps` : `${set.weight} ${unit} × ${set.reps}`).join(' · ');
/** Encouragement based only on recorded facts; no streak pressure when a week is still open. */
export function weekMessage(count: number, target: number, streakWeeks: number) {
  if (count >= target) return streakWeeks > 1 ? `Weekly goal done — ${streakWeeks} weeks in a row. Keep it rolling!` : 'Weekly goal done. Anything extra is a bonus.';
  if (count === 0) return streakWeeks > 0 ? `You are on a ${streakWeeks}-week streak. One workout gets this week started.` : 'A fresh week. One workout gets you moving.';
  return `${target - count} more to reach your weekly goal.`;
}
