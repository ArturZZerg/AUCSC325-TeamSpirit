import { goalFormDefaults, goalFormRequest } from '../src/features/goal-form';
import { wellnessFormRequest } from '../src/features/wellness-form';
import { snapshotFixture } from './snapshot-fixture';

const goal = snapshotFixture().goals[0];
const values = { ...goalFormDefaults(null, 'America/Edmonton'), title: '  Read  ' };
describe('goal and check-in request validation (ToR 12, 15)', () => {
  it('creates a daily goal in the account zone', () => {
    expect(goalFormRequest(values, null)).toEqual({ path: '/goals', method: 'POST', body: { title: 'Read', category: 'health', timeZone: 'America/Edmonton', schedule: { kind: 'daily' } } });
  });
  it('edits selected weekdays without clearing reminder or pause state', () => {
    expect(goalFormRequest({ ...values, frequency: 'weekly', weekdays: [7, 1, 1] }, goal)).toEqual({ path: `/goals/${goal.id}`, method: 'PATCH', body: { title: 'Read', category: 'health', timeZone: 'America/Edmonton', schedule: { kind: 'weekly', weekdays: [1, 7] } } });
    expect(goalFormDefaults({ ...goal, schedule: { kind: 'weekly', weekdays: [2, 4] } }, 'UTC')).toMatchObject({ timeZone: goal.timeZone, frequency: 'weekly', weekdays: [2, 4] });
  });
  it('creates weekly targets and preserves their defaults on edit', () => {
    expect(goalFormRequest({ ...values, frequency: 'weeklyTarget', target: '5' }, null).body.schedule).toEqual({ kind: 'weeklyTarget', target: 5 });
    expect(goalFormDefaults({ ...goal, schedule: { kind: 'weeklyTarget', target: 7 } }, 'UTC').target).toBe('7');
  });
  it.each(['', '0', '8', '1.5', 'abc'])('rejects invalid weekly target %s', target => {
    expect(() => goalFormRequest({ ...values, frequency: 'weeklyTarget', target }, null)).toThrow();
  });
  it('rejects empty selected days, blank title and invalid timezone', () => {
    expect(() => goalFormRequest({ ...values, frequency: 'weekly' }, null)).toThrow();
    expect(() => goalFormRequest({ ...values, title: ' ' }, null)).toThrow();
    expect(() => goalFormRequest({ ...values, timeZone: 'Mars/Base' }, null)).toThrow();
  });
  it('sends all check-in fields with explicit nullable values and the supplied account day', () => {
    expect(wellnessFormRequest('2025-03-09', { mood: ' 4 ', energy: '', stress: '2', note: ' A note ' })).toEqual({ path: '/wellness', body: { date: '2025-03-09', mood: 4, energy: null, stress: 2, note: 'A note' } });
    expect(wellnessFormRequest('2025-03-09', { mood: '', energy: '', stress: '', note: ' ' }).body).toMatchObject({ mood: null, energy: null, stress: null, note: null });
  });
  it.each(['0', '6', '3.5', 'text'])('rejects invalid check-in rating %s', mood => {
    expect(() => wellnessFormRequest('2025-03-09', { mood, energy: '', stress: '', note: '' })).toThrow();
  });
  it('rejects an invalid check-in date or oversized note', () => {
    expect(() => wellnessFormRequest('2025-02-30', { mood: '3', energy: '', stress: '', note: '' })).toThrow();
    expect(() => wellnessFormRequest('2025-03-09', { mood: '3', energy: '', stress: '', note: 'a'.repeat(2001) })).toThrow();
  });
});
