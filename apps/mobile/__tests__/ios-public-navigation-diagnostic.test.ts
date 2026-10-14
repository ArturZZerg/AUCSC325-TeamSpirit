import { Platform } from 'react-native';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
const prior = process.env.EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS;
let record: typeof import('../src/lib/ios-public-navigation-diagnostic').publicNavigationDiagnostic;
let output: jest.SpyInstance;
beforeEach(() => {
  jest.resetModules(); process.env.EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS = '1';
  jest.requireMock('react-native').Platform.OS = 'ios';
  record = jest.requireActual('../src/lib/ios-public-navigation-diagnostic').publicNavigationDiagnostic;
  output = jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => { output.mockRestore(); });
afterAll(() => {
  if (prior === undefined) delete process.env.EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS;
  else process.env.EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS = prior;
});

it('stays silent in ordinary builds and on other platforms', () => {
  delete process.env.EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS; record('auth-mounted');
  process.env.EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS = 'true'; record('route-help');
  process.env.EXPO_PUBLIC_IOS_PUBLIC_DIAGNOSTICS = '1';
  const platform = jest.requireMock('react-native').Platform as typeof Platform;
  platform.OS = 'android'; record('help-back-press');
  expect(output).not.toHaveBeenCalled();
});
it('records only ordered fixed public events, rejecting unexpected runtime data', () => {
  record('auth-mounted'); record('help-back-in');
  record('private-email@example.test?token=secret' as Parameters<typeof record>[0]);
  record({ email: 'private@example.test' } as unknown as Parameters<typeof record>[0]);
  record('help-back-press'); record('route-auth');
  expect(output.mock.calls).toEqual([
    ['CampusFlowPublicNavigation:1:auth-mounted'], ['CampusFlowPublicNavigation:2:help-back-in'],
    ['CampusFlowPublicNavigation:3:help-back-press'], ['CampusFlowPublicNavigation:4:route-auth'],
  ]);
});
it('bounds output and never throws when the native logger fails', () => {
  output.mockImplementationOnce(() => { throw new Error('logger unavailable'); });
  expect(() => record('route-help')).not.toThrow();
  for (let i = 0; i < 100; i++) record('route-auth');
  expect(output).toHaveBeenCalledTimes(64);
  expect(output).toHaveBeenLastCalledWith('CampusFlowPublicNavigation:64:route-auth');
});
