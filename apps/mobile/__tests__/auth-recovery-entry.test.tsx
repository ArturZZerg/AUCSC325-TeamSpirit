import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Auth from '../app/auth';

let mockNext: string | undefined;
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useNavigation: () => ({ addListener: () => () => {} }), useLocalSearchParams: () => ({ next: mockNext }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../src/store/session', () => ({ useSessionStore: Object.assign(() => ({ session: null, setSession: jest.fn(), accountDeleted: false, cleanupError: null, retryCleanup: jest.fn() }), { getState: () => ({ session: null }) }) }));
jest.mock('../src/lib/api', () => ({ api: jest.fn().mockResolvedValue({ registration: 'preview', verificationAvailable: false }), json: jest.fn() }));
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
