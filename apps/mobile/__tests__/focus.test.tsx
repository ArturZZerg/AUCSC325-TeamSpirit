import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import FocusScreen from '../app/focus';
import { useAction, useTasks } from '../src/features/queries';
import { useSessionStore } from '../src/store/session';
import { useFocusStore } from '../src/store/focus';
import { snapshotFixture } from './snapshot-fixture';
import type { PersonalTask, Session } from '../src/lib/types';
jest.mock('../src/store/session', () => ({ useSessionStore: jest.requireActual('zustand').create(() => ({ session: null })) }));
jest.mock('../src/features/queries', () => ({ useTasks: jest.fn(), useAction: jest.fn() }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(), useRouter: () => ({ replace: mockReplace }) }));
const session: Session = { accessToken: 'first', expiresAt: '2099-01-01T00:00:00Z', user: {
  id: '10000000-0000-4000-8000-000000000001', email: 'first@example.test', displayName: 'First', timeZone: 'UTC', createdAt: '2026-10-07T00:00:00Z',
} };
const task: PersonalTask = { ...snapshotFixture().personalTasks[0], recurrence: null, title: 'Outline my report', estimatedMinutes: 1 };
const save = jest.fn(); let appState!: (status: AppStateStatus) => void;
function showTasks(data: PersonalTask[] = [task], overrides = {}) {
  jest.mocked(useTasks).mockReturnValue({ data, isLoading: false, ...overrides } as unknown as ReturnType<typeof useTasks>);
}
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(0); jest.clearAllMocks(); useSessionStore.setState({ session }); useFocusStore.getState().clear();
  jest.mocked(useLocalSearchParams).mockReturnValue({ taskId: task.id }); showTasks();
  save.mockReset().mockResolvedValue({}); jest.mocked(useAction).mockReturnValue({ mutateAsync: save } as unknown as ReturnType<typeof useAction>);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { appState = listener as typeof appState; return { remove: jest.fn() }; });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
function start() { fireEvent.press(screen.getByText('Start focus')); }
function finish() { act(() => jest.advanceTimersByTime(60_000)); }
it('preselects an owned one-time task and uses its estimate', () => {
  render(<FocusScreen/>); expect(screen.getByText('01:00')).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: task.title, checked: true })).toBeOnTheScreen();
  start(); expect(screen.getByText('Focus in progress')).toBeOnTheScreen(); expect(save).not.toHaveBeenCalled();
});
it('pauses without consuming time, resumes and keeps the session across screen remounts', () => {
  const ui = render(<FocusScreen/>); start(); act(() => jest.advanceTimersByTime(10_000)); fireEvent.press(screen.getByText('Pause'));
  act(() => jest.advanceTimersByTime(120_000)); expect(screen.getByText('00:50')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Resume')); ui.unmount(); render(<FocusScreen/>);
  expect(screen.getByText('Focus in progress')).toBeOnTheScreen(); expect(screen.getByText('00:50')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Back to Today')); expect(mockReplace).toHaveBeenCalledWith('/today');
  expect(useFocusStore.getState().timer.status).toBe('running');
});
it('reconciles expiry after background suspension without auto-completing a task', () => {
  render(<FocusScreen/>); start(); act(() => appState('background'));
  act(() => jest.setSystemTime(120_000)); act(() => appState('active'));
  expect(screen.getByText('Block finished. Nice work.')).toBeOnTheScreen(); expect(screen.getByText('00:00')).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled(); expect(screen.getByText('Mark task complete')).toBeOnTheScreen();
});
it('keeps completion explicit, preserves failure and permits retry', async () => {
  save.mockRejectedValueOnce(new Error('Offline write')); render(<FocusScreen/>); start(); finish();
  await act(async () => fireEvent.press(screen.getByText('Mark task complete')));
  expect(screen.getByRole('alert')).toHaveTextContent('Offline write'); expect(screen.queryByText('Task completed.')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Mark task complete')));
  expect(save).toHaveBeenLastCalledWith({ path: `/tasks/${task.id}/complete`, body: { completed: true } });
  expect(screen.getByText('Task completed.')).toBeOnTheScreen(); expect(screen.queryByText('Mark task complete')).toBeNull();
});
it('guards rapid completion taps and disables reset and navigation during a write', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); render(<FocusScreen/>); start(); finish();
  act(() => { const button = screen.getByText('Mark task complete'); fireEvent.press(button); fireEvent.press(button); });
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Back to Today' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Take a 5 min break' })).toBeDisabled();
  await act(async () => resolve()); expect(screen.getByText('Task completed.')).toBeOnTheScreen();
});
it('supports free focus when tasks are unavailable and never offers completion for unknown IDs', () => {
  showTasks([], { data: undefined, error: new Error('Offline') }); render(<FocusScreen/>);
  start(); act(() => jest.advanceTimersByTime(25 * 60_000));
  expect(screen.getByText('Block finished. Nice work.')).toBeOnTheScreen(); expect(screen.queryByText('Mark task complete')).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
it.each(['unknown', 'recurring', 'completed'])('does not select %s tasks from route params', kind => {
  if (kind === 'unknown') jest.mocked(useLocalSearchParams).mockReturnValue({ taskId: '99999999-0000-4000-8000-000000000001' });
  if (kind === 'recurring') showTasks([{ ...task, recurrence: { frequency: 'daily', interval: 1 } }]);
  if (kind === 'completed') showTasks([{ ...task, completedAt: '2026-10-07T00:00:00Z' }]);
  render(<FocusScreen/>); expect(screen.getByRole('alert')).toHaveTextContent(/unavailable for a focus block/);
  expect(useFocusStore.getState().target).toBeNull();
});
it('confirms reset without changing the task and can take a short break', () => {
  render(<FocusScreen/>); start(); fireEvent.press(screen.getByText('End session')); fireEvent.press(screen.getByText('Keep going'));
  expect(screen.getByText('Focus in progress')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('End session')); fireEvent.press(screen.getByText('End and reset'));
  expect(screen.getByText('Ready when you are')).toBeOnTheScreen(); expect(save).not.toHaveBeenCalled();
  start(); finish(); fireEvent.press(screen.getByText('Take a 5 min break')); expect(screen.getByText('05:00')).toBeOnTheScreen();
  act(() => jest.advanceTimersByTime(5 * 60_000)); expect(screen.getByText('Break finished. Ready for another block?')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Another focus block')); expect(screen.getByText('25:00')).toBeOnTheScreen();
});
it('discards private focus state on renewed login and does not carry over a pending success', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
  render(<FocusScreen/>); start(); finish(); fireEvent.press(screen.getByText('Mark task complete'));
  jest.mocked(useLocalSearchParams).mockReturnValue({}); showTasks([]);
  act(() => useSessionStore.setState({ session: { ...session, accessToken: 'new-login' } }));
  expect(useFocusStore.getState().target).toBeNull(); expect(screen.queryByText('Outline my report')).toBeNull();
  await act(async () => resolve()); expect(screen.queryByText('Task completed.')).toBeNull();
});
