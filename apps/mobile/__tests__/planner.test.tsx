import { fireEvent, render, screen } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import PlannerScreen from '../app/planner';
import { usePlanningSnapshot } from '../src/features/queries';
import { accountId, snapshotFixture } from './snapshot-fixture';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockToken = 'first';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('../src/features/queries', () => ({ usePlanningSnapshot: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09', resumeCount: 0 }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: mockToken, user: { id: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton' } } }) }));
const refetch = jest.fn();
function show(overrides = {}) {
  jest.mocked(usePlanningSnapshot).mockReturnValue({ data: { ...snapshotFixture(), coverage: { ...snapshotFixture().coverage, from: '2025-03-03' } },
    accountId, timeZone: 'America/Edmonton', isLoading: false, isRefetching: false, refetch, ...overrides } as unknown as ReturnType<typeof usePlanningSnapshot>);
}
beforeEach(() => { jest.clearAllMocks(); mockToken = 'first'; show(); });

describe('Planner interactions', () => {
  it('opens the weekly review', () => {
    render(<PlannerScreen/>); fireEvent.press(screen.getByText('Review your week'));
    expect(mockPush).toHaveBeenCalledWith('/review');
  });
  it('opens the account-selected day through Today and supports day selection', () => {
    render(<PlannerScreen/>);
    expect(usePlanningSnapshot).toHaveBeenCalledWith('2025-03-03');
    fireEvent.press(screen.getByRole('button', { name: /^Saturday, March 8/ }));
    fireEvent.press(screen.getByRole('button', { name: 'Open this day’s plan' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/today', params: { date: '2025-03-08' } });
  });
  it('moves across weeks and returns to the account current week', () => {
    render(<PlannerScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
    expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-10');
    fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
    expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-03');
    fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
    expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-02-24');
    fireEvent.press(screen.getByText('This week'));
    expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-03');
  });
  it('shows saved items alongside refresh failure and retries reads', () => {
    show({ error: new Error('Offline') }); render(<PlannerScreen/>);
    expect(screen.getByText('Daily reading')).toBeOnTheScreen();
    expect(screen.getByText('Couldn’t refresh. Showing saved information when available.')).toBeOnTheScreen();
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    expect(refetch).toHaveBeenCalledTimes(1);
  });
  it('withholds an uncovered day and lets the user retry', () => {
    show({ data: undefined }); render(<PlannerScreen/>);
    expect(screen.getByText('This day hasn’t been loaded.')).toBeOnTheScreen();
    expect(screen.queryByText('A little breathing room.')).toBeNull();
    expect(screen.queryByText('planned items')).toBeNull();
    fireEvent.press(screen.getByText('Retry')); expect(refetch).toHaveBeenCalledTimes(1);
  });
  it('discards a selected week on session change', () => {
    const view = render(<PlannerScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
    mockToken = 'new-login'; view.rerender(<PlannerScreen/>);
    expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-03');
  });
});
