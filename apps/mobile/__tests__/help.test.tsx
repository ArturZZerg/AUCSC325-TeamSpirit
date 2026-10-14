import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Help from '../app/help';
import { findHelp } from '../src/features/help-content';

let mockSession: object | null = null, mockReady = true;
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../src/store/session', () => ({ useSessionStore: () => ({ session: mockSession, ready: mockReady }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const priorPrivacy = process.env.EXPO_PUBLIC_PRIVACY_URL, priorSupport = process.env.EXPO_PUBLIC_SUPPORT_URL;
beforeEach(() => { jest.clearAllMocks(); mockSession = null; mockReady = true; delete process.env.EXPO_PUBLIC_PRIVACY_URL; delete process.env.EXPO_PUBLIC_SUPPORT_URL; });
afterAll(() => {
  if (priorPrivacy === undefined) delete process.env.EXPO_PUBLIC_PRIVACY_URL; else process.env.EXPO_PUBLIC_PRIVACY_URL = priorPrivacy;
  if (priorSupport === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_URL; else process.env.EXPO_PUBLIC_SUPPORT_URL = priorSupport;
});

it('reads help without an account and exposes existing account self-service', () => {
  render(<Help/>); expect(screen.getByLabelText('Search help')).toBeOnTheScreen();
  expect(screen.getByText(/Published policy and contact links are not yet available/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Notification settings' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Account & privacy' })); expect(mockRouter.push).toHaveBeenCalledWith('/account');
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' })); expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
});
it('searches questions, answers and student vocabulary locally', () => {
  expect(findHelp('  WIFI  queued ').map(article => article.id)).toEqual(['offline']);
  expect(findHelp('wellness stress', 'Your data').map(article => article.id)).toEqual(['saved-data']);
  expect(findHelp('WIFI', 'Study & planning')).toEqual([]);
});
it('combines topic/search filters and restores usable answers after an empty result', () => {
  render(<Help/>); fireEvent.press(screen.getByRole('button', { name: 'Help topic: Your data' }));
  fireEvent.changeText(screen.getByLabelText('Search help'), 'wifi'); expect(screen.getByText('No matching answers.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Show all answers' }));
  expect(screen.getByLabelText('Search help')).toHaveDisplayValue('');
  expect(screen.getByRole('button', { name: 'Help topic: All' }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('button', { name: 'Why isn’t my task in Today?' })).toBeOnTheScreen();
});
it('expands and collapses an answer and keeps private tools out of signed-out actions', () => {
  render(<Help/>); const question = screen.getByRole('button', { name: 'Why isn’t my task in Today?' });
  fireEvent.press(question); expect(question.props.accessibilityState).toMatchObject({ expanded: true });
  expect(screen.getByText(/An undated task stays in Tasks/)).toBeOnTheScreen(); expect(screen.queryByRole('button', { name: 'Open Tasks' })).toBeNull();
  fireEvent.press(question); expect(screen.queryByText(/An undated task stays in Tasks/)).toBeNull();
});
it('routes signed-in guides and reminder controls to the existing workspaces', () => {
  mockSession = {}; render(<Help/>); fireEvent.press(screen.getByRole('button', { name: 'How do I plan around my classes?' }));
  fireEvent.press(screen.getByRole('button', { name: 'Open Weekly planner' })); expect(mockRouter.push).toHaveBeenCalledWith('/planner');
  fireEvent.press(screen.getByRole('button', { name: 'Notification settings' })); expect(mockRouter.push).toHaveBeenCalledWith('/settings');
  fireEvent.press(screen.getByRole('button', { name: 'Back to CampusFlow' })); expect(mockRouter.replace).toHaveBeenCalledWith('/today');
});
it('opens saved reminder browsing from the signed-in reminder guide', () => {
  mockSession = {}; render(<Help/>); fireEvent.press(screen.getByRole('button', { name: 'Why didn’t a reminder arrive?' }));
  fireEvent.press(screen.getByRole('button', { name: 'Open my reminders' })); expect(mockRouter.push).toHaveBeenCalledWith('/reminders');
  expect(screen.getByText(/It is not a delivery history/)).toBeOnTheScreen();
});
it('keeps navigation disabled while the account session is restoring', () => {
  mockReady = false; render(<Help/>); expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Account & privacy' })).toBeDisabled();
  expect(screen.getByLabelText('Search help')).toBeEnabled();
});
it('opens only configured websites without passing search or account data', async () => {
  process.env.EXPO_PUBLIC_PRIVACY_URL = 'https://policy.example.test/campusflow'; process.env.EXPO_PUBLIC_SUPPORT_URL = 'https://support.example.test/campusflow';
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined); render(<Help/>);
  fireEvent.changeText(screen.getByLabelText('Search help'), 'private student question');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Read privacy policy' })));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Visit support' })));
  expect(open.mock.calls).toEqual([['https://policy.example.test/campusflow'], ['https://support.example.test/campusflow']]); open.mockRestore();
});
it('shows a failed website launch and permits retry while blocking duplicate taps', async () => {
  process.env.EXPO_PUBLIC_SUPPORT_URL = 'https://support.example.test/campusflow';
  let reject!: (error: Error) => void; const open = jest.spyOn(Linking, 'openURL').mockImplementationOnce(() => new Promise((_resolve, failed) => { reject = failed; })).mockResolvedValue(undefined);
  render(<Help/>); act(() => { fireEvent.press(screen.getByRole('button', { name: 'Visit support' })); fireEvent.press(screen.getByRole('button', { name: 'Visit support' })); });
  expect(open).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Visit support' })).toBeDisabled();
  await act(async () => reject(new Error('private URL diagnostics'))); expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t open the website/);
  expect(screen.queryByText('private URL diagnostics')).toBeNull();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Visit support' }))); expect(screen.queryByRole('alert')).toBeNull(); open.mockRestore();
});
it('does not advertise an invalid or unconfigured website as a published policy', () => {
  process.env.EXPO_PUBLIC_PRIVACY_URL = 'javascript:alert(1)'; render(<Help/>);
  expect(screen.queryByRole('button', { name: 'Read privacy policy' })).toBeNull();
});
