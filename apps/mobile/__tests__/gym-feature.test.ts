import { findGymProgram } from '@campusflow/domain';
import type { Workout } from '@campusflow/contracts';
import { adHocPrescription, createDraft, draftExercise, draftToWorkout, filterPrograms, ownGym, weekMessage } from '../src/features/gym';

const program = findGymProgram('upper-lower')!, day = program.days[0];
const history: Workout[] = [{ id: '10000000-0000-4000-8000-0000000000a1', programId: 'upper-lower', dayId: 'upper-a', title: 'Upper A', unit: 'kg', note: null,
  startedAt: '2026-10-20T17:00:00.000Z', endedAt: '2026-10-20T18:00:00.000Z', createdAt: '2026-10-20T18:00:00.000Z',
  exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }, { weight: 60, reps: 10 }] }] }];

it('filters by level, audience and setting while keeping unisex programs for every audience', () => {
  const women = filterPrograms({ audience: 'women' });
  expect(women.some(item => item.audience === 'men')).toBe(false);
  expect(women.some(item => item.audience === 'everyone')).toBe(true);
  expect(filterPrograms({ level: 'advanced' }).every(item => item.levels.includes('advanced'))).toBe(true);
  expect(filterPrograms({ setting: 'none' }).map(item => item.id)).toEqual(['dorm-room-starter']);
});
it('prefills the next targets from history and converts only ticked sets', () => {
  const draft = createDraft('owner', program, day, 'kg', history, '2026-10-23', 'America/Edmonton', new Date('2026-10-23T17:00:00Z'));
  expect(draft.exercises[0]).toMatchObject({ exerciseId: 'bench-press', prescription: { sets: 3, repMin: 6, repMax: 10 }, sets: Array.from({ length: 3 }, () => ({ weight: '62.5', reps: '6', done: false })) });
  expect(draft.exercises[1].sets[0]).toEqual({ weight: '', reps: '6', done: false });
  expect(() => draftToWorkout(draft)).toThrow('Tick off at least one set');
  draft.exercises[0].sets[0].done = true; draft.exercises[0].sets[1] = { weight: '62,5', reps: '5', done: true };
  const body = draftToWorkout(draft, new Date('2026-10-23T18:10:00Z'));
  expect(body).toMatchObject({ requestKey: draft.requestKey, endedAt: '2026-10-23T18:10:00.000Z', note: null,
    exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 62.5, reps: 6 }, { weight: 62.5, reps: 5 }] }] });
  expect(draftToWorkout(draft, new Date('2026-10-24T09:00:00Z')).endedAt).toBe('2026-10-23T22:00:00.000Z');
});
it('requires a weight for loaded exercises and stores none for bodyweight work', () => {
  const draft = createDraft('owner', program, day, 'kg', [], '2026-10-23', 'UTC');
  draft.exercises[1].sets[0] = { weight: '', reps: '8', done: true };
  expect(() => draftToWorkout(draft)).toThrow('Enter the weight you used for Barbell row.');
  const dorm = findGymProgram('dorm-room-starter')!;
  const bodyweight = createDraft('owner', dorm, dorm.days[0], 'lb', [], '2026-10-23', 'UTC');
  bodyweight.exercises[0].sets[0] = { ...bodyweight.exercises[0].sets[0], done: true };
  expect(draftToWorkout(bodyweight).exercises[0].sets[0]).toEqual({ weight: null, reps: 12 });
});
it('encourages without inventing streak pressure', () => {
  expect(weekMessage(0, 3, 0)).toMatch(/fresh week/);
  expect(weekMessage(1, 3, 2)).toBe('2 more to reach your weekly goal.');
  expect(weekMessage(3, 3, 4)).toMatch(/4 weeks in a row/);
});

it('logs RIR only when given and resolves own exercises from the overview', () => {
  const own = ownGym({ exercises: [{ id: '10000000-0000-4000-8000-000000000e01', name: 'Wrist roller', equipment: 'other', load: 'external', muscles: ['forearms'],
    note: 'Slow', mediaId: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }],
    programs: [{ id: '10000000-0000-4000-8000-0000000000a9', name: 'Mine', days: [{ id: 'a', name: 'A', focus: '', exercises: [] }],
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }] });
  expect(own.exercises[0]).toMatchObject({ name: 'Wrist roller', cue: 'Slow' });
  const program = own.programs[0];
  const draft = createDraft('owner', program, program.days[0], 'kg', [], '2026-10-23', 'UTC', new Date('2026-10-23T17:00:00Z'), own.exercises, true);
  expect(draft.trackRir).toBe(true);
  const entry = draftExercise(adHocPrescription(own.exercises[0].id), own.exercises, [], 'kg', '2026-10-23', 'UTC')!;
  draft.exercises.push({ ...entry, sets: [{ weight: '5', reps: '15', rir: '2', done: true }, { weight: '5', reps: '12', rir: '', done: true }] });
  expect(draftToWorkout(draft, new Date('2026-10-23T18:00:00Z'), own.exercises).exercises).toEqual([{ exerciseId: own.exercises[0].id,
    sets: [{ weight: 5, reps: 15, rir: 2 }, { weight: 5, reps: 12 }] }]);
  expect(() => draftToWorkout(draft, new Date('2026-10-23T18:00:00Z'), [])).toThrow('no longer available');
});
