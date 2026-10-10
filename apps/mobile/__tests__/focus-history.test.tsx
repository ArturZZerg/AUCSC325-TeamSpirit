import { fireEvent, render, screen } from '@testing-library/react-native';
import FocusHistoryScreen from '../app/focus-history';
import { useFocusHistory } from '../src/features/queries';
jest.mock('../src/features/queries', () => ({ useFocusHistory: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2026-10-10' }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: jest.requireActual('zustand').create(() => ({ session: { accessToken: 'test', user: { id: 'account', timeZone: 'UTC' } } })) }));
const mockReplace = jest.fn(); jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
const refetch = jest.fn();
beforeEach(() => { jest.clearAllMocks(); jest.mocked(useFocusHistory).mockReturnValue({ data: undefined, refetch, isLoading: false } as unknown as ReturnType<typeof useFocusHistory>); });
it('keeps unavailable history distinct from a successful empty week and offers retry', () => {
  jest.mocked(useFocusHistory).mockReturnValue({ data: undefined, error: new Error('Offline'), refetch } as unknown as ReturnType<typeof useFocusHistory>);
  render(<FocusHistoryScreen/>); expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/); expect(screen.queryByText('Your next block starts here.')).toBeNull();
  fireEvent.press(screen.getByText('Refresh history')); expect(refetch).toHaveBeenCalled();
});
it('shows recorded seconds, outcome and cache freshness and navigates calendar weeks', () => {
  jest.mocked(useFocusHistory).mockReturnValue({ data: { capturedAt: '2026-10-10T12:00:00Z', sessions: [{ id: 'one', title: 'Read chapter', focusedSeconds: 65,
    plannedMinutes: 25, endedAt: '2026-10-09T12:00:00Z', outcome: 'interrupted', taskId: null }] }, isCached: true, refetch } as unknown as ReturnType<typeof useFocusHistory>);
  render(<FocusHistoryScreen/>); expect(screen.getByText('1m 5s')).toBeOnTheScreen(); expect(screen.getByText(/Ended early/)).toBeOnTheScreen();
  expect(screen.getByText(/Saved .*UTC/)).toBeOnTheScreen(); expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
  fireEvent.press(screen.getByText('Previous week')); expect(useFocusHistory).toHaveBeenLastCalledWith('2026-09-28', '2026-10-04');
});
