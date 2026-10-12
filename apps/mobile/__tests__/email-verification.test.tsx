import { act, fireEvent, render, screen } from '@testing-library/react-native';
import VerifyEmail from '../app/verify';
import { api, ApiError } from '../src/lib/api';

let mockSession: { accessToken: string } | null = null, mockNext: string | undefined;
const mockRouter = { replace: jest.fn() }, mockNavigation = { addListener: jest.fn() };
let mockBeforeRemove: (event: { preventDefault: () => void }) => void;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ next: mockNext }), useRouter: () => mockRouter, useNavigation: () => mockNavigation }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../src/store/session', () => ({ useSessionStore: Object.assign((selector: (state: object) => unknown) => selector({ session: mockSession }), { getState: () => ({ session: mockSession }) }) }));
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
const call = jest.mocked(api), email = 'student@example.test', password = 'account-password-123', code = 'ABC123-DEF456-ABC123-DEF456-ABC123';
beforeEach(() => {
  jest.useRealTimers(); jest.clearAllMocks(); mockSession = null; mockNext = undefined;
  mockNavigation.addListener.mockImplementation((_event, callback) => { mockBeforeRemove = callback; return () => {}; });
  call.mockReset().mockImplementation(async path => path === '/auth/capability' ? { registration: 'verified', verificationAvailable: true }
    : path === '/auth/verification/request' ? { accepted: true } : { verified: true });
});
afterEach(() => jest.useRealTimers());
const ready = async () => { const ui = render(<VerifyEmail/>); await screen.findByLabelText('Account email'); return ui; };
const enterCredentials = () => { fireEvent.changeText(screen.getByLabelText('Account email'), email); fireEvent.changeText(screen.getByLabelText('Account password'), password); };
const complete = () => { enterCredentials(); fireEvent.changeText(screen.getByLabelText('Verification code'), code); };
const press = async (label: string) => act(async () => { fireEvent.press(screen.getByText(label)); });
it('reports disabled verification without accepting secret drafts or claiming email delivery', async () => {
  call.mockResolvedValue({ registration: 'closed', verificationAvailable: false }); render(<VerifyEmail/>);
  expect(await screen.findByText('Email verification is currently unavailable. Try again later.')).toBeTruthy();
  expect(screen.queryByLabelText('Account password')).toBeNull(); expect(screen.queryByText('Verify email')).toBeNull();
});
it('retries a failed availability check without accepting a malformed public response', async () => {
  call.mockResolvedValueOnce({ registration: 'verified', verificationAvailable: true, emailExists: true }); render(<VerifyEmail/>);
  await screen.findByText('Couldn’t check verification. Check your connection and retry.'); await press('Check again');
  expect(await screen.findByLabelText('Account email')).toBeTruthy();
});
it('requires both account password and a full code before confirming mailbox ownership', async () => {
  await ready(); fireEvent.changeText(screen.getByLabelText('Account email'), email); fireEvent.changeText(screen.getByLabelText('Verification code'), code);
  await press('Verify email'); expect(call).toHaveBeenCalledTimes(1);
  fireEvent.changeText(screen.getByLabelText('Account password'), password); await press('Verify email');
  expect(call).toHaveBeenLastCalledWith('/auth/verification/confirm', expect.objectContaining({ method: 'POST', cache: 'no-store',
    body: JSON.stringify({ email, password, code: code.replace(/-/g, '') }) }));
  expect(screen.getByText('Email verified')).toBeTruthy(); expect(screen.queryByLabelText('Account password')).toBeNull();
  expect(mockRouter.replace).not.toHaveBeenCalled(); await press('Continue to sign in'); expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
});
it('requests a code using only current account credentials and bounds resends', async () => {
  await ready(); await press('Request a new code'); expect(call).toHaveBeenCalledTimes(1);
  enterCredentials(); await press('Request a new code');
  expect(call).toHaveBeenLastCalledWith('/auth/verification/request', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email, password }) }));
  expect(screen.getByText('Resend in 60s')).toBeDisabled(); expect(screen.getByLabelText('Verification code')).toBeTruthy();
});
it('releases resend controls after a bounded cooldown and clears password/code when the email changes', async () => {
  await ready(); complete(); jest.useFakeTimers(); await press('Request a new code');
  await act(async () => { await jest.advanceTimersByTimeAsync(60_000); }); expect(screen.getByText('Request a new code')).toBeEnabled();
  fireEvent.changeText(screen.getByLabelText('Account email'), 'other@example.test');
  expect(screen.getByLabelText('Account password').props.value).toBe(''); expect(screen.getByLabelText('Verification code').props.value).toBe('');
});
it.each([new ApiError(400, 'invalid'), new Error('offline')])('keeps failed verification drafts and offers an honest retry after %s', async error => {
  await ready(); complete(); call.mockRejectedValueOnce(error); await press('Verify email');
  expect(screen.getByLabelText('Account password').props.value).toBe(password); expect(screen.getByLabelText('Verification code').props.value).toBe(code);
  expect(screen.queryByText('Email verified')).toBeNull();
  expect(screen.getByText(error instanceof ApiError ? 'The code or password is invalid. Check them or request a new code.' : 'Couldn’t confirm verification. Try signing in, or retry this code.')).toBeTruthy();
  await press('Verify email'); expect(screen.getByText('Email verified')).toBeTruthy();
});
it('does not claim delivery after wrong-password resend and offers the separate recovery path', async () => {
  await ready(); enterCredentials(); call.mockRejectedValueOnce(new ApiError(401, 'invalid')); await press('Request a new code');
  expect(screen.getByText('Check your email and account password. If you don’t know the password, use Forgot password.')).toBeTruthy();
  expect(screen.queryByText('Resend in 60s')).toBeNull(); await press('Forgot password?'); expect(mockRouter.replace).toHaveBeenCalledWith('/recover');
});
it('withholds success when a response contains unexpected session material', async () => {
  await ready(); complete(); call.mockResolvedValueOnce({ verified: true, accessToken: 'unexpected' }); await press('Verify email');
  expect(screen.queryByText('Email verified')).toBeNull(); expect(screen.getByLabelText('Account password').props.value).toBe(password);
});
it('blocks duplicate requests, secret editing and dismissal until the current request resolves', async () => {
  await ready(); complete(); let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await press('Verify email'); expect(screen.getByText('Verifying email…')).toBeDisabled(); expect(screen.getByText('Back to sign in')).toBeDisabled();
  expect(screen.getByLabelText('Account password').props.editable).toBe(false); await press('Verifying email…'); expect(call).toHaveBeenCalledTimes(2);
  const preventDefault = jest.fn(); mockBeforeRemove({ preventDefault }); expect(preventDefault).toHaveBeenCalled();
  await act(async () => finish({ verified: true })); preventDefault.mockClear(); mockBeforeRemove({ preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
});
it('ignores a delayed response after unmount and aborts the transport', async () => {
  const ui = await ready(); complete(); let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await press('Verify email'); const options = call.mock.calls.at(-1)![1]; ui.unmount(); expect(options?.signal?.aborted).toBe(true);
  await act(async () => finish({ verified: true })); expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('discards late proof and drafts if another account signs in while verification is pending', async () => {
  const ui = await ready(); complete(); let finish!: (value: unknown) => void; call.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); await press('Verify email');
  mockSession = { accessToken: 'another-owner' }; ui.rerender(<VerifyEmail/>); await act(async () => finish({ verified: true }));
  expect(screen.queryByText('Email verified')).toBeNull(); expect(screen.queryByLabelText('Account password')).toBeNull(); expect(mockRouter.replace).not.toHaveBeenCalled();
  const preventDefault = jest.fn(); mockBeforeRemove({ preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
});
it.each([undefined, 'account', 'https://untrusted.test'])('preserves only supported return routes without email, passwords or codes: %s', next => {
  mockNext = next; render(<VerifyEmail/>); fireEvent.press(screen.getByText('Back to sign in'));
  expect(mockRouter.replace).toHaveBeenCalledWith(next === 'account' ? '/auth?next=account' : '/auth');
});
it.each([429, 503])('handles a changing server availability response: %s', status => {
  return ready().then(async () => {
    complete(); call.mockRejectedValueOnce(new ApiError(status, 'unavailable')); await press('Verify email');
    expect(screen.getByText(status === 429 ? 'Too many attempts. Wait before trying again.' : 'Email verification is currently unavailable. Try again later.')).toBeTruthy();
  });
});
