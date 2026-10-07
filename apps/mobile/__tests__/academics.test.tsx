import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import AcademicsScreen from '../app/academics';
import { useAcademic, useAction, useCourses, usePlanningSnapshot } from '../src/features/queries';
import { courses, essay, missing, now, quiz, submitted, undated } from './academic-fixture';
const mockPush = jest.fn(); const mockReplace = jest.fn(); let mockToken = 'first';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('../src/features/queries', () => ({ useAcademic: jest.fn(), useCourses: jest.fn(), usePlanningSnapshot: jest.fn(), useAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09', resumeCount: 0 }) }));
jest.mock('../src/features/academic-reminder-editor', () => ({ AcademicReminderEditor: ({ item }: { item: { title: string } }) => {
  const { Text } = jest.requireActual('react-native'); return <Text>Reminder for {item.title}</Text>;
} }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: mockToken, user: { id: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton' } } }) }));
const save = jest.fn(); const refetch = jest.fn();
function show(data = [essay, quiz, submitted, missing, undated], overrides = {}) {
  jest.mocked(useAcademic).mockReturnValue({ data, refetch, isLoading: false, isRefetching: false, ...overrides } as unknown as ReturnType<typeof useAcademic>);
}
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date(now)); jest.clearAllMocks(); mockToken = 'first';
  save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useCourses).mockReturnValue({ data: courses, refetch, isRefetching: false } as unknown as ReturnType<typeof useCourses>);
  jest.mocked(usePlanningSnapshot).mockReturnValue({ refetch, isRefetching: false } as unknown as ReturnType<typeof usePlanningSnapshot>); show();
});
afterEach(() => jest.useRealTimers());
describe('Coursework workspace', () => {
  it('filters by course, search and submission view without rewriting imported data', () => {
    render(<AcademicsScreen/>);
    expect(screen.getByText('Demo coursework is shown. Live Canvas access still needs an approved connection.')).toBeOnTheScreen();
    expect(screen.queryByText('Submitted essay')).toBeNull();
    fireEvent.press(screen.getByRole('radio', { name: 'AUCSC 325' })); expect(screen.queryByText('Graph quiz')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Search coursework'), 'testing'); expect(screen.queryByText('Missing worksheet')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Search coursework'), '');
    fireEvent.press(screen.getByRole('radio', { name: 'Finished' })); expect(screen.getByText('Submitted essay')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Make Main Goal today' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull();
  });
  it('sets the account-day Main Goal via PATCH and waits for refreshed state', async () => {
    show([essay]); const ui = render(<AcademicsScreen/>);
    await act(async () => fireEvent.press(screen.getByText('Make Main Goal today')));
    expect(save).toHaveBeenCalledWith({ path: `/academic-items/${essay.id}/main-goal`, method: 'PATCH', body: { date: '2025-03-09' } });
    expect(screen.queryByText('★ MAIN GOAL TODAY')).toBeNull();
    show([{ ...essay, mainGoalDate: '2025-03-09' }]); ui.rerender(<AcademicsScreen/>);
    expect(screen.getByText('★ MAIN GOAL TODAY')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText('Remove Main Goal')));
    expect(save).toHaveBeenLastCalledWith({ path: `/academic-items/${essay.id}/main-goal`, method: 'PATCH', body: { date: null } });
  });
  it('keeps a failed Main Goal change visible and lets the user retry', async () => {
    show([essay]); save.mockRejectedValueOnce(new Error('Offline write')); render(<AcademicsScreen/>);
    await act(async () => fireEvent.press(screen.getByText('Make Main Goal today')));
    expect(screen.getByRole('alert')).toHaveTextContent('Offline write');
    expect(screen.queryByText('★ MAIN GOAL TODAY')).toBeNull();
    await act(async () => fireEvent.press(screen.getByText('Make Main Goal today')));
    expect(save).toHaveBeenCalledTimes(2); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('blocks repeated writes and reminder opening while a change is pending', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); show([essay]); render(<AcademicsScreen/>);
    const select = screen.getByText('Make Main Goal today'); act(() => { fireEvent.press(select); fireEvent.press(select); });
    expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Reminder' })).toBeDisabled();
    await act(async () => resolve());
  });
  it('opens the reminder for the selected academic identity', () => {
    show([essay]); render(<AcademicsScreen/>); fireEvent.press(screen.getByText('Reminder'));
    expect(screen.getByText('Reminder for Testing report')).toBeOnTheScreen();
  });
  it('retains saved coursework on refresh failure and refreshes all related reads', () => {
    show([essay], { error: new Error('Offline') }); render(<AcademicsScreen/>);
    expect(screen.getByText('Testing report')).toBeOnTheScreen();
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'); expect(refetch).toHaveBeenCalledTimes(3);
  });
  it('shows an actionable empty view and can reset filters', () => {
    render(<AcademicsScreen/>); fireEvent.changeText(screen.getByLabelText('Search coursework'), 'nonexistent');
    expect(screen.getByText('Nothing matches this view.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Reset filters')); expect(screen.getByText('Testing report')).toBeOnTheScreen();
  });
  it('remounts filters and dismisses a private reminder on a new session', () => {
    show([essay]); const ui = render(<AcademicsScreen/>); fireEvent.press(screen.getByText('Reminder'));
    fireEvent.changeText(screen.getByLabelText('Search coursework'), 'private search');
    mockToken = 'new-login'; ui.rerender(<AcademicsScreen/>);
    expect(screen.getByLabelText('Search coursework')).toHaveDisplayValue('');
    expect(screen.queryByText('Reminder for Testing report')).toBeNull();
  });
  it('does not claim an unavailable read is an empty academic account', () => {
    show([], { data: undefined, error: new Error('Offline') }); render(<AcademicsScreen/>);
    expect(screen.queryByText('Your coursework will appear here.')).toBeNull();
    fireEvent.press(screen.getByText('Retry coursework')); expect(refetch).toHaveBeenCalledTimes(3);
  });
  it('shows a course metadata failure alongside useful imported work', () => {
    jest.mocked(useCourses).mockReturnValue({ error: new Error('Offline'), refetch } as unknown as ReturnType<typeof useCourses>);
    show([essay]); render(<AcademicsScreen/>); expect(screen.getByText('OTHER COURSEWORK')).toBeOnTheScreen();
    expect(screen.getByText(/Course names couldn’t refresh/)).toBeOnTheScreen();
  });
});
