import { syncedLabel } from '../src/features/synced-label';

const zone = 'America/Edmonton', now = Date.parse('2026-10-22T04:00:00Z'); // 10:00 p.m. Oct 21 at UTC−6

describe('syncedLabel', () => {
  it('says how recent a sync is, in the account zone', () => {
    expect(syncedLabel('2026-10-22T03:59:40Z', zone, now)).toBe('just now');
    expect(syncedLabel('2026-10-22T03:48:00Z', zone, now)).toBe('12 min ago');
    expect(syncedLabel('2026-10-21T20:30:00Z', zone, now)).toMatch(/^today at 2:30\s?(PM|p\.m\.)$/i);
    expect(syncedLabel('2026-10-21T02:30:00Z', zone, now)).toMatch(/^yesterday at 8:30\s?(PM|p\.m\.)$/i);
    expect(syncedLabel('2026-10-18T20:30:00Z', zone, now)).toMatch(/^Oct 18, 2:30\s?(PM|p\.m\.)$/i);
  });
  it('uses the account day, not UTC, at local midnight', () => {
    // Now is 11:50 p.m. Oct 21 in Edmonton but already Oct 22 in UTC; a 5 p.m. sync is still "today".
    expect(syncedLabel('2026-10-21T23:00:00Z', zone, Date.parse('2026-10-22T05:50:00Z'))).toMatch(/^today at 5:00\s?(PM|p\.m\.)$/i);
  });
});
