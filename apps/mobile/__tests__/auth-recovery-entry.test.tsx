import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Auth from '../app/auth';
import { api } from '../src/lib/api';

let mockNext: string | undefined;
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useNavigation: () => ({ addListener: () => () => {} }), useLocalSearchParams: () => ({ next: mockNext }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../src/store/session', () => ({ useSessionStore: Object.assign(() => ({ session: null, setSession: jest.fn(), accountDeleted: false, cleanupError: null, retryCleanup: jest.fn() }), { getState: () => ({ session: null }) }) }));
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn().mockResolvedValue({ registration: 'preview', verificationAvailable: false }) }));
beforeEach(() => { jest.clearAllMocks(); mockNext = undefined; });
it.each([undefined, 'account', 'https://untrusted.test'])('opens recovery with only a supported return target and clears the retained sign-in password: %s', async next => {
  mockNext = next; render(<Auth/>); fireEvent.changeText(screen.getByLabelText('Password'), 'previous-attempt-password');
  await act(async () => fireEvent.press(screen.getByText('Forgot password?')));
  expect(mockRouter.push).toHaveBeenCalledWith(next === 'account' ? '/recover?next=account' : '/recover');
  expect(screen.getByLabelText('Password').props.value).toBe('');
});
it('keeps the recovery entry within ordinary sign-in', async () => {
  render(<Auth/>); await act(async () => fireEvent.press(screen.getByText('Create an account'))); expect(screen.queryByText('Forgot password?')).toBeNull();
});
it('opens public help from sign-in and clears the entered password', async () => {
  render(<Auth/>); fireEvent.changeText(screen.getByLabelText('Password'), 'previous-attempt-password');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Help & data' })));
  expect(mockRouter.push).toHaveBeenCalledWith('/help'); expect(screen.getByLabelText('Password')).toHaveDisplayValue('');
});
it('keeps Help unavailable during sign-in, then permits it after a failed request', async () => {
  render(<Auth/>); await act(async () => {});
  let reject!: (error: Error) => void;
  jest.mocked(api).mockImplementationOnce(() => new Promise((_resolve, failed) => { reject = failed; }));
  fireEvent.changeText(screen.getByLabelText('Email'), 'help-test@example.test');
  fireEvent.changeText(screen.getByLabelText('Password'), 'synthetic-test-password');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Sign in' })));
  expect(screen.getByRole('button', { name: 'Help & data' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Help & data' })); expect(mockRouter.push).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Password')).toHaveDisplayValue('synthetic-test-password');
  await act(async () => reject(new Error('unavailable')));
  expect(screen.getByRole('button', { name: 'Help & data' })).toBeEnabled();
  fireEvent.press(screen.getByRole('button', { name: 'Help & data' })); expect(mockRouter.push).toHaveBeenCalledWith('/help');
  expect(screen.getByLabelText('Password')).toHaveDisplayValue('');
});
it('signs in from the password keyboard Return key without tapping the button', async () => {
  render(<Auth/>); await act(async () => {});
  fireEvent.changeText(screen.getByLabelText('Email'), 'return-key@example.test'); fireEvent.changeText(screen.getByLabelText('Password'), 'a-long-test-password');
  await act(async () => { fireEvent(screen.getByLabelText('Password'), 'submitEditing'); });
  expect(api).toHaveBeenCalledWith('/auth/login', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'return-key@example.test', password: 'a-long-test-password' }) }));
});
it('validates sign-in values before a keyboard Return can send credentials', async () => {
  render(<Auth/>); await act(async () => {});
  fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
  fireEvent.changeText(screen.getByLabelText('Password'), 'a-long-test-password');
  await act(async () => fireEvent(screen.getByLabelText('Password'), 'submitEditing'));
  expect(api).not.toHaveBeenCalledWith('/auth/login', expect.anything());
});
it('does not send a second sign-in when Return is pressed again during a request', async () => {
  render(<Auth/>); await act(async () => {});
  let reject!: (error: Error) => void;
  jest.mocked(api).mockImplementationOnce(() => new Promise((_resolve, failed) => { reject = failed; }));
  fireEvent.changeText(screen.getByLabelText('Email'), 'pending-return@example.test');
  fireEvent.changeText(screen.getByLabelText('Password'), 'a-long-test-password');
  await act(async () => fireEvent(screen.getByLabelText('Password'), 'submitEditing'));
  await act(async () => fireEvent(screen.getByLabelText('Password'), 'submitEditing'));
  expect(jest.mocked(api).mock.calls.filter(([route]) => route === '/auth/login')).toHaveLength(1);
  await act(async () => reject(new Error('unavailable')));
});
it('keeps registration explicit when Return is pressed on its password field', async () => {
  render(<Auth/>); await act(async () => {});
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create an account' })));
  fireEvent.changeText(screen.getByLabelText('Email'), 'register-return@example.test');
  fireEvent.changeText(screen.getByLabelText('Name'), 'Return check');
  fireEvent.changeText(screen.getByLabelText('Password'), 'a-long-test-password');
  await act(async () => fireEvent(screen.getByLabelText('Password'), 'submitEditing'));
  expect(api).not.toHaveBeenCalledWith('/auth/login', expect.anything());
  expect(api).not.toHaveBeenCalledWith('/auth/register', expect.anything());
});
