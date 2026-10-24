import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as Updates from 'expo-updates';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { inNightWindow, installedLabel, nativeReleaseOffer } from '../src/features/app-update';
import { AppUpdateCard as Card } from '../src/features/app-update-card';

const release = { runtimeVersion: '2', version: '0.2.0', sha256: 'a'.repeat(64), publishedAt: '2026-10-24T05:00:00.000Z',
  apkUrl: 'https://workout.vakula-dev.com/campusflow-updates/android/campusflow-2.apk' };
const enable = (enabled: boolean, extra: object = {}) => Object.assign(Updates as unknown as Record<string, unknown>, { isEnabled: enabled, runtimeVersion: '1', ...extra });
afterEach(() => { enable(false); jest.restoreAllMocks(); jest.mocked(Updates.checkForUpdateAsync).mockReset(); jest.mocked(Updates.fetchUpdateAsync).mockReset(); });

describe('update decisions', () => {
  it('offers a new APK only for a strictly higher, well-formed native runtime', () => {
    expect(nativeReleaseOffer('1', release)).toEqual(release);
    expect(nativeReleaseOffer('2', release)).toBeNull();
    expect(nativeReleaseOffer('3', release)).toBeNull();
    expect(nativeReleaseOffer(null, release)).toBeNull();
    expect(nativeReleaseOffer('1', { ...release, apkUrl: 'http://example.test/app.apk' })).toBeNull();
    expect(nativeReleaseOffer('1', { ...release, runtimeVersion: '../2' })).toBeNull();
  });
  it('downloads in the background only between 01:00 and 05:00 device time', () => {
    expect([0, 1, 4, 5, 13].map(hour => inNightWindow(new Date(2026, 9, 24, hour, 30)))).toEqual([false, true, true, false, false]);
  });
  it('describes the embedded build and downloaded updates', () => {
    expect(installedLabel('1', null, true)).toBe('App build 1 · version installed with the app');
    expect(installedLabel('1', new Date(2026, 9, 24, 3, 5), false)).toMatch(/^App build 1 · update from /);
  });
});

describe('App updates card', () => {
  it('is hidden in development and web builds', () => {
    render(<Card/>);
    expect(screen.queryByText('App updates')).toBeNull();
  });
  it('downloads an update for this runtime and offers a restart', async () => {
    enable(true);
    jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({ isAvailable: true } as never);
    jest.mocked(Updates.fetchUpdateAsync).mockResolvedValue({ isNew: true } as never);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    render(<Card/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Check for updates' })); });
    expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
    expect(screen.getByText('Update downloaded. Restart to start using it.')).toBeOnTheScreen();
  });
  it('offers a fresh install when native code changed, without downloading JavaScript for another runtime', async () => {
    enable(true);
    jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({ isAvailable: false } as never);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => release } as Response);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<Card/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Check for updates' })); });
    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Download version 0.2.0' }));
    expect(open).toHaveBeenCalledWith(release.apkUrl);
  });
  it('reports an unreachable server without claiming the app is current', async () => {
    enable(true);
    jest.mocked(Updates.checkForUpdateAsync).mockRejectedValue(new Error('offline'));
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<Card/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Check for updates' })); });
    expect(screen.getByText(/Could not reach the update server/)).toBeOnTheScreen();
  });
});

describe('nightly background task', () => {
  it('registers once when enabled and downloads only inside the night window', async () => {
    let service!: typeof import('../src/services/app-updates'), updates!: typeof Updates, tasks!: typeof TaskManager, background!: typeof BackgroundTask;
    jest.isolateModules(() => {
      // The task is defined when the bundle loads, so enable updates before importing the service.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      updates = require('expo-updates'); tasks = require('expo-task-manager'); background = require('expo-background-task');
      Object.assign(updates, { isEnabled: true, runtimeVersion: '1' });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      service = require('../src/services/app-updates');
    });
    jest.mocked(background.getStatusAsync).mockResolvedValue(2 as never);
    jest.mocked(tasks.isTaskRegisteredAsync).mockResolvedValue(false);
    jest.mocked(updates.checkForUpdateAsync).mockResolvedValue({ isAvailable: false } as never);
    await service.registerNightlyUpdates();
    expect(background.registerTaskAsync).toHaveBeenCalledWith('campusflow-night-update', { minimumInterval: 60 });
    const task = jest.mocked(tasks.defineTask).mock.calls.at(-1)![1] as () => Promise<number>;
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 24, 14, 0));
    await task(); expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
    jest.setSystemTime(new Date(2026, 9, 24, 2, 0));
    await task(); expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
