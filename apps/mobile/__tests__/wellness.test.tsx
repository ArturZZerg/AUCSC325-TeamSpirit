import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Wellness from '../app/(tabs)/wellness';
import { useAction, useGoals, useGoalHistory, useWellness } from '../src/features/queries';
import { useTodayClock } from '../src/features/today-clock';
import { snapshotFixture } from './snapshot-fixture';
import { router } from 'expo-router';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useGoals: jest.fn(), useGoalHistory: jest.fn(), useWellness: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: jest.fn() }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const goal = snapshotFixture().goals[0]; const save = jest.fn(); const refresh = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useGoals).mockReturnValue({ data: [goal], isLoading: false } as ReturnType<typeof useGoals>);
  jest.mocked(useGoalHistory).mockReturnValue({ data: [], isLoading: false, refetch: refresh } as unknown as ReturnType<typeof useGoalHistory>);
  jest.mocked(useWellness).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useWellness>);
  jest.mocked(useTodayClock).mockImplementation(zone => ({ date: zone === goal.timeZone ? '2025-03-08' : '2025-03-09', resumeCount: 0 }));
});
const press = async (name: string) => { await act(async () => { fireEvent.press(screen.getByRole('button', { name })); }); };
it('opens the routine library from Wellness', async () => {
  render(<Wellness/>); await press('Browse routine ideas'); expect(router.push).toHaveBeenCalledWith('/routines');
});
it('completes and skips using the goal day rather than the account day', async () => {
  render(<Wellness/>); await press('Complete today');
  expect(save).toHaveBeenCalledWith({ path: `/goals/${goal.id}/complete`, body: { occurrenceKey: '2025-03-08', state: 'completed' } });
  await press('Skip today'); expect(save).toHaveBeenLastCalledWith({ path: `/goals/${goal.id}/complete`, body: { occurrenceKey: '2025-03-08', state: 'skipped' } });
  expect(useTodayClock).toHaveBeenCalledWith(goal.timeZone);
});
it('hides completion when history already records the goal day', () => {
  jest.mocked(useGoalHistory).mockReturnValue({ data: snapshotFixture().goalCompletions, isLoading: false } as ReturnType<typeof useGoalHistory>);
  render(<Wellness/>); expect(screen.getByText('Skipped today')).toBeOnTheScreen(); expect(screen.queryByText('Complete today')).toBeNull();
});
it('does not invent completion eligibility when history is unavailable', () => {
  jest.mocked(useGoalHistory).mockReturnValue({ data: undefined, isLoading: false, error: new Error('Offline history') } as ReturnType<typeof useGoalHistory>);
  render(<Wellness/>); expect(screen.getByText(/Couldn’t refresh/)).toBeOnTheScreen(); expect(screen.queryByText('Complete today')).toBeNull();
});
it.each([
  { schedule: { kind: 'weekly' as const, weekdays: [1] }, pausedAt: null },
  { schedule: { kind: 'daily' as const }, pausedAt: '2025-03-08T15:00:00Z' },
])('does not complete paused or off-day goals', extra => {
  jest.mocked(useGoals).mockReturnValue({ data: [{ ...goal, ...extra }], isLoading: false } as ReturnType<typeof useGoals>);
  render(<Wellness/>); expect(screen.queryByText('Complete today')).toBeNull();
});
it('permits a weekly target on any day and supports pausing and resuming', async () => {
  jest.mocked(useGoals).mockReturnValue({ data: [{ ...goal, schedule: { kind: 'weeklyTarget', target: 3 } }], isLoading: false } as ReturnType<typeof useGoals>);
  const view = render(<Wellness/>); expect(screen.getByText('Complete today')).toBeOnTheScreen(); await press('Pause');
  expect(save).toHaveBeenCalledWith({ path: `/goals/${goal.id}/pause`, body: { paused: true } });
  jest.mocked(useGoals).mockReturnValue({ data: [{ ...goal, pausedAt: '2025-03-08T15:00:00Z' }], isLoading: false } as ReturnType<typeof useGoals>);
  view.rerender(<Wellness/>); await press('Resume'); expect(save).toHaveBeenLastCalledWith({ path: `/goals/${goal.id}/pause`, body: { paused: false } });
});
it('retains a failed delete confirmation and retries explicitly', async () => {
  render(<Wellness/>); await press('Delete'); expect(save).not.toHaveBeenCalled(); await press('Keep goal');
  await press('Delete'); save.mockRejectedValueOnce(new Error('Delete failed')); await press('Delete goal');
  expect(screen.getByText('Delete failed')).toBeOnTheScreen(); expect(screen.getByText('Delete goal?')).toBeOnTheScreen();
  await press('Delete goal'); expect(screen.queryByText('Delete goal?')).toBeNull(); expect(save).toHaveBeenLastCalledWith({ path: `/goals/${goal.id}`, method: 'DELETE' });
});
it('uses a fresh editor after cancelling and shows completion history with refresh', async () => {
  render(<Wellness/>); await press('Edit goal'); fireEvent.changeText(screen.getByLabelText('Goal title'), 'Discard me'); await press('Cancel');
  await press('Add goal'); expect(screen.getByLabelText('Goal title')).toHaveDisplayValue(''); await press('Cancel');
  await press('Completion history'); expect(screen.getByText('No completion history yet.')).toBeOnTheScreen(); await press('Refresh history'); expect(refresh).toHaveBeenCalled();
});
it('blocks repeated writes while completion is pending', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); render(<Wellness/>);
  const button = screen.getByText('Complete today'); act(() => { fireEvent.press(button); fireEvent.press(button); });
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Add goal' })).toBeDisabled();
  await act(async () => { resolve(); }); expect(screen.getByRole('button', { name: 'Add goal' })).toBeEnabled();
});
it('validates check-ins, preserves failed notes and submits the account day', async () => {
  render(<Wellness/>); fireEvent.changeText(screen.getByLabelText('Mood (1–5)'), '6'); await press('Save check-in'); expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/Use a whole number/);
  fireEvent.changeText(screen.getByLabelText('Mood (1–5)'), '4'); fireEvent.changeText(screen.getByLabelText('A short note'), 'Keep my note');
  save.mockRejectedValueOnce(new Error('Offline')); await press('Save check-in'); expect(screen.getByLabelText('A short note')).toHaveDisplayValue('Keep my note');
  await press('Save check-in'); expect(save).toHaveBeenLastCalledWith({ path: '/wellness', body: { date: '2025-03-09', mood: 4, energy: null, stress: null, note: 'Keep my note' } });
  expect(screen.getByLabelText('A short note')).toHaveDisplayValue('');
});
