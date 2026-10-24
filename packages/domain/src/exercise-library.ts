import { exerciseLibraryRows } from './exercise-library-data';
import { findGymExercise, findGymProgram, gymExercises, type Equipment, type GymExercise, type Muscle, type TrainingProgram } from './gym-catalog';

export type LibraryLevel = 'beginner' | 'intermediate' | 'expert';
export interface LibraryExercise extends GymExercise { level: LibraryLevel; category: string; secondary: readonly Muscle[]; photos: number }

/**
 * free-exercise-db (ADR 022). Bodyweight movements accept optional added load,
 * so a weighted pull-up or dip can be logged without a separate exercise.
 */
export const exerciseLibrary: readonly LibraryExercise[] = exerciseLibraryRows.map(([id, name, equipment, level, category, primary, secondary, photos]) => ({
  id, name, equipment: equipment as Equipment, load: equipment === 'bodyweight' ? 'added' : 'external', muscles: primary as readonly Muscle[],
  secondary: secondary as readonly Muscle[], cue: '', mediaId: id, level: level as LibraryLevel, category, photos,
}));
const libraryIndex = new Map(exerciseLibrary.map(item => [item.id, item]));
export const findLibraryExercise = (id: string): LibraryExercise | undefined => libraryIndex.get(id);

/** Built-in exercise, then library entry, then one of the student's own exercises. */
export const resolveExercise = (id: string, own: readonly GymExercise[] = []): GymExercise | undefined =>
  findGymExercise(id) ?? libraryIndex.get(id) ?? own.find(item => item.id === id);
/** A built-in program, or one of the student's own programs. */
export const resolveProgram = (id: string, own: readonly TrainingProgram[] = []): TrainingProgram | undefined =>
  findGymProgram(id) ?? own.find(item => item.id === id);

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
export interface ExerciseSearch { query?: string; muscle?: Muscle; equipment?: Equipment }
/**
 * Own and built-in exercises first, then the library. Every query word must
 * prefix a word of the name; earlier and exact matches rank higher.
 */
export function searchExercises({ query = '', muscle, equipment }: ExerciseSearch, own: readonly GymExercise[] = [], limit = 40): GymExercise[] {
  const terms = words(query);
  const pool: { item: GymExercise; tier: number }[] = [...own.map(item => ({ item, tier: 0 })), ...gymExercises.map(item => ({ item, tier: 1 })),
    ...exerciseLibrary.filter(item => item.category !== 'stretching').map(item => ({ item, tier: 2 }))];
  const seen = new Set<string>();
  return pool.flatMap(({ item, tier }) => {
    if ((muscle && !item.muscles.includes(muscle)) || (equipment && item.equipment !== equipment)) return [];
    const name = words(item.name);
    const positions = terms.map(term => name.findIndex(word => word.startsWith(term)));
    if (positions.some(position => position < 0)) return [];
    const exact = terms.filter(term => name.includes(term)).length;
    return [{ item, score: tier * 100 + positions.reduce((sum, position) => sum + position, 0) * 3 - exact * 2 + name.length * 0.1 }];
  }).sort((a, b) => a.score - b.score).filter(({ item }) => {
    // A built-in exercise already shows its library photo; skip the duplicate entry.
    const key = item.mediaId ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, limit).map(({ item }) => item);
}
