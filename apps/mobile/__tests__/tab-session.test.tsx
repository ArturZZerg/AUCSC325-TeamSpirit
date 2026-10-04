import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TabsLayout from '../app/(tabs)/_layout';
import { useAction, useAcademic, useGoalHistory, useGoals, usePreferences, useReminders, useTasks, useToday, useWellness } from '../src/features/queries';
import { useSessionStore } from '../src/store/session';
import { composeOfflineToday } from '../src/features/offline-today';
import type { Session } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

let mockRoute = 'tasks';
// Keep actual screen/forms mounted under the navigator's React boundary; native
// routing and notification delivery still require device acceptance.
jest.mock('expo-router', () => ({
  Tabs: Object.assign(() => {
    const Component = jest.requireActual(`../app/(tabs)/${mockRoute}`).default;
    return <Component/>;
  }, { Screen: () => null }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useAcademic: jest.fn(), useGoalHistory: jest.fn(), useGoals: jest.fn(),
  usePreferences: jest.fn(), useReminders: jest.fn(), useTasks: jest.fn(), useToday: jest.fn(), useWellness: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09', resumeCount: 0 }) }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn(), ensureNotificationPermission: jest.fn(), reconcileReminders: jest.fn() }));
jest.mock('../src/services/cache', () => ({ clearAccountCache: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const snapshot = snapshotFixture();
const first: Session = { accessToken: 'first', expiresAt: '2099-01-01T00:00:00Z', user: { id: snapshot.accountId,
  email: 'first@example.test', displayName: 'First', timeZone: snapshot.timeZone, createdAt: snapshot.capturedAt } };
const second: Session = { ...first, accessToken: 'second', user: { ...first.user, id: '10000000-0000-4000-8000-000000000002', timeZone: 'UTC' } };
const task = { ...snapshot.personalTasks[0], recurrence: null, title: 'Private task' };
const save = jest.fn();
const preferences = { academicEnabled: true, personalEnabled: true, goalEnabled: true, eventEnabled: true,
  dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null };
function session(value: Session | null) { act(() => { useSessionStore.setState({ session: value, ready: true }); }); }
beforeEach(() => {
  jest.clearAllMocks(); mockRoute = 'tasks'; session(first); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useTasks).mockReturnValue({ data: [task], isLoading: false } as ReturnType<typeof useTasks>);
  jest.mocked(useAcademic).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useAcademic>);
  jest.mocked(useGoals).mockReturnValue({ data: snapshot.goals, isLoading: false } as ReturnType<typeof useGoals>);
  jest.mocked(useGoalHistory).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useGoalHistory>);
  jest.mocked(useWellness).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useWellness>);
  jest.mocked(usePreferences).mockReturnValue({ data: preferences, isLoading: false } as unknown as ReturnType<typeof usePreferences>);
  jest.mocked(useReminders).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useReminders>);
  const plan = composeOfflineToday({ ...snapshot, goals: [], taskCompletions: [] }, snapshot.accountId, snapshot.timeZone, '2025-03-09', '2025-03-09T18:00:00Z')!;
  jest.mocked(useToday).mockReturnValue({ date: plan.date, timeZone: plan.timeZone, data: plan, isLoading: false, isRefetching: false } as unknown as ReturnType<typeof useToday>);
});

describe('retained tab session boundaries (ToR 7, 15, 19)', () => {
  it.each(['switch', 'sign-out', 'relogin'])('discards a task draft on %s', transition => {
    render(<TabsLayout/>);
    fireEvent.press(screen.getByText('Edit'));
    fireEvent.changeText(screen.getByLabelText('Title'), 'Private draft');
    session(transition === 'switch' ? second : transition === 'sign-out' ? null : { ...first, accessToken: 'new-login' });
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    session(first);
    fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByLabelText('Title')).toHaveDisplayValue(task.title);
  });

  it('discards task deletion and reminder selections at the boundary', () => {
    render(<TabsLayout/>);
    fireEvent.press(screen.getByText('Delete')); session(second);
    expect(screen.queryByText('Delete task?')).toBeNull();
    fireEvent.press(screen.getByText('Set reminder')); session(first);
    expect(screen.queryByText('Task reminder')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves an active wellness draft during rerenders but clears it for another account', () => {
    mockRoute = 'wellness'; const view = render(<TabsLayout/>);
    fireEvent.changeText(screen.getByLabelText('A short note'), 'Private check-in');
    fireEvent.changeText(screen.getByLabelText('Mood (1–5)'), '5');
    view.rerender(<TabsLayout/>);
    expect(screen.getByLabelText('A short note')).toHaveDisplayValue('Private check-in');
    session(second);
    expect(screen.getByLabelText('A short note')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Mood (1–5)')).toHaveDisplayValue('3');
    session(first);
    expect(screen.getByLabelText('A short note')).toHaveDisplayValue('');
  });

  it('dismisses goal editor drafts when the account changes', () => {
    mockRoute = 'wellness'; render(<TabsLayout/>);
    fireEvent.press(screen.getByText('Edit goal'));
    fireEvent.changeText(screen.getByLabelText('Goal title'), 'Private goal draft');
    session(second);
    expect(screen.queryByLabelText('Goal title')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('dismisses notification preference drafts instead of attaching them to the new account', () => {
    mockRoute = 'settings'; render(<TabsLayout/>);
    fireEvent.press(screen.getByText('Edit quiet hours'));
    fireEvent.changeText(screen.getByLabelText('Quiet hours start'), '23:00');
    session(second);
    expect(screen.queryByLabelText('Quiet hours start')).toBeNull();
    fireEvent.press(screen.getByText('Edit quiet hours'));
    expect(screen.getByLabelText('Quiet hours start')).toHaveDisplayValue('');
    expect(save).not.toHaveBeenCalled();
  });

  it('isolates a late Today action failure from the next session with the same item key', async () => {
    mockRoute = 'today'; let reject!: (reason: Error) => void;
    save.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    render(<TabsLayout/>);
    fireEvent.press(screen.getByText('Complete'));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    session(second);
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled();
    await act(async () => { reject(new Error('Private old-account failure')); });
    expect(screen.queryByText('Private old-account failure')).toBeNull();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled();
  });

  it('does not let an old successful deletion dismiss the new account confirmation', async () => {
    let resolve!: () => void;
    save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    render(<TabsLayout/>);
    fireEvent.press(screen.getByText('Delete')); fireEvent.press(screen.getByText('Delete task'));
    session(second); fireEvent.press(screen.getByText('Delete'));
    await act(async () => { resolve(); });
    expect(screen.getByText('Delete task?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete task' })).toBeEnabled();
  });
});
