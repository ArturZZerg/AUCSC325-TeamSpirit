import type { LatestRelease } from '@/features/app-update';

// The hosted web app is always current: every load fetches the latest release.
export const appUpdatesEnabled = () => false;
export const downloadAppUpdate = async (): Promise<'downloaded' | 'current'> => 'current';
export const restartToUpdate = async () => undefined;
export const useAppUpdateStatus = () => ({ pending: false, busy: false, runtimeVersion: null, createdAt: null, embedded: true });
export const newerNativeRelease = async (): Promise<LatestRelease | null> => null;
export const registerNightlyUpdates = async () => undefined;
