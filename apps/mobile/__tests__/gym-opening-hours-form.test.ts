import { gymClosesNextDay, newGymHours, parseGymTime, validateGymHours } from '../src/features/gym-opening-hours-form';

it.each([
  ['7:00', '07:00', 420], ['07:00', '07:00', 420], ['7am', '07:00', 420], ['7 AM', '07:00', 420],
  ['7:30pm', '19:30', 1170], [' 7:30 PM ', '19:30', 1170], ['12am', '00:00', 0], ['12:00 AM', '00:00', 0],
  ['0:00', '00:00', 0], ['00:00', '00:00', 0], ['12pm', '12:00', 720], ['23:59', '23:59', 1439],
])('normalizes %s to %s', (input, time, minutes) => expect(parseGymTime(input)).toEqual({ time, minutes }));

it.each(['', '24:00', '25:00', '7:60', '7:5', '0am', '13pm', '7:00junk', '-1:00', '7:30:00', 'nope'])('rejects invalid time %s', input => {
  expect(parseGymTime(input)).toBeUndefined();
});

it.each([
  ['7:00', '10:00', false], ['7am', '7:30pm', false], ['00:00', '7am', false],
  ['7pm', '12am', true], ['23:59', '0:00', true], ['07:00', '7am', false], ['bad', '10:00', false],
])('compares %s and %s numerically (overnight=%s)', (opens, closes, expected) => {
  expect(gymClosesNextDay(opens, closes)).toBe(expected);
});

it('rejects equivalent opening/closing times with a closing-field error', () => {
  const draft = newGymHours('UTC');
  draft.days[0] = { kind: 'open', opens: '7am', closes: '07:00' };
  expect(validateGymHours(draft)).toMatchObject({ success: false, errors: { 'days.0.closes': expect.stringContaining('must differ') } });
});

it('normalizes midnight overnight hours without modifying the draft or saved day kinds', () => {
  const draft = newGymHours('UTC');
  draft.days[0] = { kind: 'open', opens: '7pm', closes: '12am' };
  draft.days[1] = { kind: 'unknown' };
  const result = validateGymHours(draft);
  expect(result).toMatchObject({ success: true, data: { days: [
    { kind: 'open', opens: '19:00', closes: '00:00' }, { kind: 'unknown' },
    ...newGymHours('UTC').days.slice(2),
  ] } });
  expect(draft.days[0]).toEqual({ kind: 'open', opens: '7pm', closes: '12am' });
});
