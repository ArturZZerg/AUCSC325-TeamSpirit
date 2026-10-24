import { gymOverviewSchema, saveGymEnrollmentSchema, saveUserExerciseSchema, saveUserProgramSchema, saveWorkoutSchema } from '../src';

const workout = () => ({ requestKey: 'gym-test-key-1', programId: 'upper-lower', dayId: 'upper-a', title: 'Upper A',
  startedAt: '2026-10-23T17:00:00.000Z', endedAt: '2026-10-23T18:05:00.000Z', unit: 'kg', note: null,
  exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }] }, { exerciseId: 'push-up', sets: [{ weight: null, reps: 12 }] }] });

describe('gym contracts', () => {
  it('accepts a logged workout with loaded and bodyweight sets', () => {
    expect(saveWorkoutSchema.parse(workout()).exercises).toHaveLength(2);
  });
  it.each([
    ['an end before the start', { endedAt: '2026-10-23T16:00:00.000Z' }],
    ['a workout over five hours', { endedAt: '2026-10-23T23:00:00.000Z' }],
    ['a local wall-clock time', { startedAt: '2026-10-23T17:00:00' }],
    ['an exercise listed twice', { exercises: [workout().exercises[0], workout().exercises[0]] }],
    ['an empty workout', { exercises: [] }],
    ['an unknown unit', { unit: 'stone' }],
    ['a malformed catalog id', { programId: 'Upper Lower' }],
    ['an RIR above 5', { exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 5, rir: 6 }] }] }],
    ['zero reps', { exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 0 }] }] }],
    ['a negative weight', { exercises: [{ exerciseId: 'bench-press', sets: [{ weight: -5, reps: 5 }] }] }],
    ['extra fields', { userId: '10000000-0000-4000-8000-000000000001' }],
  ])('rejects %s', (_label, change) => {
    expect(saveWorkoutSchema.safeParse({ ...workout(), ...change }).success).toBe(false);
  });
  it('bounds the weekly target and keeps the overview strict', () => {
    expect(saveGymEnrollmentSchema.safeParse({ programId: 'upper-lower', unit: 'lb', weeklyTarget: 4 }).success).toBe(true);
    expect(saveGymEnrollmentSchema.safeParse({ programId: 'upper-lower', unit: 'lb', weeklyTarget: 8 }).success).toBe(false);
    expect(saveGymEnrollmentSchema.parse({ programId: 'upper-lower', unit: 'lb', weeklyTarget: 4 }).trackRir).toBe(false);
    expect(gymOverviewSchema.safeParse({ accountId: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton',
      capturedAt: '2026-10-23T18:00:00.000Z', enrollment: null, workouts: [], exercises: [], programs: [], bodyWeights: [], extra: true }).success).toBe(false);
  });
});

describe('own programs and exercises', () => {
  const day = (id: string, archived?: boolean) => ({ id, name: `Day ${id}`, focus: '', exercises: [{ exerciseId: 'Barbell_Full_Squat', sets: 3, repMin: 6, repMax: 10, restSeconds: 120 }], ...(archived ? { archived } : {}) });
  it('accepts a program with library and own exercise ids', () => {
    expect(saveUserProgramSchema.safeParse({ name: 'My PPL', days: [day('push'), { ...day('pull'), exercises: [{ exerciseId: '10000000-0000-4000-8000-000000000e01', sets: 3, repMin: 8, repMax: 12, restSeconds: 90, note: 'Slow' }] }] }).success).toBe(true);
  });
  it.each([
    ['duplicate day ids', { name: 'P', days: [day('a'), day('a')] }],
    ['only archived days', { name: 'P', days: [day('a', true)] }],
    ['inverted rep range', { name: 'P', days: [{ ...day('a'), exercises: [{ exerciseId: 'x', sets: 3, repMin: 12, repMax: 8, restSeconds: 60 }] }] }],
    ['no days', { name: 'P', days: [] }],
  ])('rejects %s', (_label, value) => { expect(saveUserProgramSchema.safeParse(value).success).toBe(false); });
  it('requires a name and a muscle for an own exercise', () => {
    expect(saveUserExerciseSchema.safeParse({ name: 'Wrist roller', equipment: 'other', load: 'external', muscles: ['forearms'], note: null, mediaId: null }).success).toBe(true);
    expect(saveUserExerciseSchema.safeParse({ name: '', equipment: 'other', load: 'external', muscles: [], note: null, mediaId: null }).success).toBe(false);
  });
});
