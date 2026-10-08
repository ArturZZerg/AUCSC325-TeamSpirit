import { fireEvent, render, screen } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import ReviewScreen from '../app/review';
import { usePlanningSnapshot } from '../src/features/queries';
import { accountId, snapshotFixture } from './snapshot-fixture';

const mockPush = jest.fn(); const mockReplace = jest.fn(); let mockToken: string | null = 'first';
let mockAccountId = '10000000-0000-4000-8000-000000000001';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('../src/features/queries', () => ({ usePlanningSnapshot: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09', resumeCount: 0 }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: mockToken ? { accessToken: mockToken, user: { id: mockAccountId, timeZone: 'America/Edmonton' } } : null }) }));
const refetch = jest.fn();
function fixture() {
  const snapshot = snapshotFixture();
  return { ...snapshot, capturedAt: '2025-03-09T18:00:00Z', coverage: { ...snapshot.coverage, from: '2025-03-03' },
    personalTasks: [{ ...snapshot.personalTasks[0], recurrence: null, completedAt: '2025-03-08T18:00:00Z' }],
    taskCompletions: [], goalCompletions: [{ ...snapshot.goalCompletions[0], state: 'completed' as const, completedAt: '2025-03-09T15:00:00Z' }] };
}
function show(overrides = {}) {
  jest.mocked(usePlanningSnapshot).mockReturnValue({ data: fixture(), accountId, timeZone: 'America/Edmonton',
    isLoading: false, isRefetching: false, refetch, ...overrides } as unknown as ReturnType<typeof usePlanningSnapshot>);
}
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(new Date('2025-03-09T18:00:00Z')); mockToken = 'first'; mockAccountId = accountId; show(); });
afterEach(() => jest.useRealTimers());

describe('Weekly review interactions', () => {
  it('shows recorded work and routes a covered day into Today', () => {
    render(<ReviewScreen/>); expect(usePlanningSnapshot).toHaveBeenCalledWith('2025-03-03');
    expect(screen.getByText('Daily reading')).toBeOnTheScreen(); expect(screen.getByText('Exercise')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Sunday, March 9, 0 tasks finished, 1 routine check-in/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/today', params: { date: '2025-03-09' } });
  });
  it('allows earlier weeks, returns to this week, and does not navigate into future weeks', () => {
    render(<ReviewScreen/>); expect(screen.getByText('Next week')).toBeDisabled();
    fireEvent.press(screen.getByText('Previous week')); expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-02-24');
    expect(screen.getByText('Next week')).toBeEnabled(); fireEvent.press(screen.getByText('Next week'));
    expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-03'); fireEvent.press(screen.getByText('Previous week')); fireEvent.press(screen.getByText('This week'));
    expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-03');
  });
  it('keeps saved work visible on refresh failure and supports pull refresh', () => {
    show({ error: new Error('Offline') }); render(<ReviewScreen/>);
    expect(screen.getByText('Daily reading')).toBeOnTheScreen(); expect(screen.getByText('Couldn’t refresh. Showing saved information when available.')).toBeOnTheScreen();
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'); expect(refetch).toHaveBeenCalledTimes(1);
  });
  it('marks partial coverage explicitly and disables an unknown day', () => {
    show({ data: { ...fixture(), coverage: snapshotFixture().coverage } }); render(<ReviewScreen/>);
    expect(screen.getByText('Information available for 2 of 7 elapsed days. Totals include available days only.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Monday, March 3, not available/ })).toBeDisabled();
    fireEvent.press(screen.getByText('Refresh this review')); expect(refetch).toHaveBeenCalledTimes(1);
  });
  it('withholds totals and empty-success claims when no week data exists', () => {
    show({ data: undefined }); render(<ReviewScreen/>); expect(screen.getByText('Some days haven’t loaded.')).toBeOnTheScreen();
    expect(screen.queryByText('Personal tasks finished')).toBeNull(); expect(screen.queryByText(/No personal task completions/)).toBeNull();
    fireEvent.press(screen.getByText('Refresh this review')); expect(refetch).toHaveBeenCalledTimes(1);
  });
  it('shows an honest empty review with links to create routines and plan work', () => {
    show({ data: { ...fixture(), personalTasks: [], goals: [], taskCompletions: [], goalCompletions: [] } }); render(<ReviewScreen/>);
    expect(screen.getByText(/No personal task completions recorded/)).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Find a routine idea')); expect(mockPush).toHaveBeenLastCalledWith('/routines');
    fireEvent.press(screen.getByText('Plan my week')); expect(mockPush).toHaveBeenLastCalledWith('/planner');
  });
  it('offers existing entity workspaces without mutating the derived review', () => {
    render(<ReviewScreen/>); fireEvent.press(screen.getByText('Open Tasks')); expect(mockPush).toHaveBeenLastCalledWith('/tasks');
    fireEvent.press(screen.getByText('Open Wellness')); expect(mockPush).toHaveBeenLastCalledWith('/wellness');
    fireEvent.press(screen.getByText('Open Coursework')); expect(mockPush).toHaveBeenLastCalledWith('/academics');
    fireEvent.press(screen.getByText('Back to Today')); expect(mockReplace).toHaveBeenCalledWith('/today');
  });
  it('allows a student to expand a longer completion list', () => {
    const snapshot = fixture(); snapshot.personalTasks = Array.from({ length: 7 }, (_, i) => ({ ...snapshot.personalTasks[0], id: `20000000-0000-4000-8000-00000000000${i + 1}`, title: `Finished task ${i + 1}` }));
    show({ data: snapshot }); render(<ReviewScreen/>); expect(screen.queryByText('Finished task 7')).toBeNull();
    fireEvent.press(screen.getByText('Show all 7 task completions')); expect(screen.getByText('Finished task 7')).toBeOnTheScreen();
  });
  it('withholds previous-account work even if a late query result is still present', () => {
    const ui = render(<ReviewScreen/>); expect(screen.getByText('Daily reading')).toBeOnTheScreen();
    mockAccountId = '10000000-0000-4000-8000-000000000002'; mockToken = 'second'; ui.rerender(<ReviewScreen/>);
    expect(screen.queryByText('Daily reading')).toBeNull(); expect(screen.queryByText('Exercise')).toBeNull();
  });
  it.each(['second', null, 'new-login'])('discards a private week selection on session change: %s', token => {
    const ui = render(<ReviewScreen/>); fireEvent.press(screen.getByText('Previous week')); mockToken = token; ui.rerender(<ReviewScreen/>);
    if (token) expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-03'); else expect(screen.queryByText('Previous week')).toBeNull();
  });
});
