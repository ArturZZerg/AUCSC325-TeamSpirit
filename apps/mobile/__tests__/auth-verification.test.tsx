import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Auth from '../app/auth';
import { api } from '../src/lib/api';

let mockSession: { accessToken: string } | null, mockNext: string | undefined, mockSessionUnavailable = false;
const mockRouter = { replace: jest.fn(), push: jest.fn() }, mockNavigation = { addListener: jest.fn() }, mockSetSession = jest.fn();
let mockBeforeRemove: (event: { preventDefault: () => void }) => void;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ next: mockNext }), useRouter: () => mockRouter, useNavigation: () => mockNavigation }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../src/store/session', () => ({ useSessionStore: Object.assign(() => ({ session: mockSession, setSession: mockSetSession, accountDeleted: false, sessionUnavailable: mockSessionUnavailable, cleanupError: null, retryCleanup: jest.fn() }), { getState: () => ({ session: mockSession }) }) }));
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
const call = jest.mocked(api), email = 'student@example.test', password = 'account-password-123';
const session = { accessToken: 'fresh-access', expiresAt: '2026-11-11T12:00:00.000Z', user: { id: '123e4567-e89b-12d3-a456-426614174000', email, displayName: 'Student', timeZone: 'UTC', createdAt: '2026-10-11T12:00:00.000Z' } };
beforeEach(() => {
  jest.clearAllMocks(); mockSession = null; mockNext = undefined; mockSessionUnavailable = false;
  mockNavigation.addListener.mockImplementation((_event, callback) => { mockBeforeRemove = callback; return () => {}; });
  call.mockReset().mockImplementation(async path => path === '/auth/capability' ? { registration: 'verified', verificationAvailable: true }
    : { verificationRequired: true, codeRequested: true, expiresInMinutes: 15 });
});
const press = async (text: string) => act(async () => { fireEvent.press(screen.getByText(text)); });
const enterLogin = () => { fireEvent.changeText(screen.getByLabelText('Email'), email); fireEvent.changeText(screen.getByLabelText('Password'), password); };
it('explains session recovery and retained server data while offering ordinary sign-in', async () => {
  mockSessionUnavailable = true; mockNext = 'account'; render(<Auth/>); await act(async () => {});
  expect(screen.getByText('Sign in to manage your account')).toBeTruthy();
  expect(screen.getByText(/Your session is no longer available/)).toHaveProp('accessibilityRole', 'alert');
  expect(screen.getByText('Sign in')).toBeEnabled();
});
it('handles verification-required login without storing a session or keeping a password draft', async () => {
  render(<Auth/>); enterLogin(); await press('Sign in'); expect(screen.getByText('Check your email')).toBeTruthy();
  expect(mockSetSession).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Password')).toBeNull();
  await press('Back to sign in'); expect(screen.getByLabelText('Password').props.value).toBe('');
});
it('handles verified-signup registration without silently treating its response as app access', async () => {
  render(<Auth/>); await press('Create an account'); await screen.findByText('Verify your email before signing in. Your student data stays private.');
  enterLogin(); fireEvent.changeText(screen.getByLabelText('Name'), 'Student'); fireEvent.changeText(screen.getByLabelText('Time zone'), 'UTC');
  await press('Create account'); expect(screen.getByText('Check your email')).toBeTruthy(); expect(mockSetSession).not.toHaveBeenCalled();
  expect(call.mock.calls.at(-1)?.[0]).toBe('/auth/register');
});
it('reports withheld code requests honestly', async () => {
  render(<Auth/>); enterLogin(); call.mockResolvedValueOnce({ verificationRequired: true, codeRequested: false, expiresInMinutes: 15 });
  await press('Sign in'); expect(screen.getByText('Verification is required before you can sign in. Code requests are temporarily limited. You can use a recent code or request one later.')).toBeTruthy();
});
it.each([undefined, 'account', 'https://untrusted.test'])('opens verification with a supported continuation and no credential route data: %s', next => {
  mockNext = next; render(<Auth/>); enterLogin(); fireEvent.press(screen.getByText('I have a verification code'));
  expect(mockRouter.replace).toHaveBeenCalledWith(next === 'account' ? '/verify?next=account' : '/verify');
  expect(screen.getByLabelText('Password').props.value).toBe('');
});
it('stores a validated ordinary session for verified or preview sign-in', async () => {
  render(<Auth/>); enterLogin(); call.mockResolvedValueOnce(session); await press('Sign in'); expect(mockSetSession).toHaveBeenCalledWith(session);
});
it('prevents closed signup while allowing existing-account sign-in', async () => {
  call.mockResolvedValueOnce({ registration: 'closed', verificationAvailable: false }); render(<Auth/>); await press('Create an account');
  await screen.findByText('New accounts are currently unavailable. Existing users can still sign in.'); expect(screen.getByText('Create account')).toBeDisabled();
  await press('I already have an account'); expect(screen.getByText('Sign in')).toBeEnabled();
});
it('makes local preview signup explicit and allows a failed capability check to retry', async () => {
  call.mockRejectedValueOnce(new Error('offline')); render(<Auth/>); await press('Create an account');
  await screen.findByText('Couldn’t check signup availability. Retry or sign in to an existing account.'); expect(screen.getByText('Create account')).toBeDisabled();
  call.mockResolvedValueOnce({ registration: 'preview', verificationAvailable: false }); await press('Check again');
  expect(screen.getByText('Preview accounts don’t verify email. Use a test address.')).toBeTruthy(); expect(screen.getByText('Create account')).toBeEnabled();
});
it('retains failed sign-in drafts without accepting a malformed result', async () => {
  render(<Auth/>); enterLogin(); call.mockResolvedValueOnce({ verificationRequired: true, accessToken: 'bad' }); await press('Sign in');
  expect(mockSetSession).not.toHaveBeenCalled(); expect(screen.queryByText('Check your email')).toBeNull(); expect(screen.getByLabelText('Password').props.value).toBe(password);
});
it('blocks duplicate submission and dismissal while awaiting an authentication reply', async () => {
  render(<Auth/>); enterLogin(); let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await press('Sign in'); expect(screen.getByText('Please wait…')).toBeDisabled(); expect(screen.getByLabelText('Password').props.editable).toBe(false);
  const preventDefault = jest.fn(); mockBeforeRemove({ preventDefault }); expect(preventDefault).toHaveBeenCalled();
  await press('Please wait…'); expect(call).toHaveBeenCalledTimes(2);
  await act(async () => finish({ verificationRequired: true, codeRequested: true, expiresInMinutes: 15 })); expect(screen.getByText('Check your email')).toBeTruthy();
});
it('aborts and ignores a login response after unmount', async () => {
  const ui = render(<Auth/>); enterLogin(); let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await press('Sign in'); const options = call.mock.calls.at(-1)![1]; ui.unmount(); expect(options?.signal?.aborted).toBe(true);
  await act(async () => finish(session)); expect(mockSetSession).not.toHaveBeenCalled(); expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('ignores a late sign-in reply if a different session becomes active', async () => {
  const ui = render(<Auth/>); enterLogin(); let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); await press('Sign in');
  mockSession = { accessToken: 'another-owner' }; ui.rerender(<Auth/>); await act(async () => finish(session)); expect(mockSetSession).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Password').props.value).toBe('');
});
