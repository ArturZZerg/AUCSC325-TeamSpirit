import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Wellness from '../app/(tabs)/wellness';
import { useAction, useGoals, useGoalHistory, useWellness } from '../src/features/queries';
import { useTodayClock } from '../src/features/today-clock';
import { snapshotFixture } from './snapshot-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useGoals: jest.fn(), useGoalHistory: jest.fn(), useWellness: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: jest.fn() }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const goal = { ...snapshotFixture().goals[0], timeZone: 'Pacific/Honolulu', schedule: { kind: 'weeklyTarget' as const, target: 3 } };
const save = jest.fn(); let date: string;
const history = (days: string[], extra = {}) => jest.mocked(useGoalHistory).mockReturnValue({ data: days.map(occurrenceKey => ({ goalId: goal.id, occurrenceKey, state: 'completed' })), isLoading: false, ...extra } as ReturnType<typeof useGoalHistory>);
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({}); date = '2025-03-09';
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useGoals).mockReturnValue({ data: [goal], isLoading: false } as ReturnType<typeof useGoals>);
  history([]);
  jest.mocked(useWellness).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useWellness>);
  jest.mocked(useTodayClock).mockImplementation(zone => ({ date: zone === goal.timeZone ? date : '2025-03-10', resumeCount: 0 }));
});
it('shows a known empty history as zero progress in the goal week', () => {
  render(<Wellness/>); expect(screen.getByText('This week: 0 completed · Target 3')).toBeOnTheScreen();
  expect(screen.getByText('Week of 2025-03-03 · Monday–Sunday')).toBeOnTheScreen(); expect(useTodayClock).toHaveBeenCalledWith(goal.timeZone);
});
it.each([true, false])('shows unavailable progress for missing history while loading=%s', isLoading => {
  history([], { data: undefined, isLoading, error: isLoading ? undefined : new Error('Offline') });
  render(<Wellness/>); expect(screen.getByText('Weekly progress unavailable until history is loaded.')).toBeOnTheScreen();
  expect(screen.queryByText(/This week:/)).toBeNull(); expect(screen.queryByText('Complete today')).toBeNull();
});
it('retains cached progress when refresh fails', () => {
  history(['2025-03-03', '2025-03-05'], { error: new Error('Offline') });
  render(<Wellness/>); expect(screen.getByText('This week: 2 completed · Target 3')).toBeOnTheScreen(); expect(screen.getByText(/Couldn’t refresh/)).toBeOnTheScreen();
});
it('refreshes progress after completion and starts a new week at goal-local Monday', () => {
  history(['2025-03-03', '2025-03-05']); const view = render(<Wellness/>);
  history(['2025-03-03', '2025-03-05', '2025-03-09']); view.rerender(<Wellness/>);
  expect(screen.getByText('This week: 3 completed · Target 3')).toBeOnTheScreen(); expect(screen.getByText('Weekly target reached')).toBeOnTheScreen();
  date = '2025-03-10'; view.rerender(<Wellness/>);
  expect(screen.getByText('This week: 0 completed · Target 3')).toBeOnTheScreen(); expect(screen.getByText('Week of 2025-03-10 · Monday–Sunday')).toBeOnTheScreen();
  expect(screen.queryByText('Weekly target reached')).toBeNull();
});
it('keeps paused goal progress and history without offering completion', () => {
  jest.mocked(useGoals).mockReturnValue({ data: [{ ...goal, pausedAt: '2025-03-09T10:00:00Z' }], isLoading: false } as ReturnType<typeof useGoals>);
  history(['2025-03-03']); render(<Wellness/>); expect(screen.getByText('This week: 1 completed · Target 3')).toBeOnTheScreen();
  expect(screen.getByText('Completion history')).toBeOnTheScreen(); expect(screen.queryByText('Complete today')).toBeNull();
});
it('still permits another occurrence after reaching the target', async () => {
  history(['2025-03-03', '2025-03-04', '2025-03-05']); render(<Wellness/>);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Complete today' })); });
  expect(save).toHaveBeenCalledWith({ path: `/goals/${goal.id}/complete`, body: { occurrenceKey: '2025-03-09', state: 'completed' } });
});
it('does not invent weekly progress for daily goals', () => {
  jest.mocked(useGoals).mockReturnValue({ data: [{ ...goal, schedule: { kind: 'daily' } }], isLoading: false } as ReturnType<typeof useGoals>);
  render(<Wellness/>); expect(screen.queryByText(/This week:|Weekly progress|Weekly target/)).toBeNull();
});
