import { z } from 'zod';

/** Native release offer published next to the APK (ADR 021). */
export const latestReleaseSchema = z.object({
  runtimeVersion: z.string().regex(/^[0-9]{1,6}$/), version: z.string().max(40), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  publishedAt: z.string().datetime(), apkUrl: z.string().url().startsWith('https://'),
});
export type LatestRelease = z.infer<typeof latestReleaseSchema>;

/** Background downloads run only while students are most likely asleep (device-local time). */
export const inNightWindow = (at: Date) => at.getHours() >= 1 && at.getHours() < 5;

/** Offer a new APK only for a strictly higher native runtime; the same runtime updates over the air. */
export function nativeReleaseOffer(installedRuntime: string | null, latest: unknown): LatestRelease | null {
  const release = latestReleaseSchema.safeParse(latest);
  if (!release.success || !installedRuntime || !/^[0-9]+$/.test(installedRuntime)) return null;
  return Number(release.data.runtimeVersion) > Number(installedRuntime) ? release.data : null;
}

export function installedLabel(runtimeVersion: string | null, updateCreatedAt: Date | null, embedded: boolean) {
  const date = updateCreatedAt && !embedded
    ? `update from ${updateCreatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${updateCreatedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : 'version installed with the app';
  return `App build ${runtimeVersion ?? 'unknown'} · ${date}`;
}
