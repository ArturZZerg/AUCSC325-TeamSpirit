import { journalFields, matchesJournalDraft, reflectJournal } from '../src/features/wellness-journal';
import { journalEntry, journalFixture, journalOwner } from './journal-fixture';
const reflect = (value: unknown, date = '2025-03-09', days: 7 | 30 = 7) => reflectJournal(value, journalOwner, 'America/Edmonton', date, days);
it('uses separate recorded sample counts and never fills missing days or ratings with a score', () => {
  const result = reflect({ ...journalFixture(), entries: [journalEntry, { ...journalEntry, id: '72000000-0000-4000-8000-000000000003', date: '2025-03-08', mood: 2, energy: 5, stress: null, note: null }] });
  expect(result).toMatchObject({ savedDays: 2, days: 7, mood: { samples: 2, average: 3 }, energy: { samples: 1, average: 5 }, stress: { samples: 1, average: 2 } });
  expect(result?.calendar.filter(day => day.entry)).toHaveLength(2); expect(result?.calendar.filter(day => !day.entry)).toHaveLength(5);
});
it('distinguishes known empty coverage, note-only entries and unavailable history', () => {
  expect(reflect({ ...journalFixture(), entries: [] })).toMatchObject({ savedDays: 0, mood: { samples: 0, average: null } });
  expect(reflect({ ...journalFixture(), entries: [{ ...journalEntry, mood: null, stress: null }] })).toMatchObject({ savedDays: 1, mood: { samples: 0, average: null } });
  expect(reflect(undefined)).toBeUndefined();
});
it.each([{ ...journalFixture(), accountId: '72000000-0000-4000-8000-000000000009' }, { ...journalFixture(), timeZone: 'Asia/Tokyo' },
  { ...journalFixture(), from: '2025-03-05' }, { ...journalFixture(), entries: [journalEntry, journalEntry] }])('withholds mismatched, partial or duplicate history', value => {
  expect(reflect(value)).toBeUndefined();
});
it('filters out older dates for a 7-day reflection while retaining them for 30 days', () => {
  const value = { ...journalFixture(), entries: [journalEntry, { ...journalEntry, id: '72000000-0000-4000-8000-000000000003', date: '2025-02-20', mood: 1 }] };
  expect(reflect(value)?.mood.samples).toBe(1); expect(reflect(value, '2025-03-09', 30)?.mood.samples).toBe(2);
});
it.each([['2025-03-09', '2025-03-03'], ['2025-11-02', '2025-10-27'], ['2024-03-01', '2024-02-24'], ['2025-01-01', '2024-12-26']])('keeps seven calendar dates across DST/leap/year boundaries %s', (through, from) => {
  const value = { ...journalFixture(), from: through, through, entries: [] };
  // A single day cannot masquerade as a complete week.
  expect(reflect(value, through)).toBeUndefined();
  const complete = reflect({ ...value, from }, through);
  expect(complete?.calendar).toHaveLength(7); expect(complete?.calendar[0].date).toBe(from); expect(complete?.calendar.at(-1)?.date).toBe(through);
});
it('loads actual saved values, starts blank and reconciles only matching fields', () => {
  expect(journalFields(null)).toEqual({ mood: null, energy: null, stress: null, note: '' });
  expect(journalFields(journalEntry)).toMatchObject({ mood: 4, note: 'A calm afternoon' });
  expect(matchesJournalDraft(journalEntry, { ...journalFields(journalEntry), note: ' A calm afternoon ' })).toBe(true);
  expect(matchesJournalDraft(journalEntry, { ...journalFields(journalEntry), stress: null })).toBe(false);
});
