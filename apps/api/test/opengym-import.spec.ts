import { readFileSync } from 'node:fs';
import path from 'node:path';
import { libraryMatch, parseOpenGym } from '../src/integrations/opengym/opengym-import';

const fixture = () => JSON.parse(readFileSync(path.join(__dirname, 'fixtures/opengym/state.json'), 'utf8'));

describe('openGym import mapping', () => {
  it('names ExerciseDB exercises in English, merges copies and keeps own exercises', () => {
    const result = parseOpenGym(fixture());
    expect(result.unit).toBe('lb');
    expect(result.exercises.map(item => [item.sourceKey, item.name, item.equipment, item.load, item.mediaId])).toEqual([
      ['opengym:exdb:0025', 'Barbell bench press', 'barbell', 'external', 'Barbell_Bench_Press_-_Medium_Grip'],
      ['opengym:exdb:0652', 'Pull-up', 'bodyweight', 'added', 'Pullups'],
      ['opengym:ex-own', 'Wrist roller', 'other', 'external', null],
    ]);
    expect(result.exercises[0]).toMatchObject({ muscles: ['chest'], note: 'Lower under control.' });
  });
  it('turns scheduled routines into days in weekday order and history-only routines into archived days', () => {
    const { days } = parseOpenGym(fixture());
    expect(days.map(day => [day.id, day.name, !!day.archived])).toEqual([['day-push', 'Push', false], ['day-pull', 'Pull', false], ['day-copy', 'Pull (copy)', true]]);
    expect(days[0].exercises).toEqual([{ sourceKey: 'opengym:exdb:0025', sets: 3, repMin: 6, repMax: 10, restSeconds: 180, note: 'Bar to mid-chest' }]);
    expect(days[1].exercises[1]).toMatchObject({ repMin: 15, repMax: 15, restSeconds: 90 });
  });
  it('imports only completed strength sets, merges copies within a workout and skips cardio and empty workouts', () => {
    const { workouts, skipped } = parseOpenGym(fixture());
    expect(workouts.map(item => item.requestKey)).toEqual(['opengym-w1', 'opengym-w2']);
    expect(workouts[0]).toMatchObject({ dayId: 'day-push', startedAt: '2026-10-19T20:00:00.000Z', endedAt: '2026-10-19T21:00:00.000Z',
      exercises: [{ sourceKey: 'opengym:exdb:0025', sets: [{ weight: 135, reps: 10, rir: 2 }, { weight: 135, reps: 9, rir: null }] }] });
    expect(workouts[1].exercises).toEqual([{ sourceKey: 'opengym:exdb:0652', sets: [{ weight: 0, reps: 8, rir: null }, { weight: 10, reps: 6, rir: null }] }]);
    expect(skipped).toBe(2);
  });
  it('keeps valid body weights and accepts a wrapped backup', () => {
    expect(parseOpenGym({ state: fixture() }).bodyWeights).toEqual([{ date: '2026-10-19', weight: 173.1 }, { date: '2026-10-21', weight: 172.6 }]);
  });
  it('rejects files that are not openGym data', () => {
    expect(() => parseOpenGym({ hello: 'world' })).toThrow('not an openGym backup');
    expect(() => parseOpenGym([1, 2])).toThrow();
  });
  it('matches library photos by close names only', () => {
    expect(libraryMatch('barbell full squat', 'barbell')).toBe('Barbell_Full_Squat');
    expect(libraryMatch('underwater basket weaving', 'other')).toBeNull();
  });
});
