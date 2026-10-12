import type { JournalEntry } from '../src/features/wellness-journal';
export const journalOwner = '72000000-0000-4000-8000-000000000001';
export const journalEntry: JournalEntry = { id: '72000000-0000-4000-8000-000000000002', date: '2025-03-09',
  mood: 4, energy: null, stress: 2, note: 'A calm afternoon', revision: 3, createdAt: '2025-03-09T20:00:00Z' };
export const journalFixture = () => ({ accountId: journalOwner, timeZone: 'America/Edmonton', from: '2025-02-08', through: '2025-03-09',
  capturedAt: '2025-03-09T20:00:00Z', entries: [journalEntry] });
