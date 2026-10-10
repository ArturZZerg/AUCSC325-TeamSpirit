import { classesOnDay, classConflicts, type ClassPattern } from '../src';
const base: ClassPattern = { id: 'biology', title: 'Biology', weekdays: [1, 3, 5],
  termStart: '2025-03-01', termEnd: '2025-04-30', startTime: '09:00', endTime: '10:00',
  timeZone: 'America/Edmonton', location: 'Room 204', instructor: 'Professor', color: 'moss' };
it('expands only meeting days within the inclusive term', () => {
  const pattern = { ...base, termStart: '2025-03-03', termEnd: '2025-03-07' };
  for (const date of ['2025-03-03', '2025-03-05', '2025-03-07']) expect(classesOnDay([pattern], date, base.timeZone).occurrences).toHaveLength(1);
  for (const date of ['2025-02-28', '2025-03-04', '2025-03-10']) expect(classesOnDay([pattern], date, base.timeZone).occurrences).toEqual([]);
});
it('keeps weekly wall times and stable identities across spring DST', () => {
  const before = classesOnDay([base], '2025-03-07', base.timeZone).occurrences[0];
  const after = classesOnDay([base], '2025-03-10', base.timeZone).occurrences[0];
  expect(before.startsAt).toBe('2025-03-07T16:00:00Z'); expect(after.startsAt).toBe('2025-03-10T15:00:00Z');
  expect(after.key).toBe('biology:2025-03-10'); expect(after.location).toBe('Room 204');
});
it.each([
  ['2025-03-09', '02:15', '03:15'], ['2025-11-02', '01:15', '02:15'],
])('reports unavailable/ambiguous clock-change times %s', (date, startTime, endTime) => {
  const value = classesOnDay([{ ...base, weekdays: [7], termEnd: '2025-12-01', startTime, endTime }], date, base.timeZone);
  expect(value.occurrences).toEqual([]); expect(value.issues).toEqual([{ classId: base.id, date, title: base.title }]);
});
it('uses class-local term days while displaying occurrences in the reader calendar', () => {
  const value = classesOnDay([{ ...base, timeZone: 'Asia/Tokyo', weekdays: [2], termStart: '2025-03-11', termEnd: '2025-03-11', startTime: '00:30', endTime: '01:30' }], '2025-03-10', 'America/Edmonton');
  expect(value.occurrences[0]).toMatchObject({ date: '2025-03-11', startsAt: '2025-03-10T15:30:00Z' });
  expect(classesOnDay([{ ...base, timeZone: 'Asia/Tokyo', weekdays: [2], startTime: '00:30', endTime: '01:30' }], '2025-03-11', 'America/Edmonton').occurrences).toEqual([]);
});
it('includes an occurrence overlapping account midnight on both relevant days', () => {
  const pattern = { ...base, weekdays: [1], timeZone: 'UTC', startTime: '05:30', endTime: '06:30' };
  expect(classesOnDay([pattern], '2025-03-09', base.timeZone).occurrences).toHaveLength(1);
  expect(classesOnDay([pattern], '2025-03-10', base.timeZone).occurrences).toHaveLength(1);
});
it('flags overlapping classes but permits back-to-back meetings', () => {
  const value = classesOnDay([base, { ...base, id: 'lab', startTime: '09:30', endTime: '10:30' },
    { ...base, id: 'seminar', startTime: '10:30', endTime: '11:00' }], '2025-03-10', base.timeZone);
  expect([...classConflicts(value.occurrences)].sort()).toEqual(['biology:2025-03-10', 'lab:2025-03-10']);
});
