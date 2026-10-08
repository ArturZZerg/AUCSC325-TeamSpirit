import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import RoutinesScreen from '../app/routines';
import { useAction, useGoals } from '../src/features/queries';
import { snapshotFixture } from './snapshot-fixture';
const mockPush = jest.fn(); const mockReplace = jest.fn(); let mockToken: string | null = 'first'; let mockResume = 0;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useGoals: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09', resumeCount: mockResume }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: mockToken ? { accessToken: mockToken, user: { id: 'account', timeZone: 'America/Edmonton' } } : null }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const save = jest.fn(); const refresh = jest.fn();
const choose = (title: string) => fireEvent.press(screen.getByRole('button', { name: `Customize ${title}` }));
beforeEach(() => {
  jest.clearAllMocks(); mockToken = 'first'; mockResume = 0; save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useGoals).mockReturnValue({ data: [], refetch: refresh } as unknown as ReturnType<typeof useGoals>);
});

describe('student routine library (ToR 3.4, 15, 19)', () => {
  it('offers 12 ideas, filters by area and search, and resets an empty result', () => {
    render(<RoutinesScreen/>); expect(screen.getByText('12 ideas')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'Study' })); expect(screen.getByText('4 ideas')).toBeOnTheScreen();
    expect(screen.queryByText('Take a walk outside')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Search routine ideas'), '  LECTURE  '); expect(screen.getByText('1 idea')).toBeOnTheScreen();
    expect(screen.getByText('Review lecture notes')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Search routine ideas'), 'no-such-idea'); expect(screen.getByText('No ideas match yet.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Reset filters')); expect(screen.getByText('12 ideas')).toBeOnTheScreen(); expect(save).not.toHaveBeenCalled();
  });
  it('lets students review and change a weekday routine before creating an ordinary Goal', async () => {
    render(<RoutinesScreen/>); choose('Review lecture notes'); expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Goal title')).toHaveDisplayValue('Review lecture notes');
    expect(screen.getByRole('radio', { name: 'Choose days' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Saturday' })).not.toBeChecked();
    fireEvent.changeText(screen.getByLabelText('Goal title'), 'Review my notes');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Friday' })); fireEvent.press(screen.getByRole('checkbox', { name: 'Saturday' }));
    await act(async () => fireEvent.press(screen.getByText('Save goal')));
    expect(save).toHaveBeenCalledWith({ path: '/goals', method: 'POST', body: { title: 'Review my notes', category: 'university', timeZone: 'America/Edmonton', schedule: { kind: 'weekly', weekdays: [1, 2, 3, 4, 6] } } });
    expect(screen.getByText('Your routine was saved.')).toBeOnTheScreen(); expect(screen.queryByLabelText('Goal title')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Manage Review lecture notes' })); expect(mockPush).toHaveBeenCalledWith('/wellness');
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('creates a flexible weekly target with no implicit reminder', async () => {
    render(<RoutinesScreen/>); choose('Make time to move');
    expect(screen.getByRole('radio', { name: 'Weekly target' })).toBeChecked();
    expect(screen.getByLabelText('Times per week (1–7)')).toHaveDisplayValue('3');
    fireEvent.changeText(screen.getByLabelText('Times per week (1–7)'), '2'); await act(async () => fireEvent.press(screen.getByText('Save goal')));
    expect(save).toHaveBeenCalledWith({ path: '/goals', method: 'POST', body: { title: 'Make time to move', category: 'fitness', timeZone: 'America/Edmonton', schedule: { kind: 'weeklyTarget', target: 2 } } });
  });
  it('recognizes title matches in saved data, including paused routines, without editing them', () => {
    jest.mocked(useGoals).mockReturnValue({ data: [{ ...snapshotFixture().goals[0], title: '  TAKE A WALK   OUTSIDE ', pausedAt: '2025-03-08T12:00:00Z' }], refetch: refresh } as unknown as ReturnType<typeof useGoals>);
    render(<RoutinesScreen/>); expect(screen.getByText('A routine with this title is paused.')).toBeOnTheScreen();
    expect(screen.getByText('Your schedule: Every day')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Customize Take a walk outside' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Manage Take a walk outside' })); expect(mockPush).toHaveBeenCalledWith('/wellness'); expect(save).not.toHaveBeenCalled();
  });
  it('keeps a failed routine draft, shows no success, and permits retry', async () => {
    save.mockRejectedValueOnce(new Error('Offline write')); render(<RoutinesScreen/>); choose('Take a walk outside');
    fireEvent.changeText(screen.getByLabelText('Goal title'), 'Walk between classes'); await act(async () => fireEvent.press(screen.getByText('Save goal')));
    expect(screen.getByRole('alert')).toHaveTextContent('Offline write'); expect(screen.getByLabelText('Goal title')).toHaveDisplayValue('Walk between classes');
    expect(screen.queryByText('Your routine was saved.', { includeHiddenElements: true })).toBeNull();
    await act(async () => fireEvent.press(screen.getByText('Save goal'))); expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Your routine was saved.')).toBeOnTheScreen();
  });
  it('blocks repeated saves and cancellation until an in-flight save completes', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); render(<RoutinesScreen/>); choose('Take a walk outside');
    act(() => { const button = screen.getByText('Save goal'); fireEvent.press(button); fireEvent.press(button); }); await screen.findByText('Saving…');
    fireEvent.press(screen.getByText('Cancel')); expect(screen.getByLabelText('Goal title')).toBeOnTheScreen(); expect(save).toHaveBeenCalledTimes(1);
    await act(async () => resolve()); expect(screen.getByText('Your routine was saved.')).toBeOnTheScreen();
  });
  it('cancels without creating anything and reopens fresh template defaults', () => {
    render(<RoutinesScreen/>); choose('Take a walk outside'); fireEvent.changeText(screen.getByLabelText('Goal title'), 'Discard this draft');
    fireEvent.press(screen.getByText('Cancel')); choose('Take a walk outside'); expect(screen.getByLabelText('Goal title')).toHaveDisplayValue('Take a walk outside');
    expect(save).not.toHaveBeenCalled();
  });
  it('offers a custom routine without preset title or cadence changes', async () => {
    render(<RoutinesScreen/>); fireEvent.press(screen.getByText('Create my own routine')); expect(screen.getByLabelText('Goal title')).toHaveDisplayValue('');
    fireEvent.changeText(screen.getByLabelText('Goal title'), 'My own idea'); await act(async () => fireEvent.press(screen.getByText('Save goal')));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ path: '/goals', body: expect.objectContaining({ title: 'My own idea', schedule: { kind: 'daily' } }) }));
  });
  it('keeps ideas available when existing routines are unavailable and supports retry/resume', () => {
    jest.mocked(useGoals).mockReturnValue({ data: undefined, error: new Error('Offline'), refetch: refresh } as unknown as ReturnType<typeof useGoals>);
    const ui = render(<RoutinesScreen/>); expect(screen.getByText('12 ideas')).toBeOnTheScreen(); expect(screen.getByText(/haven’t loaded/)).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Refresh my routines')); fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'); expect(refresh).toHaveBeenCalledTimes(2);
    mockResume = 1; ui.rerender(<RoutinesScreen/>); expect(refresh).toHaveBeenLastCalledWith({ cancelRefetch: false });
  });
  it.each(['second', null, 'new-login'])('discards private drafts and filters on session change: %s', token => {
    const ui = render(<RoutinesScreen/>); fireEvent.changeText(screen.getByLabelText('Search routine ideas'), 'Walk'); choose('Take a walk outside');
    fireEvent.changeText(screen.getByLabelText('Goal title'), 'Private routine'); mockToken = token; ui.rerender(<RoutinesScreen/>);
    expect(screen.queryByLabelText('Goal title')).toBeNull(); if (token) expect(screen.getByLabelText('Search routine ideas')).toHaveDisplayValue(''); expect(save).not.toHaveBeenCalled();
  });
  it('isolates a late save success from a new session', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); const ui = render(<RoutinesScreen/>); choose('Take a walk outside');
    fireEvent.press(screen.getByText('Save goal')); await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    mockToken = 'second'; ui.rerender(<RoutinesScreen/>); await act(async () => resolve());
    expect(screen.queryByText('Your routine was saved.')).toBeNull(); expect(screen.getByRole('button', { name: 'Customize Take a walk outside' })).toBeOnTheScreen();
  });
});
