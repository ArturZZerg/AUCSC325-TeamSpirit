import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Updates from 'expo-updates';
import { inNightWindow, nativeReleaseOffer, type LatestRelease } from '@/features/app-update';
import { updatesOrigin } from '../../config/app-updates.cjs';

// Self-hosted over-the-air updates (ADR 021). Screens call these functions;
// only production builds have Updates.isEnabled.
const nightTask = 'campusflow-night-update';
export const appUpdatesEnabled = () => Updates.isEnabled;

/** Downloads a newer update for this native runtime. It applies on the next start or restartToUpdate(). */
export async function downloadAppUpdate(): Promise<'downloaded' | 'current'> {
  if (!Updates.isEnabled) return 'current';
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return 'current';
  const fetched = await Updates.fetchUpdateAsync();
  return fetched.isNew ? 'downloaded' : 'current';
}
export const restartToUpdate = () => Updates.reloadAsync();
export function useAppUpdateStatus() {
  const { isUpdatePending, isDownloading, isChecking, currentlyRunning } = Updates.useUpdates();
  return { pending: isUpdatePending, busy: isDownloading || isChecking, runtimeVersion: currentlyRunning.runtimeVersion ?? null,
    createdAt: currentlyRunning.createdAt ?? null, embedded: currentlyRunning.isEmbeddedLaunch };
}

/** A newer APK when native code changed; null when this build is the latest native runtime. */
export async function newerNativeRelease(): Promise<LatestRelease | null> {
  if (!Updates.isEnabled) return null;
  const response = await fetch(`${updatesOrigin}/android/latest.json`, { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not check for a new app version.');
  return nativeReleaseOffer(Updates.runtimeVersion, await response.json());
}

// Task definitions must run when the JavaScript bundle loads, including in the background.
if (Updates.isEnabled) {
  TaskManager.defineTask(nightTask, async () => {
    if (!inNightWindow(new Date())) return BackgroundTask.BackgroundTaskResult.Success;
    try { await downloadAppUpdate(); return BackgroundTask.BackgroundTaskResult.Success; }
    catch { return BackgroundTask.BackgroundTaskResult.Failed; }
  });
}
/** Asks the OS to wake the app about hourly; the task downloads only at night. */
export async function registerNightlyUpdates() {
  if (!Updates.isEnabled) return;
  if (await BackgroundTask.getStatusAsync() !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!await TaskManager.isTaskRegisteredAsync(nightTask)) await BackgroundTask.registerTaskAsync(nightTask, { minimumInterval: 60 });
}
