import { saveClassScheduleSchema } from '../src';
const valid = { title: ' Biology ', weekdays: [1, 3], termStart: '2025-01-01', termEnd: '2025-04-30',
  startTime: '09:00', endTime: '10:00', timeZone: 'America/Edmonton', location: null, instructor: null, notes: null, color: 'moss' };
it('accepts a term meeting pattern and trims student-entered names', () => {
  expect(saveClassScheduleSchema.parse(valid).title).toBe('Biology');
});
it.each([
  { title: ' ' }, { weekdays: [] }, { weekdays: [1, 1] }, { weekdays: [0] },
  { termStart: '2025-02-30' }, { termEnd: '2024-12-31' }, { startTime: '9:00' },
  { endTime: '09:00' }, { endTime: '08:00' }, { timeZone: 'Not/AZone' },
  { color: 'pink' }, { userId: '00000000-0000-4000-8000-000000000001' }, { notes: 'x'.repeat(2001) },
])('rejects invalid, unbounded or client-owned schedule fields %j', fields => {
  expect(saveClassScheduleSchema.safeParse({ ...valid, ...fields }).success).toBe(false);
});
