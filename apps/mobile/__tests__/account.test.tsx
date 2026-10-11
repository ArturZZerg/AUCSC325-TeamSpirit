import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AccountScreen from '../app/account';
import { api, ApiError } from '../src/lib/api';
import { shareAccountExport } from '../src/services/account-export';
import { accountFixture } from './account-fixture';

const copy = accountFixture();
let mockSession: { accessToken: string; user: typeof copy.profile } | null;
const mockSignOut = jest.fn(), mockReplace = jest.fn();
let mockBeforeRemove: (event: { preventDefault: () => void }) => void;
const mockNavigation = { addListener: jest.fn((_name, callback) => { mockBeforeRemove = callback; return () => {}; }) };
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }), useNavigation: () => mockNavigation }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('../src/store/session', () => ({ useSessionStore: Object.assign((selector: (state: object) => unknown) => selector({ session: mockSession }), { getState: () => ({ session: mockSession, signOut: mockSignOut }) }) }));
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/services/account-export', () => ({ shareAccountExport: jest.fn() }));
jest.mock('../src/lib/query-client', () => ({ queryClient: { cancelQueries: jest.fn().mockResolvedValue(undefined) } }));
beforeEach(() => { jest.clearAllMocks(); mockSession = { accessToken: 'private-token', user: copy.profile }; jest.mocked(api).mockReset().mockResolvedValue(copy); mockSignOut.mockResolvedValue(undefined); });
function confirm() { fireEvent.press(screen.getByText('Review account deletion')); fireEvent.changeText(screen.getByLabelText('Current password'), 'current-password'); fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE'); }
it('prepares a validated copy, reviews coverage and shares only after an explicit tap', async () => {
  render(<AccountScreen/>); expect(shareAccountExport).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Prepare my copy')));
  expect(screen.getByText('Tasks & completions')).toBeTruthy(); expect(shareAccountExport).not.toHaveBeenCalled();
  jest.mocked(shareAccountExport).mockResolvedValue('Share sheet closed.');
  await act(async () => fireEvent.press(screen.getByText('Save or share JSON copy')));
  expect(shareAccountExport).toHaveBeenCalledWith(copy, expect.any(Function)); expect(screen.getByText('Share sheet closed.')).toBeTruthy();
  expect(api).toHaveBeenCalledWith('/me/export', expect.objectContaining({ cache: 'no-store', headers: { Authorization: 'Bearer private-token' } }));
});
it('rejects partial exports and never offers to share them', async () => {
  jest.mocked(api).mockResolvedValue({ ...copy, personalTasks: undefined }); render(<AccountScreen/>);
  await act(async () => fireEvent.press(screen.getByText('Prepare my copy'))); expect(screen.queryByText('Save or share JSON copy')).toBeNull();
});
it('discards a delayed export after switching accounts and clears private form drafts', async () => {
  let finish!: (value: unknown) => void; jest.mocked(api).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const ui = render(<AccountScreen/>); await act(async () => fireEvent.press(screen.getByText('Prepare my copy')));
  mockSession = { accessToken: 'other-token', user: { ...copy.profile, email: 'other@example.test' } }; ui.rerender(<AccountScreen/>);
  await act(async () => finish(copy)); expect(screen.queryByText('Save or share JSON copy')).toBeNull(); expect(screen.getByText('other@example.test')).toBeTruthy();
  confirm(); mockSession = { ...mockSession, accessToken: 'third-token' }; ui.rerender(<AccountScreen/>); expect(screen.queryByLabelText('Current password')).toBeNull();
});
it('validates explicit confirmation before contacting the server and can cancel safely', async () => {
  render(<AccountScreen/>); fireEvent.press(screen.getByText('Review account deletion'));
  await act(async () => fireEvent.press(screen.getByText('Permanently delete my account')));
  expect(api).not.toHaveBeenCalled(); expect(screen.getByText('Enter your current password and type DELETE to confirm.')).toBeTruthy();
  fireEvent.press(screen.getByText('Keep my account')); expect(screen.queryByLabelText('Current password')).toBeNull();
});
it.each([new ApiError(403, 'Current password is incorrect.'), new Error('Network request failed')])('keeps the deletion draft after %s without claiming success', async error => {
  jest.mocked(api).mockRejectedValue(error); render(<AccountScreen/>); confirm();
  await act(async () => fireEvent.press(screen.getByText('Permanently delete my account')));
  expect(screen.getByLabelText('Current password').props.value).toBe('current-password'); expect(screen.getByLabelText('Type DELETE to confirm').props.value).toBe('DELETE');
  expect(mockSignOut).not.toHaveBeenCalled(); expect(screen.getByText(error.message)).toBeTruthy();
});
it('blocks duplicate deletion and dismissal, then signs out only after acknowledgement', async () => {
  let finish!: (value: unknown) => void; jest.mocked(api).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<AccountScreen/>); confirm();
  await act(async () => fireEvent.press(screen.getByText('Permanently delete my account')));
  fireEvent.press(screen.getByText('Deleting account…')); expect(api).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Keep my account')).toBeDisabled(); expect(screen.getByText('Back to Settings')).toBeDisabled();
  const preventDefault = jest.fn(); mockBeforeRemove({ preventDefault }); expect(preventDefault).toHaveBeenCalled(); expect(mockSignOut).not.toHaveBeenCalled();
  await act(async () => finish({ deleted: true })); expect(mockSignOut).toHaveBeenCalledWith({ deleted: true });
  preventDefault.mockClear(); mockBeforeRemove({ preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
});
it('does not sign out a different account when an old deletion finishes late', async () => {
  let finish!: (value: unknown) => void; jest.mocked(api).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const ui = render(<AccountScreen/>); confirm(); await act(async () => fireEvent.press(screen.getByText('Permanently delete my account')));
  mockSession = { accessToken: 'other-token', user: copy.profile }; ui.rerender(<AccountScreen/>);
  await act(async () => finish({ deleted: true })); expect(mockSignOut).not.toHaveBeenCalled(); expect(screen.getByText('Review account deletion')).toBeTruthy();
});
it('does not mistake an expired session or malformed response for confirmed deletion', async () => {
  jest.mocked(api).mockRejectedValueOnce(new ApiError(401, 'Unauthorized')).mockResolvedValueOnce({ deleted: false }); render(<AccountScreen/>); confirm();
  await act(async () => fireEvent.press(screen.getByText('Permanently delete my account')));
  expect(screen.getByText(/An expired session does not prove deletion/)).toBeTruthy(); expect(mockSignOut).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Permanently delete my account'))); expect(mockSignOut).not.toHaveBeenCalled();
});
