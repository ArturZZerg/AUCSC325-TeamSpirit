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
it('reveals and re-hides the password without changing it, and hides it again when switching to sign-up', async () => {
  render(<Auth/>); await act(async () => {});
  fireEvent.changeText(screen.getByLabelText('Password'), 'a-long-test-password');
  expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false); expect(screen.getByLabelText('Password')).toHaveDisplayValue('a-long-test-password');
  fireEvent.press(screen.getByRole('button', { name: 'Hide password' })); expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
  await act(async () => fireEvent.press(screen.getByText('Create an account')));
  expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  expect(screen.getByText('Gentle routines with streaks and check-ins')).toBeOnTheScreen();
});
