import { render } from '@testing-library/react-native';
import TabsLayout from '../app/(tabs)/_layout';

// The phone tab bar must stay visible: Android edge-to-edge keyboard events are
// unreliable, and hiding on keyboard left the bar missing after sign-in.
const mockTabs = jest.fn();
jest.mock('expo-router', () => ({
  Tabs: Object.assign((props: unknown) => { mockTabs(props); return null; }, { Screen: () => null }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('../src/store/session', () => ({
  useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: 'test-session', user: { id: 'student', displayName: 'Sam Student' } } }),
}));

it('keeps the phone tab bar visible while the keyboard is open', () => {
  render(<TabsLayout/>);
  const { tabBar, screenOptions } = mockTabs.mock.calls[0][0] as { tabBar?: unknown; screenOptions: (args: { route: { name: string } }) => Record<string, unknown> };
  expect(tabBar).toBeUndefined();
  for (const name of ['today', 'tasks', 'campus', 'wellness', 'gym', 'settings']) {
    const options = screenOptions({ route: { name } });
    expect(options.tabBarPosition).toBe('bottom');
    expect(options.tabBarHideOnKeyboard).not.toBe(true);
  }
});
