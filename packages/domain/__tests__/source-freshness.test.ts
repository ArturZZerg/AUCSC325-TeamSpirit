import { sourceAvailabilityAt, sourceFreshnessMaxAgeMs } from '../src';

const now = '2026-03-08T09:30:00.000Z';
describe('saved source age (#189; ToR 10, 19)', () => {
  it('allows three normal sync intervals and expires exactly at the cutoff', () => {
    expect(sourceFreshnessMaxAgeMs).toBe(90 * 60_000);
    for (const [age, availability] of [[0, 'available'], [sourceFreshnessMaxAgeMs - 1, 'available'],
      [sourceFreshnessMaxAgeMs, 'stale'], [sourceFreshnessMaxAgeMs + 1, 'stale'], [-1, 'stale']] as const) {
      expect(sourceAvailabilityAt({ availability: 'available', lastSuccessfulSyncAt: new Date(Date.parse(now) - age).toISOString() }, now)).toBe(availability);
    }
  });
  it.each([null, 'not-an-instant'])('cannot treat missing or invalid success %s as fresh', lastSuccessfulSyncAt => {
    expect(sourceAvailabilityAt({ availability: 'available', lastSuccessfulSyncAt }, now)).toBe('stale');
  });
  it.each(['stale', 'unavailable', 'notConnected'] as const)('never upgrades %s from a recent timestamp', availability => {
    expect(sourceAvailabilityAt({ availability, lastSuccessfulSyncAt: now }, now)).toBe(availability);
  });
  it.each([
    ['2026-03-08T08:00:00Z', '2026-03-08T09:30:00Z'],
    ['2026-11-01T07:00:00Z', '2026-11-01T08:30:00Z'],
    ['2026-10-04T05:00:00Z', '2026-10-04T06:30:00Z'],
  ])('uses elapsed instants across DST or local midnight: %s through %s', (lastSuccessfulSyncAt, at) => {
    expect(sourceAvailabilityAt({ availability: 'available', lastSuccessfulSyncAt }, at)).toBe('stale');
  });
});
