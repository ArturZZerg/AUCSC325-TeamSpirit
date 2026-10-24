import { z } from 'zod';
import { exerciseLibrary, type Equipment, type LoadKind, type Muscle } from '@campusflow/domain';
import { readDataFile } from '../../data-files';

/**
 * openGym state/backup → normalized CampusFlow records (ADR 022). Pure: the gym
 * service resolves source keys to the account's rows and persists. Only the
 * owner's data is read; openGym code and media are not used.
 */
const setSchema = z.object({ w: z.number().nullable().optional(), r: z.number().nullable().optional(), done: z.boolean().optional(), rir: z.number().nullable().optional() }).passthrough();
const stateSchema = z.object({
  unit: z.enum(['kg', 'lb']).optional(),
  customEx: z.array(z.object({ id: z.string(), n: z.string().optional(), eq: z.string().optional(), tg: z.string().optional(), img: z.string().optional() }).passthrough()).optional(),
  exNotes: z.record(z.string()).optional(),
  routines: z.array(z.object({ id: z.string(), name: z.string().optional(), ex: z.array(z.object({ id: z.string(), sets: z.number().optional(),
    reps: z.number().optional(), repsMin: z.number().optional(), restSec: z.number().optional(), note: z.string().optional() }).passthrough()).optional() }).passthrough()).optional(),
  week: z.record(z.array(z.string())).optional(),
  workouts: z.array(z.object({ id: z.string(), d: z.string().optional(), start: z.number().nullable().optional(), end: z.number().nullable().optional(),
    routineId: z.string().nullable().optional(), name: z.string().optional(), note: z.string().nullable().optional(),
    entries: z.array(z.object({ id: z.string(), sets: z.array(setSchema).optional() }).passthrough()).optional() }).passthrough()).optional(),
  bodyweight: z.array(z.object({ d: z.string(), w: z.number() }).passthrough()).optional(),
}).passthrough();

export interface ImportedExercise { sourceKey: string; name: string; equipment: Equipment; load: LoadKind; muscles: Muscle[]; note: string | null; mediaId: string | null }
export interface ImportedDay { id: string; name: string; focus: string; archived?: boolean; exercises: { sourceKey: string; sets: number; repMin: number; repMax: number; restSeconds: number; note: string | null }[] }
export interface ImportedWorkout { requestKey: string; dayId: string; title: string; startedAt: string; endedAt: string; note: string | null;
  exercises: { sourceKey: string; sets: { weight: number | null; reps: number; rir: number | null }[] }[] }
export interface OpenGymImport { unit: 'kg' | 'lb'; exercises: ImportedExercise[]; days: ImportedDay[]; workouts: ImportedWorkout[];
  bodyWeights: { date: string; weight: number }[]; skipped: number }

type ExerciseDbRow = [name: string, equipment: string, target: string];
let names: Record<string, ExerciseDbRow> | undefined;
const exerciseDb = () => names ??= JSON.parse(readDataFile('exercisedb-names.json')) as Record<string, ExerciseDbRow>;
const equipmentMap: Record<string, Equipment> = { 'body weight': 'bodyweight', weighted: 'bodyweight', assisted: 'machine', cable: 'cable', rope: 'cable',
  'leverage machine': 'machine', 'sled machine': 'machine', 'smith machine': 'machine', barbell: 'barbell', 'ez barbell': 'barbell', 'olympic barbell': 'barbell',
  'trap bar': 'barbell', dumbbell: 'dumbbell', kettlebell: 'kettlebell', band: 'band', 'resistance band': 'band' };
const muscleMap: Record<string, Muscle> = { abs: 'core', quads: 'quads', lats: 'back', calves: 'calves', pectorals: 'chest', glutes: 'glutes', hamstrings: 'hamstrings',
  adductors: 'adductors', triceps: 'triceps', spine: 'back', 'upper back': 'back', biceps: 'biceps', delts: 'shoulders', forearms: 'forearms', traps: 'traps',
  'serratus anterior': 'chest', abductors: 'glutes', 'levator scapulae': 'traps', 'cardiovascular system': 'core' };
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const dayId = (routineId: string) => routineId.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'day';
const clean = (text: string | null | undefined, max: number) => text?.trim().slice(0, max) || null;
const filler = new Set(['lever', 'sled', 'machine', 'with', 'on', 'the', 'attachment', 'v', 'bar', '45']);
const tokens = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(word => word && !filler.has(word));

// Reviewed photo matches for common ExerciseDB exercises; the word matcher covers the rest.
const pinned: Record<string, string> = {
  '0025': 'Barbell_Bench_Press_-_Medium_Grip', '0043': 'Barbell_Full_Squat', '0058': 'Barbell_Hip_Thrust', '0070': 'Preacher_Curl',
  '0085': 'Romanian_Deadlift', '0150': 'Wide-Grip_Lat_Pulldown', '0188': 'Cable_Crossover', '0192': 'One-Arm_Side_Laterals',
  '0194': 'Cable_Rope_Overhead_Triceps_Extension', '0198': 'Wide-Grip_Lat_Pulldown', '0201': 'Triceps_Pushdown', '0233': 'Face_Pull',
  '0251': 'Dips_-_Chest_Version', '0274': 'Crunches', '0313': 'Hammer_Curls', '0314': 'Incline_Dumbbell_Press', '0318': 'Incline_Dumbbell_Curl',
  '0327': 'Dumbbell_Incline_Row', '0334': 'Side_Lateral_Raise', '0368': 'Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench',
  '0369': 'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench', '0378': 'Reverse_Flyes', '0405': 'Dumbbell_Shoulder_Press', '0406': 'Dumbbell_Shrug',
  '0410': 'Split_Squat_with_Dumbbells', '0416': 'Dumbbell_Bicep_Curl', '0489': 'Hyperextensions_Back_Extensions', '0585': 'Leg_Extensions',
  '0597': 'Thigh_Abductor', '0598': 'Thigh_Adductor', '0599': 'Seated_Leg_Curl', '0652': 'Pullups', '0739': 'Leg_Press',
  '0826': 'Knee_Hip_Raise_On_Parallel_Bars', '0861': 'Seated_Cable_Rows', '2289': 'Calf_Press',
};

const friendlyNames: Record<string, string> = {
  '0058': 'Barbell hip thrust', '0150': 'Lat pulldown', '0198': 'Cable pulldown', '0233': 'Cable face pull (rope)', '0274': 'Floor crunch',
  '0368': 'Reverse wrist curl over bench', '0369': 'Wrist curl over bench', '0585': 'Leg extension', '0597': 'Seated hip abduction machine',
  '0598': 'Seated hip adduction machine', '0599': 'Seated leg curl', '0739': '45° leg press', '0826': 'Knee raise on parallel bars',
  '0861': 'Seated cable row', '2289': 'Machine calf press', '0410': 'Dumbbell Bulgarian split squat', '0188': 'Cable chest fly',
};

/** A library photo set for an ExerciseDB name: the closest name by shared words (Jaccard), never a weak guess. */
export function libraryMatch(name: string, equipment: Equipment): string | null {
  const wanted = [...new Set(tokens(name))];
  let best: { id: string; score: number } | undefined;
  for (const candidate of exerciseLibrary) {
    const words = [...new Set(tokens(candidate.name))];
    const shared = wanted.filter(word => words.some(other => other.slice(0, 5) === word.slice(0, 5))).length;
    const score = shared / (wanted.length + words.length - shared) + (candidate.equipment === equipment ? 0.1 : 0);
    if (!best || score > best.score) best = { id: candidate.id, score };
  }
  return best && best.score >= 0.55 ? best.id : null;
}

export function parseOpenGym(input: unknown): OpenGymImport {
  const container = input && typeof input === 'object' && 'state' in input ? (input as { state: unknown }).state : input;
  const parsed = stateSchema.safeParse(container);
  if (!parsed.success || (!parsed.data.workouts && !parsed.data.routines)) throw new Error('This is not an openGym backup.');
  const state = parsed.data, unit = state.unit ?? 'kg';
  const custom = new Map((state.customEx ?? []).map(item => [item.id, item]));
  const routines = new Map((state.routines ?? []).map(item => [item.id, item]));
  const exercises = new Map<string, ImportedExercise>();
  let skipped = 0;
  // Copies of one ExerciseDB exercise become one CampusFlow exercise, so progression stays continuous.
  const exercise = (id: string): string => {
    const own = custom.get(id), databaseId = /^\d{4}$/.test(id) ? id : /^\d{4}-/.test(own?.img ?? '') ? own?.img?.slice(0, 4) : undefined;
    const known = databaseId ? exerciseDb()[databaseId] : undefined;
    const sourceKey = known ? `opengym:exdb:${databaseId}` : `opengym:${id}`;
    if (exercises.has(sourceKey)) return sourceKey;
    const equipment = equipmentMap[known?.[1] ?? own?.eq ?? ''] ?? 'other';
    const name = capital((friendlyNames[databaseId ?? ''] ?? known?.[0] ?? own?.n ?? id).trim()).slice(0, 80);
    const muscle = muscleMap[known?.[2] ?? own?.tg ?? ''];
    exercises.set(sourceKey, { sourceKey, name, equipment, load: equipment === 'bodyweight' ? 'added' : 'external', muscles: muscle ? [muscle] : ['core'],
      note: clean(state.exNotes?.[id], 1000), mediaId: known ? pinned[databaseId!] ?? libraryMatch(known[0], equipment) : null });
    return sourceKey;
  };

  const days = new Map<string, ImportedDay>();
  const addDay = (routineId: string, archived: boolean, fallbackName?: string) => {
    const id = dayId(routineId);
    if (days.has(id)) return id;
    const routine = routines.get(routineId);
    days.set(id, { id, name: (routine?.name ?? fallbackName ?? 'Imported workout').trim().slice(0, 60) || 'Imported workout', focus: '', ...(archived ? { archived } : {}),
      exercises: (routine?.ex ?? []).slice(0, 20).map(item => {
        const repMax = Math.min(100, Math.max(1, Math.round(item.reps ?? 10)));
        return { sourceKey: exercise(item.id), sets: Math.min(10, Math.max(1, Math.round(item.sets ?? 3))), repMin: Math.min(repMax, Math.max(1, Math.round(item.repsMin ?? repMax))),
          repMax, restSeconds: Math.min(600, Math.max(0, Math.round(item.restSec ?? 90))), note: clean(item.note, 1000) };
      }).filter((item, index, all) => all.findIndex(other => other.sourceKey === item.sourceKey) === index) });
    return id;
  };
  for (const weekday of Object.keys(state.week ?? {}).sort((a, b) => Number(a) - Number(b)))
    for (const routineId of state.week?.[weekday] ?? []) if (routines.has(routineId)) addDay(routineId, false);
  if (!days.size) for (const routineId of routines.keys()) addDay(routineId, false);

  const workouts: ImportedWorkout[] = [];
  for (const row of state.workouts ?? []) {
    const end = row.end ?? (row.d ? Date.parse(`${row.d}T18:00:00Z`) : NaN);
    if (!Number.isFinite(end)) { skipped++; continue; }
    const start = row.start && row.start <= end ? Math.max(row.start, end - 5 * 3600_000) : end - 3600_000;
    const entries = (row.entries ?? []).flatMap(entry => {
      const sets = (entry.sets ?? []).filter(set => set.done !== false && (set.r ?? 0) >= 1).slice(0, 20).map(set => ({
        weight: typeof set.w === 'number' && set.w >= 0 ? Math.min(1500, set.w) : 0, reps: Math.min(100, Math.round(set.r ?? 0)),
        rir: typeof set.rir === 'number' && set.rir >= 0 && set.rir <= 5 ? Math.round(set.rir) : null }));
      // Cardio and empty entries carry no strength sets.
      if (!sets.length) { skipped++; return []; }
      return [{ sourceKey: exercise(entry.id), sets }];
    });
    const merged = new Map<string, ImportedWorkout['exercises'][number]>();
    for (const entry of entries) merged.set(entry.sourceKey, { sourceKey: entry.sourceKey, sets: [...(merged.get(entry.sourceKey)?.sets ?? []), ...entry.sets].slice(0, 20) });
    const unique = [...merged.values()].slice(0, 30);
    if (!unique.length) { skipped++; continue; }
    const routineId = row.routineId ?? `workout-${row.id}`;
    workouts.push({ requestKey: `opengym-${row.id}`.slice(0, 120), dayId: addDay(routineId, !days.has(dayId(routineId)), row.name),
      title: (row.name ?? 'Workout').trim().slice(0, 120) || 'Workout', startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(),
      note: clean(row.note, 1000), exercises: unique });
  }
  const bodyWeights = (state.bodyweight ?? []).filter(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.d) && entry.w >= 20 && entry.w <= 1000)
    .map(entry => ({ date: entry.d, weight: Math.round(entry.w * 10) / 10 }));
  return { unit, exercises: [...exercises.values()], days: [...days.values()], workouts,
    bodyWeights: [...new Map(bodyWeights.map(entry => [entry.date, entry])).values()], skipped };
}
