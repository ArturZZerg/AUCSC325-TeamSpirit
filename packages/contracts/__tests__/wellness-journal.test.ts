import { wellnessJournalQuerySchema, wellnessJournalSchema, saveWellnessJournalSchema, deleteWellnessJournalSchema } from '../src';
const id = '71000000-0000-4000-8000-000000000001';
const empty = { accountId: id, timeZone: 'America/Edmonton', from: '2025-03-01', through: '2025-03-31', capturedAt: '2025-04-01T00:00:00Z', entries: [] };
const row = { id, date: '2025-03-09', createdAt: empty.capturedAt, revision: 1, mood: null, energy: 2, stress: null, note: 'A note' };
it('accepts complete empty coverage, sparse ratings and a 31-day inclusive window across DST', () => {
  expect(wellnessJournalSchema.parse(empty).entries).toEqual([]);
  expect(wellnessJournalSchema.parse({ ...empty, entries: [row] }).entries[0].mood).toBeNull();
});
it.each([{ from: '2025-03-01', through: '2025-04-01' }, { from: '2025-03-09', through: '2025-03-08' },
  { from: '2025-02-29', through: '2025-03-01' }, { from: '2025-03-09', through: '2025-03-09', userId: id }])('rejects invalid or oversized ranges %j', range => {
  expect(wellnessJournalQuerySchema.safeParse(range).success).toBe(false);
});
it.each([{ entries: [row, row] }, { entries: [{ ...row, date: '2025-04-01' }] }, { entries: [{ ...row, revision: 0 }] }, { entries: [{ ...row, userId: id }] }])('rejects duplicate/out-of-range/unsafe journal records', ({ entries }) => {
  expect(wellnessJournalSchema.safeParse({ ...empty, entries }).success).toBe(false);
});
it('requires known absence or reviewed identity/revision and meaningful optional content', () => {
  expect(saveWellnessJournalSchema.parse({ expected: null, mood: null, energy: null, stress: null, note: ' Note ' }).note).toBe('Note');
  expect(saveWellnessJournalSchema.parse({ expected: { id, revision: 1 }, mood: 4, energy: null, stress: null, note: null }).expected).toEqual({ id, revision: 1 });
  expect(saveWellnessJournalSchema.safeParse({ mood: 4, energy: null, stress: null, note: null }).success).toBe(false);
  expect(saveWellnessJournalSchema.safeParse({ expected: null, mood: null, energy: null, stress: null, note: ' ' }).success).toBe(false);
});
it.each([0, -1, 1.5, 2147483648])('rejects invalid delete revisions %s', revision => {
  expect(deleteWellnessJournalSchema.safeParse({ expected: { id, revision } }).success).toBe(false);
});
it('rejects out-of-scale ratings and oversized notes', () => {
  expect(saveWellnessJournalSchema.safeParse({ expected: null, mood: 6, energy: null, stress: null, note: null }).success).toBe(false);
  expect(saveWellnessJournalSchema.safeParse({ expected: null, mood: null, energy: null, stress: null, note: 'x'.repeat(2001) }).success).toBe(false);
});
