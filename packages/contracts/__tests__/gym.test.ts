import { gymOverviewSchema, saveGymEnrollmentSchema, saveWorkoutSchema } from '../src';

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
    ['zero reps', { exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 0 }] }] }],
    ['a negative weight', { exercises: [{ exerciseId: 'bench-press', sets: [{ weight: -5, reps: 5 }] }] }],
    ['extra fields', { userId: '10000000-0000-4000-8000-000000000001' }],
  ])('rejects %s', (_label, change) => {
    expect(saveWorkoutSchema.safeParse({ ...workout(), ...change }).success).toBe(false);
  });
  it('bounds the weekly target and keeps the overview strict', () => {
    expect(saveGymEnrollmentSchema.safeParse({ programId: 'upper-lower', unit: 'lb', weeklyTarget: 4 }).success).toBe(true);
    expect(saveGymEnrollmentSchema.safeParse({ programId: 'upper-lower', unit: 'lb', weeklyTarget: 8 }).success).toBe(false);
    expect(gymOverviewSchema.safeParse({ accountId: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton',
      capturedAt: '2026-10-23T18:00:00.000Z', enrollment: null, workouts: [], extra: true }).success).toBe(false);
  });
});
