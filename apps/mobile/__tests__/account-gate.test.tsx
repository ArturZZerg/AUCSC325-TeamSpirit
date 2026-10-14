import { render } from '@testing-library/react-native';
import RootLayout from '../app/_layout';
let mockSegments = ['auth'], mockNext: string | undefined, mockSession: object | null;
const mockRouter = { replace: jest.fn() }, mockRestore = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useSegments: () => mockSegments,
  useGlobalSearchParams: () => ({ next: mockNext }), Stack: Object.assign(() => null, { Screen: () => null }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: () => ({ ready: true, session: mockSession, restore: mockRestore }) }));
jest.mock('../src/features/device-reminders', () => ({ DeviceReminderSync: () => null }));
jest.mock('../src/features/focus-recovery-sync', () => ({ FocusRecoverySync: () => null }));
jest.mock('../src/features/session-access-sync', () => ({ SessionAccessSync: () => null }));
jest.mock('../src/features/reminder-response-sync', () => ({ ReminderResponseSync: () => null }));
beforeEach(() => { jest.clearAllMocks(); mockSegments = ['auth']; mockNext = undefined; mockSession = {}; });
it('continues account self-service after sign-in using the active route query', () => {
  mockNext = 'account'; render(<RootLayout/>); expect(mockRouter.replace).toHaveBeenCalledWith('/account');
});
it('routes signed-out account visitors to sign-in with a safe continuation', () => {
  mockSession = null; mockSegments = ['account']; render(<RootLayout/>); expect(mockRouter.replace).toHaveBeenCalledWith('/auth?next=account');
});
it('never follows a client-supplied arbitrary redirect', () => {
  mockNext = 'https://example.test'; render(<RootLayout/>); expect(mockRouter.replace).toHaveBeenCalledWith('/today');
});
it.each(['recover', 'verify'])('allows signed-out %s and returns an already signed-in visitor to their app', route => {
  mockSegments = [route]; mockSession = null; const ui = render(<RootLayout/>); expect(mockRouter.replace).not.toHaveBeenCalled();
  mockSession = {}; mockNext = 'account'; ui.rerender(<RootLayout/>); expect(mockRouter.replace).toHaveBeenCalledWith('/account');
});
it('keeps public help readable before and after signing in', () => {
  mockSegments = ['help']; mockSession = null; const ui = render(<RootLayout/>); expect(mockRouter.replace).not.toHaveBeenCalled();
  mockSession = {}; ui.rerender(<RootLayout/>); expect(mockRouter.replace).not.toHaveBeenCalled();
});
it.each([['journal'], ['planner'], ['(tabs)', 'settings'], ['help', 'private'], ['unknown']])('keeps %s private instead of widening the help exemption', (...segments) => {
  mockSegments = segments; mockSession = null; render(<RootLayout/>); expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
});

it('allows only the exact generic unavailable-page leaf without widening private routes', () => {
  mockSession = null; mockNext = 'https://untrusted.test'; mockSegments = ['+not-found'];
  const view = render(<RootLayout/>); expect(mockRouter.replace).not.toHaveBeenCalled();
  mockSession = {}; view.rerender(<RootLayout/>); expect(mockRouter.replace).not.toHaveBeenCalled();
  mockSession = null; mockSegments = ['+not-found', 'account']; view.rerender(<RootLayout/>);
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/auth');
});
