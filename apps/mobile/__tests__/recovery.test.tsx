import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Recover from '../app/recover';
import { api, ApiError } from '../src/lib/api';

let mockSession: { accessToken: string } | null = null, mockNext: string | undefined;
const mockRouter = { replace: jest.fn() }, mockNavigation = { addListener: jest.fn() };
let mockBeforeRemove: (event: { preventDefault: () => void }) => void;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ next: mockNext }), useRouter: () => mockRouter, useNavigation: () => mockNavigation }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../src/store/session', () => ({ useSessionStore: Object.assign((selector: (state: object) => unknown) => selector({ session: mockSession }), { getState: () => ({ session: mockSession }) }) }));
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
const call = jest.mocked(api), email = 'student@example.test', code = 'ABC123-DEF456-ABC123-DEF456-ABC123', password = 'new-test-password-456';
beforeEach(() => {
  jest.useRealTimers(); jest.clearAllMocks(); mockSession = null; mockNext = undefined;
  mockNavigation.addListener.mockImplementation((_event, callback) => { mockBeforeRemove = callback; return () => {}; });
  call.mockReset().mockImplementation(async path => path === '/auth/recovery/capability' ? { available: true, expiresInMinutes: 15 }
    : path === '/auth/recovery/request' ? { accepted: true } : { reset: true });
});
afterEach(() => jest.useRealTimers());
const ready = async () => { render(<Recover/>); await screen.findByLabelText('Account email'); };
const enterEmail = () => fireEvent.changeText(screen.getByLabelText('Account email'), email);
async function codeStage() { await ready(); enterEmail(); fireEvent.press(screen.getByText('I already have a code')); }
function completeCode() {
  fireEvent.changeText(screen.getByLabelText('Recovery code'), code);
  fireEvent.changeText(screen.getByLabelText('New password'), password);
  fireEvent.changeText(screen.getByLabelText('Confirm new password'), password);
}
async function press(title: string) { await act(async () => fireEvent.press(screen.getByText(title))); }
it('checks uncached availability before showing actionable recovery controls', async () => {
  let finish!: (value: unknown) => void; call.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<Recover/>); expect(screen.getByText('Checking recovery availability…')).toBeTruthy(); expect(screen.queryByLabelText('Account email')).toBeNull();
  expect(call).toHaveBeenCalledWith('/auth/recovery/capability', expect.objectContaining({ cache: 'no-store', signal: expect.anything() }));
  await act(async () => finish({ available: true, expiresInMinutes: 15 })); expect(screen.getByLabelText('Account email')).toBeTruthy();
});
it('shows disabled delivery honestly without offering to request a code', async () => {
  call.mockResolvedValue({ available: false, expiresInMinutes: 15 }); render(<Recover/>);
  expect(await screen.findByText('Password recovery is currently unavailable. Try again later.')).toBeTruthy();
  expect(screen.queryByText('Request recovery code')).toBeNull(); expect(call).toHaveBeenCalledTimes(1);
});
it('retries a failed or malformed capability response', async () => {
  call.mockRejectedValueOnce(new Error('offline')); render(<Recover/>);
  await screen.findByText('Couldn’t check recovery. Check your connection and retry.'); await press('Check again');
  expect(await screen.findByLabelText('Account email')).toBeTruthy();
});
it('validates email before requesting and sends no hidden password or code fields', async () => {
  await ready(); fireEvent.changeText(screen.getByLabelText('Account email'), 'invalid'); await press('Request recovery code');
  expect(call).toHaveBeenCalledTimes(1); enterEmail(); await press('Request recovery code');
  expect(call).toHaveBeenLastCalledWith('/auth/recovery/request', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email }), cache: 'no-store' }));
  expect(screen.getByText('If an account uses this email, a code will arrive shortly. Check your spam folder, too.')).toBeTruthy();
  expect(screen.getByText('Resend in 60s')).toBeDisabled(); expect(screen.getByLabelText('Recovery code')).toBeTruthy();
});
it('retains an email draft after a failed request without claiming delivery', async () => {
  await ready(); enterEmail(); call.mockRejectedValueOnce(new Error('offline')); await press('Request recovery code');
  expect(screen.getByLabelText('Account email').props.value).toBe(email);
  expect(screen.getByText('Couldn’t confirm the request. Check your connection and try again.')).toBeTruthy();
  expect(screen.queryByLabelText('Recovery code')).toBeNull(); await press('Request recovery code'); expect(screen.getByLabelText('Recovery code')).toBeTruthy();
});
it('allows direct code entry, confirms the new password, and safely normalizes a pasted code', async () => {
  await codeStage(); completeCode(); fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'mismatch'); await press('Change password');
  expect(screen.getByText('The passwords must match.')).toBeTruthy(); expect(call).toHaveBeenCalledTimes(1);
  fireEvent.changeText(screen.getByLabelText('Confirm new password'), password); await press('Change password');
  expect(call).toHaveBeenLastCalledWith('/auth/recovery/reset', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email, code: code.replace(/-/g, ''), newPassword: password }) }));
  expect(screen.getByText('Password changed')).toBeTruthy(); expect(screen.queryByLabelText('New password')).toBeNull();
  expect(mockRouter.replace).not.toHaveBeenCalled(); await press('Return to sign in'); expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
});
it.each([new ApiError(400, 'invalid'), new Error('offline')])('preserves reset drafts after %s without claiming the password is unchanged', async error => {
  await codeStage(); completeCode(); call.mockRejectedValueOnce(error); await press('Change password');
  expect(screen.getByLabelText('Recovery code').props.value).toBe(code); expect(screen.getByLabelText('New password').props.value).toBe(password);
  expect(screen.queryByText('Password changed')).toBeNull();
  expect(screen.getByText(error instanceof ApiError ? 'This code is invalid or expired. Request a new code and try again.'
    : 'Couldn’t confirm the password change. Try signing in with your new password, or retry this code.')).toBeTruthy();
  await press('Change password'); expect(screen.getByText('Password changed')).toBeTruthy();
});
it('blocks duplicate reset, editing and dismissal until the current request resolves', async () => {
  await codeStage(); completeCode(); let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await press('Change password'); expect(screen.getByText('Changing password…')).toBeDisabled(); expect(screen.getByText('Back to sign in')).toBeDisabled();
  expect(screen.getByLabelText('New password').props.editable).toBe(false); await press('Changing password…'); expect(call).toHaveBeenCalledTimes(2);
  const preventDefault = jest.fn(); mockBeforeRemove({ preventDefault }); expect(preventDefault).toHaveBeenCalled();
  await act(async () => finish({ reset: true })); preventDefault.mockClear(); mockBeforeRemove({ preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
});
it('ignores a delayed request after leaving the screen and aborts its transport', async () => {
  const ui = render(<Recover/>); await screen.findByLabelText('Account email');
  let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  enterEmail(); await press('Request recovery code');
  const options = call.mock.calls.at(-1)![1];
  ui.unmount();
  expect(options?.signal?.aborted).toBe(true); await act(async () => finish({ accepted: true })); expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('discards a late reset and sensitive fields if the user signs in elsewhere', async () => {
  const ui = render(<Recover/>); await screen.findByLabelText('Account email'); enterEmail(); fireEvent.press(screen.getByText('I already have a code')); completeCode();
  let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); await press('Change password');
  mockSession = { accessToken: 'different-session' }; ui.rerender(<Recover/>);
  await act(async () => finish({ reset: true })); expect(screen.queryByText('Password changed')).toBeNull(); expect(screen.queryByLabelText('New password')).toBeNull(); expect(mockRouter.replace).not.toHaveBeenCalled();
  const preventDefault = jest.fn(); mockBeforeRemove({ preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
});
it('clears code and password drafts when the recipient changes', async () => {
  await codeStage(); completeCode(); fireEvent.changeText(screen.getByLabelText('Account email'), 'another@example.test');
  for (const label of ['Recovery code', 'New password', 'Confirm new password']) expect(screen.getByLabelText(label).props.value).toBe('');
});
it.each(['account', 'https://untrusted.test'])('preserves only the supported sign-in return target %s', async next => {
  mockNext = next; await ready(); await press('Back to sign in'); expect(mockRouter.replace).toHaveBeenCalledWith(next === 'account' ? '/auth?next=account' : '/auth');
});
it('waits through a local resend cooldown before making a second request', async () => {
  await ready(); enterEmail(); jest.useFakeTimers(); await press('Request recovery code');
  await press('Resend in 60s'); expect(call).toHaveBeenCalledTimes(2);
  await act(async () => jest.advanceTimersByTime(60_000)); expect(screen.getByText('Request a new code')).not.toBeDisabled();
  await press('Request a new code'); expect(call).toHaveBeenCalledTimes(3); expect(screen.getByText('Resend in 60s')).toBeDisabled();
});
it.each([new ApiError(429, 'private detail'), new ApiError(503, 'private detail')])('shows safe global availability or rate failure for %s', async error => {
  await ready(); enterEmail(); call.mockRejectedValueOnce(error); await press('Request recovery code');
  expect(screen.queryByText('private detail')).toBeNull();
  expect(screen.getByText(error.status === 429 ? 'Too many attempts. Wait before trying again.' : 'Password recovery is currently unavailable. Try again later.')).toBeTruthy();
});
