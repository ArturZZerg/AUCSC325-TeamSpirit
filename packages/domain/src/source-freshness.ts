export type SourceAvailability = 'available' | 'stale' | 'unavailable' | 'notConnected';

// Three normal 30-minute Canvas sync intervals, matching campus-source aging.
export const sourceFreshnessMaxAgeMs = 90 * 60_000;

/** Reevaluate saved availability using elapsed instants, without upgrading a
 * source or treating a future/unknown success as fresh. Independent of DST. */
export function sourceAvailabilityAt(source: { availability: SourceAvailability; lastSuccessfulSyncAt: string | null }, now: string): SourceAvailability {
  if (source.availability !== 'available') return source.availability;
  const age = Date.parse(now) - Date.parse(source.lastSuccessfulSyncAt ?? '');
  return age >= 0 && age < sourceFreshnessMaxAgeMs ? 'available' : 'stale';
}
