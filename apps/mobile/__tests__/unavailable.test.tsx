import { fireEvent, render, screen } from '@testing-library/react-native';
import UnavailablePage from '../app/+not-found';
let mockSession: object | null = null, mockReady = true;
const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ next: 'https://untrusted.test', code: 'private-link-code', unmatched: ['private-path'] }) }));
jest.mock('@/store/session', () => ({ useSessionStore: () => ({ session: mockSession, ready: mockReady }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
beforeEach(() => { jest.clearAllMocks(); mockSession = null; mockReady = true; });
it('offers fixed sign-in and offline Help recovery without an account', () => {
  render(<UnavailablePage/>);
  expect(screen.getByRole('header', { name: 'This page isn’t available.' })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/auth');
  fireEvent.press(screen.getByRole('button', { name: 'Open Help & data' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/help');
});
it('returns an authenticated student to Today using the active session', () => {
  mockSession = {}; const view = render(<UnavailablePage/>);
  fireEvent.press(screen.getByRole('button', { name: 'Back to Today' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/today');
  mockSession = null; view.rerender(<UnavailablePage/>);
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/auth');
});
it('waits for restoration before allowing either navigation action', () => {
  mockReady = false; const view = render(<UnavailablePage/>);
  expect(screen.getByText('Opening your app…')).toBeOnTheScreen();
  for (const name of ['Back to sign in', 'Open Help & data']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name }));
  }
  expect(mockRouter.replace).not.toHaveBeenCalled();
  mockReady = true; view.rerender(<UnavailablePage/>);
  expect(screen.queryByText('Opening your app…')).toBeNull();
});
it('does not display or follow an incoming path, private code or arbitrary continuation', () => {
  render(<UnavailablePage/>);
  for (const text of ['private-link-code', 'private-path', 'https://untrusted.test']) expect(screen.queryByText(text)).toBeNull();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
