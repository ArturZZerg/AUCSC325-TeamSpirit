import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TimetableScreen from '../app/timetable';
import { useAction, useClasses } from '../src/features/queries';
import { classFixture } from './class-fixture';
const mockPush = jest.fn(), mockReplace = jest.fn(); let mockToken = 'first'; const save = jest.fn(), refetch = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('../src/features/queries', () => ({ useClasses: jest.fn(), useAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-10', resumeCount: 0 }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: mockToken, user: { id: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
function show(fields = {}) {
  jest.mocked(useClasses).mockReturnValue({ data: [classFixture()], isLoading: false, isRefetching: false, refetch, ...fields } as unknown as ReturnType<typeof useClasses>);
}
beforeEach(() => { jest.clearAllMocks(); mockToken = 'first'; show(); save.mockReset().mockResolvedValue({}); jest.mocked(useAction).mockReturnValue({ mutateAsync: save } as unknown as ReturnType<typeof useAction>); });
it('shows a real weekly timetable with room details and selected-day navigation', () => {
  render(<TimetableScreen/>); expect(screen.getByText('3 meetings · 3 class hours this week')).toBeTruthy();
  expect(screen.getByText('Library 204 · Dr Green')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Tuesday, March 11, 0 classes' }));
  expect(screen.getByText('No classes scheduled.')).toBeTruthy(); fireEvent.press(screen.getByText('Open this day’s plan'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/today', params: { date: '2025-03-11' } });
});
it('distinguishes unavailable schedules from an empty timetable', () => {
  show({ data: undefined, error: new Error('Offline') }); render(<TimetableScreen/>);
  expect(screen.getByText('Your timetable isn’t available yet.')).toBeTruthy(); expect(screen.queryByText('No classes scheduled.')).toBeNull();
  fireEvent.press(screen.getByText('Retry timetable')); expect(refetch).toHaveBeenCalled();
});
it('counts a meeting that crosses account midnight once in weekly totals', () => {
  show({ data: [classFixture({ weekdays: [2], timeZone: 'UTC', startTime: '05:30', endTime: '06:30' })] });
  render(<TimetableScreen/>); expect(screen.getByText('1 meeting · 1 class hour this week')).toBeTruthy();
});
it('shows conflicts and stale-data status without claiming a refresh succeeded', () => {
  show({ data: [classFixture(), classFixture({ id: '20000000-0000-4000-8000-000000000002', title: 'Lab', startTime: '09:30', endTime: '10:30' })], isError: true });
  render(<TimetableScreen/>); expect(screen.getAllByText('Overlaps another class')).toHaveLength(2);
  expect(screen.getByText(/Saved timetable/)).toBeTruthy();
});
it('requires explicit removal and preserves a failed deletion for retry', async () => {
  save.mockRejectedValueOnce(new Error('Offline')); render(<TimetableScreen/>);
  fireEvent.press(screen.getByText('Remove Biology 101 · Lecture')); expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Confirm removal')); await screen.findByText('Offline');
  fireEvent.press(screen.getByText('Confirm removal')); await waitFor(() => expect(screen.queryByText('Confirm removal')).toBeNull());
  expect(save).toHaveBeenLastCalledWith({ path: `/classes/${classFixture().id}`, method: 'DELETE' });
});
it('discards a private editor and selected date when the session changes', async () => {
  const view = render(<TimetableScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Next week' })); fireEvent.press(screen.getByText('Add a class'));
  await screen.findByText('Save class'); mockToken = 'second'; await act(async () => view.rerender(<TimetableScreen/>));
  expect(screen.queryByText('Save class')).toBeNull(); expect(screen.getByText('Monday, Mar 10')).toBeTruthy();
});
