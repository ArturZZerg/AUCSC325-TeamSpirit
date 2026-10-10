import { fireEvent, render, screen } from '@testing-library/react-native';
import StudyReportScreen from '../app/study-report';
import { useFocusHistory, useTasks } from '../src/features/queries';
import { reportAccount, reportFixture, reportTask } from './study-report-fixture';
import { snapshotFixture } from './snapshot-fixture';
const mockPush = jest.fn(), mockReplace = jest.fn();
let mockAccount = reportAccount, mockToken = 'first';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('../src/features/queries', () => ({ useFocusHistory: jest.fn(), useTasks: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09' }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: {
  accessToken: mockToken, user: { id: mockAccount, timeZone: 'America/Edmonton' },
} }) }));
const refresh = jest.fn(), refreshTasks = jest.fn();
const task = { ...snapshotFixture().personalTasks[0], id: reportTask, title: 'Current task title', recurrence: null, estimatedMinutes: 15 };
function show(overrides = {}) { jest.mocked(useFocusHistory).mockReturnValue({ data: reportFixture(), refetch: refresh, ...overrides } as unknown as ReturnType<typeof useFocusHistory>); }
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(new Date('2025-03-09T18:00:00Z')); mockAccount = reportAccount; mockToken = 'first'; show();
  jest.mocked(useTasks).mockReturnValue({ data: [task], refetch: refreshTasks } as unknown as ReturnType<typeof useTasks>);
});
afterEach(() => jest.useRealTimers());
it('shows exact recorded time, meaningful day labels and the live estimate without changing completion', () => {
  render(<StudyReportScreen/>); expect(screen.getByText('26m 5s')).toBeOnTheScreen(); expect(screen.getByText('Current task title')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Current task title: recorded time versus task estimate' })).toHaveAccessibilityValue({ now: 100 });
  expect(screen.getByText(/more time than estimated/)).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Focus on this task')); expect(mockPush).toHaveBeenCalledWith({ pathname: '/focus', params: { taskId: reportTask } });
});
it('shows unavailable coverage without totals, then retries both history and task reads', () => {
  show({ data: undefined, error: new Error('Offline') }); render(<StudyReportScreen/>);
  expect(screen.getByText('This week hasn’t loaded.')).toBeOnTheScreen(); expect(screen.queryByText('0s')).toBeNull();
  fireEvent.press(screen.getByText('Refresh report')); expect(refresh).toHaveBeenCalled(); expect(refreshTasks).toHaveBeenCalled();
});
it('uses captured titles when task details fail and retains saved history after a refresh error', () => {
  show({ error: new Error('Offline'), isCached: true }); jest.mocked(useTasks).mockReturnValue({ data: undefined, error: new Error('Offline'), refetch: refreshTasks } as unknown as ReturnType<typeof useTasks>);
  render(<StudyReportScreen/>); expect(screen.getByText('Captured title')).toBeOnTheScreen(); expect(screen.getByText('26m 5s')).toBeOnTheScreen();
  expect(screen.getByText(/Showing saved study time/)).toBeOnTheScreen(); expect(screen.queryByText('Focus on this task')).toBeNull();
});
it.each([{ completedAt: '2025-03-09T12:00:00Z' }, { recurrence: { frequency: 'daily', interval: 1 } }])('does not offer focus for completed or recurring task %j', change => {
  jest.mocked(useTasks).mockReturnValue({ data: [{ ...task, ...change }], refetch: refreshTasks } as unknown as ReturnType<typeof useTasks>);
  render(<StudyReportScreen/>); expect(screen.queryByText('Focus on this task')).toBeNull();
});
it('loads one 14-day window, allows previous weeks and resets week selection on account switch', () => {
  const ui = render(<StudyReportScreen/>); expect(useFocusHistory).toHaveBeenCalledWith('2025-02-24', '2025-03-09');
  fireEvent.press(screen.getByText('Previous week')); expect(useFocusHistory).toHaveBeenLastCalledWith('2025-02-17', '2025-03-02');
  mockAccount = '10000000-0000-4000-8000-000000000002'; mockToken = 'second'; ui.rerender(<StudyReportScreen/>);
  expect(useFocusHistory).toHaveBeenLastCalledWith('2025-02-24', '2025-03-09'); expect(screen.queryByText('26m 5s')).toBeNull();
});
