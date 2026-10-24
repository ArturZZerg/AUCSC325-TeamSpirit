import { exerciseLibrary, findLibraryExercise, resolveExercise, searchExercises, convertWeight, estimateDayMinutes, estimateProgramMinutes, findGymExercise, findGymProgram, gymExercises, gymPrograms, gymWeek, lastPerformance, nextProgramDay,
  personalBests, progressionAdvice, workoutVolume, type LoggedWorkout } from '../src';

const bench = findGymExercise('bench-press')!, pushUp = findGymExercise('push-up')!, dips = findGymExercise('dips')!;
const prescription = { exerciseId: 'bench-press', sets: 3, repMin: 6, repMax: 10, restSeconds: 180 };
const sets = (weight: number | null, ...reps: number[]) => reps.map(value => ({ weight, reps: value }));
const workout = (endedAt: string, dayId: string, exercises: LoggedWorkout['exercises'], unit: LoggedWorkout['unit'] = 'kg', programId = 'upper-lower'): LoggedWorkout =>
  ({ programId, dayId, endedAt, unit, exercises });

describe('gym catalog', () => {
  it('references only known exercises, unique ids and sane prescriptions', () => {
    expect(new Set(gymExercises.map(item => item.id)).size).toBe(gymExercises.length);
    expect(new Set(gymPrograms.map(item => item.id)).size).toBe(gymPrograms.length);
    for (const program of gymPrograms) {
      expect(new Set(program.days.map(item => item.id)).size).toBe(program.days.length);
      expect(program.daysPerWeek).toBeGreaterThanOrEqual(program.days.length > 1 ? 2 : 1);
      for (const day of program.days) for (const item of day.exercises) {
        expect(findGymExercise(item.exerciseId)).toBeDefined();
        expect(item.repMin).toBeLessThanOrEqual(item.repMax); expect(item.sets).toBeGreaterThan(0); expect(item.repMax).toBeLessThanOrEqual(30);
      }
    }
  });
  it('offers programs for every level and audience, including a no-equipment option', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) expect(gymPrograms.some(item => item.levels.includes(level))).toBe(true);
    for (const audience of ['women', 'men', 'everyone'] as const) expect(gymPrograms.filter(item => item.audience === audience).length).toBeGreaterThanOrEqual(2);
    expect(gymPrograms.some(item => item.setting === 'none')).toBe(true);
    for (const program of gymPrograms.filter(item => item.setting === 'none')) for (const day of program.days)
      expect(day.exercises.every(entry => findGymExercise(entry.exerciseId)!.equipment === 'bodyweight')).toBe(true);
    for (const program of gymPrograms.filter(item => item.setting === 'dumbbells')) for (const day of program.days)
      expect(day.exercises.every(entry => ['dumbbell', 'bodyweight'].includes(findGymExercise(entry.exerciseId)!.equipment))).toBe(true);
  });
  it('estimates a realistic session length', () => {
    expect(estimateDayMinutes(findGymProgram('exam-week-express')!.days[0])).toBeLessThanOrEqual(30);
    expect(estimateProgramMinutes(findGymProgram('dorm-room-starter')!)).toBeLessThanOrEqual(35);
    expect(estimateDayMinutes(findGymProgram('push-pull-legs')!.days[1])).toBeGreaterThan(30);
  });
});

describe('double progression advice', () => {
  const last = (reps: number[], weight: number | null = 60, date = '2026-10-20') => ({ date, sets: sets(weight, ...reps) });
  it('asks for a starting weight on the first session', () => {
    const advice = progressionAdvice(prescription, bench, undefined, '2026-10-23', 'kg');
    expect(advice).toMatchObject({ kind: 'first', targets: sets(null, 6, 6, 6) });
    expect(progressionAdvice({ ...prescription, exerciseId: 'dips' }, dips, undefined, '2026-10-23', 'kg').targets[0].weight).toBe(0);
  });
  it('adds one rep to the weakest set at the same weight', () => {
    expect(progressionAdvice(prescription, bench, last([10, 8, 8]), '2026-10-23', 'kg'))
      .toMatchObject({ kind: 'build', targets: sets(60, 10, 9, 8), message: expect.stringContaining('set 2') });
  });
  it('increases by the equipment step and resets reps once every set reaches the top', () => {
    expect(progressionAdvice(prescription, bench, last([10, 10, 11]), '2026-10-23', 'kg')).toMatchObject({ kind: 'increase', targets: sets(62.5, 6, 6, 6) });
    expect(progressionAdvice(prescription, bench, last([10, 10, 10], 135), '2026-10-23', 'lb').targets[0].weight).toBe(140);
  });
  it('never increases with missing sets, mixed weights or reps below the range', () => {
    expect(progressionAdvice(prescription, bench, last([10, 10]), '2026-10-23', 'kg')).toMatchObject({ kind: 'build', message: expect.stringContaining('2 of 3') });
    expect(progressionAdvice(prescription, bench, { date: '2026-10-20', sets: [...sets(60, 10, 10), ...sets(55, 10)] }, '2026-10-23', 'kg').kind).toBe('build');
    expect(progressionAdvice(prescription, bench, last([8, 6, 5]), '2026-10-23', 'kg')).toMatchObject({ kind: 'hold', targets: sets(60, 6, 6, 6) });
  });
  it('eases back in after three weeks away', () => {
    expect(progressionAdvice(prescription, bench, last([10, 10, 10], 60, '2026-10-01'), '2026-10-23', 'kg')).toMatchObject({ kind: 'returning', targets: sets(60, 6, 6, 6) });
  });
  it('suggests a harder variation for bodyweight exercises at the top of the range', () => {
    const advice = progressionAdvice({ ...prescription, exerciseId: 'push-up' }, pushUp, last([10, 10, 10], null), '2026-10-23', 'kg');
    expect(advice).toMatchObject({ kind: 'increase', targets: sets(null, 10, 10, 10), message: expect.stringContaining('harder') });
  });
});

describe('workout history rules', () => {
  const history = [
    workout('2026-10-20T18:00:00Z', 'upper-a', [{ exerciseId: 'bench-press', sets: sets(60, 8, 8, 8) }]),
    workout('2026-10-22T18:00:00Z', 'lower-a', [{ exerciseId: 'back-squat', sets: sets(225, 6) }], 'lb'),
  ];
  it('finds the latest sets for an exercise and converts units', () => {
    expect(lastPerformance(history, 'bench-press', 'lb', 'America/Edmonton')).toEqual({ date: '2026-10-20', sets: sets(132.5, 8, 8, 8) });
    expect(lastPerformance(history, 'back-squat', 'kg', 'America/Edmonton')?.sets[0].weight).toBe(convertWeight(225, 'lb', 'kg'));
    expect(lastPerformance(history, 'deadlift', 'kg', 'UTC')).toBeUndefined();
  });
  it('continues the rotation after the latest workout and starts at day one', () => {
    const program = findGymProgram('upper-lower')!;
    expect(nextProgramDay(program, []).id).toBe('upper-a');
    expect(nextProgramDay(program, history).id).toBe('upper-b');
    expect(nextProgramDay(program, [...history, workout('2026-10-23T18:00:00Z', 'lower-b', [])]).id).toBe('upper-a');
    expect(nextProgramDay(program, [workout('2026-10-23T18:00:00Z', 'a', [], 'kg', 'dumbbells-only')]).id).toBe('upper-a');
  });
  it('groups the week by account-local Monday and counts a streak of target weeks', () => {
    const at = (instant: string) => ({ endedAt: instant });
    // 2026-10-26 04:30Z is still Sunday the 25th in Edmonton.
    const rows = ['2026-10-12T18:00:00Z', '2026-10-14T18:00:00Z', '2026-10-19T18:00:00Z', '2026-10-21T18:00:00Z', '2026-10-26T04:30:00Z'].map(at);
    const week = gymWeek(rows, '2026-10-25', 'America/Edmonton', 2);
    expect(week).toMatchObject({ from: '2026-10-19', count: 3, target: 2, streakWeeks: 2 });
    expect(week.days.find(day => day.date === '2026-10-25')?.workouts).toBe(1);
    expect(gymWeek(rows, '2026-10-27', 'America/Edmonton', 2)).toMatchObject({ count: 0, streakWeeks: 2 });
    expect(gymWeek(rows, '2026-11-03', 'America/Edmonton', 2).streakWeeks).toBe(0);
  });
  it('reports personal bests only when an earlier record exists and is beaten', () => {
    const next = workout('2026-10-24T18:00:00Z', 'upper-a', [{ exerciseId: 'bench-press', sets: sets(62.5, 8) }, { exerciseId: 'back-squat', sets: sets(100, 5) }]);
    expect(personalBests(next, history)).toEqual(['bench-press']);
    expect(personalBests({ ...next, exercises: [{ exerciseId: 'bench-press', sets: sets(60, 8) }] }, history)).toEqual([]);
    expect(workoutVolume(next.exercises)).toBe(1000);
  });
});

describe('exercise library', () => {
  it('links every built-in exercise to a library photo set', () => {
    expect(exerciseLibrary.length).toBeGreaterThan(800);
    for (const exercise of gymExercises) expect(findLibraryExercise(exercise.mediaId!)).toBeDefined();
  });
  it('resolves built-in, library and own exercises and searches by name prefix, muscle and equipment', () => {
    const own = [{ id: '10000000-0000-4000-8000-000000000e01', name: 'Wrist roller', equipment: 'other' as const, load: 'external' as const, muscles: ['forearms' as const], cue: '' }];
    expect(resolveExercise('bench-press')?.name).toBe('Barbell bench press');
    expect(resolveExercise('Barbell_Full_Squat')?.load).toBe('external');
    expect(resolveExercise('Pullups')?.load).toBe('added');
    expect(resolveExercise(own[0].id, own)?.name).toBe('Wrist roller');
    expect(searchExercises({ query: 'wrist' }, own)[0].id).toBe(own[0].id);
    const squats = searchExercises({ query: 'squat' });
    expect(squats.slice(0, 3).map(item => item.id)).toContain('back-squat');
    expect(squats.filter(item => item.mediaId === 'Barbell_Full_Squat')).toHaveLength(1);
    expect(searchExercises({ query: 'curl', muscle: 'biceps', equipment: 'dumbbell' }).every(item => item.equipment === 'dumbbell' && item.muscles.includes('biceps'))).toBe(true);
  });
  it('rotates only through active days of an own program', () => {
    const program = { id: 'own', name: 'Mine', days: [
      { id: 'a', name: 'A', focus: '', exercises: [] }, { id: 'old', name: 'Old', focus: '', exercises: [], archived: true }, { id: 'b', name: 'B', focus: '', exercises: [] }] };
    expect(nextProgramDay(program, [workout('2026-10-22T18:00:00Z', 'a', [], 'kg', 'own')]).id).toBe('b');
    expect(nextProgramDay(program, [workout('2026-10-22T18:00:00Z', 'old', [], 'kg', 'own')]).id).toBe('a');
  });
});
