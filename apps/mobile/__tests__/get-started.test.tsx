import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import GetStartedScreen from '../app/get-started';
import { useAcademic, useAction, useCourses, useGoals, useTasks } from '../src/features/queries';
import { snapshotFixture } from './snapshot-fixture';
import { essay } from './academic-fixture';

const mockPush = jest.fn(); const mockReplace = jest.fn(); let mockToken: string | null = 'first';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/features/queries', () => ({ useAcademic: jest.fn(), useAction: jest.fn(), useCourses: jest.fn(), useGoals: jest.fn(), useTasks: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09', resumeCount: 0 }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: mockToken ? { accessToken: mockToken, user: { id: 'account', timeZone: 'America/Edmonton' } } : null }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const save = jest.fn(); const refresh = jest.fn();
const snapshot = snapshotFixture();
beforeEach(() => {
  jest.clearAllMocks(); mockToken = 'first'; save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as unknown as ReturnType<typeof useAction>);
  jest.mocked(useTasks).mockReturnValue({ data: [], refetch: refresh } as unknown as unknown as ReturnType<typeof useTasks>);
  jest.mocked(useAcademic).mockReturnValue({ data: [], refetch: refresh } as unknown as unknown as ReturnType<typeof useAcademic>);
  jest.mocked(useGoals).mockReturnValue({ data: [], refetch: refresh } as unknown as unknown as ReturnType<typeof useGoals>);
  jest.mocked(useCourses).mockReturnValue({ data: [], refetch: refresh } as unknown as unknown as ReturnType<typeof useCourses>);
});

describe('guided setup (ToR 4, 7, 15, 19)', () => {
  it('creates nothing on arrival or cancellation, and updates progress from actual records', () => {
    const ui = render(<GetStartedScreen/>); expect(screen.getByText('0 of 3 foundations added')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Add a task for today')); fireEvent.press(screen.getByText('Cancel'));
    expect(save).not.toHaveBeenCalled(); expect(screen.getByText('0 of 3 foundations added')).toBeOnTheScreen();
    jest.mocked(useTasks).mockReturnValue({ data: snapshot.personalTasks, refetch: refresh } as unknown as ReturnType<typeof useTasks>);
    jest.mocked(useAcademic).mockReturnValue({ data: [{ ...essay, source: 'manual' }], refetch: refresh } as unknown as ReturnType<typeof useAcademic>);
    jest.mocked(useGoals).mockReturnValue({ data: snapshot.goals, refetch: refresh } as unknown as ReturnType<typeof useGoals>);
    ui.rerender(<GetStartedScreen/>); expect(screen.getByText('3 of 3 foundations added')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('View my tasks')); expect(mockPush).toHaveBeenCalledWith('/tasks');
    fireEvent.press(screen.getByText('View my coursework')); expect(mockPush).toHaveBeenCalledWith('/academics');
    fireEvent.press(screen.getByText('View my routines')); expect(mockPush).toHaveBeenCalledWith('/wellness');
  });
  it('does not treat demo coursework as an added academic foundation', () => {
    jest.mocked(useAcademic).mockReturnValue({ data: [{ ...essay, source: 'canvas:fixture' }], refetch: refresh } as unknown as ReturnType<typeof useAcademic>);
    render(<GetStartedScreen/>); expect(screen.getByText('0 of 3 foundations added')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add coursework' })).toBeOnTheScreen();
  });
  it('labels unavailable account reads and preserves known cached progress after a refresh failure', () => {
    jest.mocked(useTasks).mockReturnValue({ data: undefined, error: new Error('Offline'), refetch: refresh } as unknown as ReturnType<typeof useTasks>);
    jest.mocked(useGoals).mockReturnValue({ data: snapshot.goals, error: new Error('Offline'), refetch: refresh } as unknown as ReturnType<typeof useGoals>);
    render(<GetStartedScreen/>); expect(screen.getByText('1 of 3 foundations added')).toBeOnTheScreen();
    expect(screen.getByText('NOT LOADED')).toBeOnTheScreen(); expect(screen.getByRole('alert')).toHaveTextContent(/saved information/);
    fireEvent.press(screen.getByText('Refresh setup')); expect(refresh).toHaveBeenCalledTimes(4);
  });
  it('shows loading without claiming an empty account and supports pull-to-refresh', () => {
    jest.mocked(useTasks).mockReturnValue({ data: undefined, refetch: refresh } as unknown as ReturnType<typeof useTasks>);
    render(<GetStartedScreen/>); expect(screen.getByText('Checking your saved tasks, coursework and routines…')).toBeOnTheScreen();
    expect(screen.getByText('NOT LOADED')).toBeOnTheScreen();
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'); expect(refresh).toHaveBeenCalledTimes(4);
  });
  it('saves a quick task on the account date, keeps a failed draft, and permits retry', async () => {
    save.mockRejectedValueOnce(new Error('Network unavailable')); render(<GetStartedScreen/>);
    fireEvent.press(screen.getByText('Add a task for today')); fireEvent.changeText(screen.getByLabelText('Title'), 'Read chapter 4');
    fireEvent.press(screen.getByText('Save task')); await screen.findByText('Network unavailable');
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Read chapter 4');
    expect(screen.getByText('0 of 3 foundations added', { includeHiddenElements: true })).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText('Save task')));
    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull());
    expect(save).toHaveBeenLastCalledWith({ path: '/tasks', method: 'POST', body: {
      title: 'Read chapter 4', description: null, category: 'personal', priority: 'medium', due: null,
      scheduled: { kind: 'date', date: '2025-03-09' },
    } });
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('opens real coursework and goal editors without depending on a Canvas connection', async () => {
    render(<GetStartedScreen/>); fireEvent.press(screen.getByText('Add coursework'));
    expect(screen.getByLabelText('Coursework title')).toHaveDisplayValue(''); fireEvent.press(screen.getByText('Cancel'));
    fireEvent.press(screen.getByText('Create a routine')); fireEvent.changeText(screen.getByLabelText('Goal title'), 'Read a little');
    await act(async () => fireEvent.press(screen.getByText('Save goal')));
    await waitFor(() => expect(screen.queryByLabelText('Goal title')).toBeNull());
    expect(save).toHaveBeenCalledWith({ path: '/goals', method: 'POST', body: {
      title: 'Read a little', category: 'health', timeZone: 'America/Edmonton', schedule: { kind: 'daily' },
    } });
  });
  it.each(['second', null, 'new-login'])('discards private setup drafts on session change: %s', token => {
    const ui = render(<GetStartedScreen/>); fireEvent.press(screen.getByText('Add a task for today'));
    fireEvent.changeText(screen.getByLabelText('Title'), 'Private draft'); mockToken = token; ui.rerender(<GetStartedScreen/>);
    expect(screen.queryByLabelText('Title')).toBeNull(); expect(save).not.toHaveBeenCalled();
  });
  it('blocks repeated saves and dismissal while adding a task', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    render(<GetStartedScreen/>); fireEvent.press(screen.getByText('Add a task for today')); fireEvent.changeText(screen.getByLabelText('Title'), 'Read');
    act(() => { const button = screen.getByText('Save task'); fireEvent.press(button); fireEvent.press(button); }); await screen.findByText('Saving…');
    fireEvent.press(screen.getByText('Cancel')); expect(screen.getByLabelText('Title')).toBeOnTheScreen(); expect(save).toHaveBeenCalledTimes(1);
    await act(async () => resolve()); expect(screen.queryByLabelText('Title')).toBeNull();
  });
  it('connects the guide to weekly planning, free focus and Today', () => {
    render(<GetStartedScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Plan my week' })); expect(mockPush).toHaveBeenCalledWith('/planner');
    fireEvent.press(screen.getByRole('button', { name: 'Try focus space' })); expect(mockPush).toHaveBeenCalledWith('/focus');
    fireEvent.press(screen.getByRole('button', { name: 'Browse routine ideas' })); expect(mockPush).toHaveBeenCalledWith('/routines');
    fireEvent.press(screen.getByText('Open my daily plan')); expect(mockReplace).toHaveBeenCalledWith('/today');
  });
});
