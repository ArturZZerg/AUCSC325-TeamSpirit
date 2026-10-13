import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Slot } from 'expo-router';
import { Text } from 'react-native';
import RootLayout from '../app/_layout';
import UnavailablePage from '../app/+not-found';

let mockSession: object | null = null;
const mockRestore = jest.fn();
jest.mock('@/store/session', () => ({ useSessionStore: () => ({ ready: true, session: mockSession, restore: mockRestore }) }));
jest.mock('@/features/device-reminders', () => ({ DeviceReminderSync: () => null }));
jest.mock('@/features/focus-recovery-sync', () => ({ FocusRecoverySync: () => null }));
jest.mock('@/features/session-access-sync', () => ({ SessionAccessSync: () => null }));
jest.mock('@/features/reminder-response-sync', () => ({ ReminderResponseSync: () => null }));
jest.mock('decode-uri-component', () => jest.fn(() => { throw new Error('Unsafe decoder reached by incoming link'); }));

const routes = { _layout: RootLayout, '+not-found': UnavailablePage,
  auth: () => <Text>Ordinary sign-in</Text>, recover: () => <Text>Recovery</Text>, verify: () => <Text>Verify</Text>,
  help: () => <Text>Offline Help</Text>, account: () => <Text>Owned account</Text>,
  '(tabs)/_layout': () => <Slot/>, '(tabs)/today': () => <Text>Owned daily plan</Text> };

beforeEach(() => { mockSession = null; jest.clearAllMocks(); });
afterEach(() => { expect(jest.requireMock('decode-uri-component')).not.toHaveBeenCalled(); jest.useRealTimers(); });

it('mounts the real recovery screen for an unknown signed-out link and replaces it with sign-in', async () => {
  const ui = renderRouter(routes, { initialUrl: '/outdated/private-path?code=private-link-code&next=https%3A%2F%2Funtrusted.test' });
  await waitFor(() => expect(screen.getByRole('header', { name: 'This page isn’t available.' })).toBeOnTheScreen());
  expect(ui.getSegments()).toEqual(['+not-found']);
  for (const value of ['private-path', 'private-link-code', 'https://untrusted.test']) expect(screen.queryByText(value)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  await waitFor(() => expect(ui.getPathname()).toBe('/auth'));
  expect(screen.getByText('Ordinary sign-in')).toBeOnTheScreen();
});

it('offers offline Help through the installed Router from an unavailable signed-out link', async () => {
  const ui = renderRouter(routes, { initialUrl: '/unavailable' });
  fireEvent.press(await screen.findByRole('button', { name: 'Open Help & data' }));
  await waitFor(() => expect(ui.getPathname()).toBe('/help'));
  expect(screen.getByText('Offline Help')).toBeOnTheScreen();
});

it('returns an authenticated owner to their daily plan from an unavailable link', async () => {
  mockSession = {};
  const ui = renderRouter(routes, { initialUrl: '/unavailable?next=account' });
  fireEvent.press(await screen.findByRole('button', { name: 'Back to Today' }));
  await waitFor(() => expect(ui.getPathname()).toBe('/today'));
  expect(screen.getByText('Owned daily plan')).toBeOnTheScreen();
});

it('continues guarding an actual private account route before sign-in', async () => {
  const ui = renderRouter(routes, { initialUrl: '/account' });
  await waitFor(() => expect(ui.getPathnameWithParams()).toBe('/auth?next=account'));
  expect(screen.queryByText('Owned account')).toBeNull();
});

it.each(['/missing/%', '/missing/%E0%A4%A', '/missing/%C0%AF'])('keeps an unavailable incoming link with malformed escaping recoverable: %s', async initialUrl => {
  const ui = renderRouter(routes, { initialUrl });
  await waitFor(() => expect(screen.getByRole('header', { name: 'This page isn’t available.' })).toBeOnTheScreen());
  expect(ui.getSegments()).toEqual(['+not-found']);
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  await waitFor(() => expect(ui.getPathname()).toBe('/auth'));
});
