import { bodyWeightTrend, exerciseHistory, personalRecords, trainingHeatmap, weeklyMuscleSets, type LoggedWorkout } from '../src';

const sets = (weight: number | null, ...reps: number[]) => reps.map(value => ({ weight, reps: value }));
const workout = (endedAt: string, exercises: LoggedWorkout['exercises'], unit: LoggedWorkout['unit'] = 'kg'): LoggedWorkout => ({ programId: 'p', dayId: 'd', endedAt, unit, exercises });
const history = [
  workout('2026-10-13T18:00:00Z', [{ exerciseId: 'bench-press', sets: sets(60, 8, 8, 7) }, { exerciseId: 'push-up', sets: sets(null, 20, 15) }]),
  workout('2026-10-20T18:00:00Z', [{ exerciseId: 'bench-press', sets: sets(140, 6) }, { exerciseId: 'Pullups', sets: sets(0, 10) }], 'lb'),
  workout('2026-10-22T18:00:00Z', [{ exerciseId: 'bench-press', sets: sets(62.5, 8, 7) }, { exerciseId: 'push-up', sets: sets(null, 22) }]),
];

describe('gym statistics', () => {
  it('tracks an exercise over time in one unit, oldest first', () => {
    const points = exerciseHistory([...history].reverse(), 'bench-press', 'kg', 'America/Edmonton');
    expect(points.map(point => [point.date, point.topWeight, point.sets])).toEqual([['2026-10-13', 60, 3], ['2026-10-20', 63.5, 1], ['2026-10-22', 62.5, 2]]);
    expect(points[0]).toMatchObject({ bestOneRepMax: 76, bestReps: 8, volume: 1380 });
  });
  it('keeps the best estimated 1RM per exercise and most reps for bodyweight work', () => {
    const records = personalRecords(history, 'kg', 'America/Edmonton');
    expect(records.map(record => [record.exerciseId, record.sessions])).toEqual([['bench-press', 3], ['push-up', 2], ['Pullups', 1]]);
    expect(records[0]).toMatchObject({ date: '2026-10-22', weight: 62.5, reps: 8, oneRepMax: 79.2 });
    expect(records[1]).toMatchObject({ weight: null, reps: 22, oneRepMax: null });
  });
  it('builds Monday-based heatmap weeks that end with the current week', () => {
    const weeks = trainingHeatmap(history, '2026-10-23', 'America/Edmonton', 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[0][0].date).toBe('2026-10-12'); expect(weeks[1][6]).toMatchObject({ date: '2026-10-25', future: true });
    expect(weeks[1].filter(day => day.workouts).map(day => [day.date, day.sets])).toEqual([['2026-10-20', 2], ['2026-10-22', 3]]);
  });
  it('counts weekly sets for every muscle an exercise trains', () => {
    expect(weeklyMuscleSets(history, '2026-10-19', 'America/Edmonton')).toMatchObject({ chest: 4, triceps: 4, back: 1, biceps: 0.5 });
  });
  it('averages body weight over 7 days and compares averages 30 days apart', () => {
    const trend = bodyWeightTrend([{ date: '2026-09-20', weight: 80, unit: 'kg' }, { date: '2026-10-20', weight: 176, unit: 'lb' }, { date: '2026-10-22', weight: 79, unit: 'kg' }], 'kg');
    expect(trend.points.map(point => point.weight)).toEqual([80, 80, 79]);
    expect(trend.points[2].average).toBe(79.5);
    expect(trend).toMatchObject({ latest: 79, change30: -0.5 });
    expect(bodyWeightTrend([], 'kg')).toEqual({ points: [], latest: null, change30: null });
  });
});
