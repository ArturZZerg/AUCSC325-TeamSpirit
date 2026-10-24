// Icon fonts load asynchronously and only add act() noise to behavior tests.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// Over-the-air updates are disabled outside production builds (ADR 021).
jest.mock('expo-updates', () => ({ isEnabled: false, runtimeVersion: null, checkForUpdateAsync: jest.fn(), fetchUpdateAsync: jest.fn(), reloadAsync: jest.fn(),
  useUpdates: () => ({ isUpdatePending: false, isDownloading: false, isChecking: false, currentlyRunning: { runtimeVersion: null, createdAt: null, isEmbeddedLaunch: true } }) }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn() }));
jest.mock('expo-background-task', () => ({ getStatusAsync: jest.fn(), registerTaskAsync: jest.fn(), BackgroundTaskResult: { Success: 1, Failed: 2 }, BackgroundTaskStatus: { Restricted: 1, Available: 2 } }));
