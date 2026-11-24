import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { DesktopSidebar } from '../app/(tabs)/_layout';

const mockPush = jest.fn(), mockNavigate = jest.fn(), mockEmit = jest.fn();
const routes = ['today', 'tasks', 'campus', 'wellness', 'gym', 'settings'].map(name => ({ key: name, name }));
const mockTabBarProps = {
  state: { index: 0, routes },
  descriptors: Object.fromEntries(routes.map(route => [route.key, { options: { title: route.name[0].toUpperCase() + route.name.slice(1) } }])),
  navigation: { emit: mockEmit, navigate: mockNavigate },
};
jest.mock('expo-router', () => ({
  Tabs: Object.assign(({ tabBar }: { tabBar?: (props: typeof mockTabBarProps) => React.ReactNode }) => {
    const { Text } = jest.requireActual('react-native');
    return tabBar ? tabBar(mockTabBarProps) : <Text>Bottom navigation</Text>;
  }, { Screen: () => null }),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../src/store/session', () => ({
  useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: 'test-session', user: { id: 'student', displayName: 'Sam Student' } } }),
}));

beforeEach(() => { jest.clearAllMocks(); mockEmit.mockReturnValue({ defaultPrevented: false }); });
function Sidebar() { return <DesktopSidebar {...mockTabBarProps as unknown as ComponentProps<typeof DesktopSidebar>}/>; }

it('shows all six desktop destinations and navigates through the existing tab navigator', () => {
  render(<Sidebar/>);
  expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeOnTheScreen();
  for (const name of ['Tasks', 'Campus', 'Wellness', 'Gym', 'Settings']) expect(screen.getByRole('tab', { name })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('tab', { name: 'Tasks' }));
  expect(mockEmit).toHaveBeenCalledWith({ type: 'tabPress', target: 'tasks', canPreventDefault: true });
  expect(mockNavigate).toHaveBeenCalledWith('tasks', undefined);
});

it('honours prevented tab navigation and keeps the active tab in place', () => {
  render(<Sidebar/>);
  fireEvent.press(screen.getByRole('tab', { name: 'Today' }));
  expect(mockNavigate).not.toHaveBeenCalled();
  mockEmit.mockReturnValue({ defaultPrevented: true });
  fireEvent.press(screen.getByRole('tab', { name: 'Tasks' }));
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('opens the existing workspace and account routes', () => {
  render(<Sidebar/>);
  fireEvent.press(screen.getByRole('button', { name: 'Academics' }));
  expect(mockPush).toHaveBeenLastCalledWith('/academics');
  fireEvent.press(screen.getByRole('button', { name: 'Start a focus session' }));
  expect(mockPush).toHaveBeenLastCalledWith('/focus');
  fireEvent.press(screen.getByRole('button', { name: 'Manage your account' }));
  expect(mockPush).toHaveBeenLastCalledWith('/account');
});
