import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import DayReview from '../app/day-review';
import { useAction, useFocusHistory, usePlanningSnapshot } from '../src/features/queries';
import { api } from '../src/lib/api';
import { accountId, snapshotFixture } from './snapshot-fixture';
import { reportFixture } from './study-report-fixture';

const mockPush = jest.fn(), mockReplace = jest.fn();
let mockToken: string | null = 'first', mockAccount = accountId, mockZone = 'America/Edmonton', mockToday = '2025-03-09', mockResume = 0;
let mockParams: { date?: string | string[] } = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useLocalSearchParams: () => mockParams }));
jest.mock('../src/features/queries', () => ({ usePlanningSnapshot: jest.fn(), useFocusHistory: jest.fn(), useAction: jest.fn() }));
jest.mock('../src/lib/api', () => ({ ...jest.requireActual('../src/lib/api'), api: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: mockToday, resumeCount: mockResume }) }));
jest.mock('../src/features/use-agenda-clock', () => ({ useAgendaClock: () => `${mockToday}T18:00:00Z` }));
jest.mock('../src/store/session', () => {
  const state = () => ({ session: mockToken ? { accessToken: mockToken, user: { id: mockAccount, timeZone: mockZone } } : null });
  const hook = (select: (value: unknown) => unknown) => select(state()); hook.getState = state;
  return { useSessionStore: hook };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const refreshProgress = jest.fn(), refreshHistory = jest.fn(), save = jest.fn();
const task = () => ({ ...snapshotFixture().personalTasks[0], title: 'Review lecture notes', recurrence: null, scheduled: { kind: 'date' as const, date: '2025-03-09' } });
function progress() { return { ...snapshotFixture(), capturedAt: '2025-03-09T18:00:00Z', coverage: { from: '2025-03-03', through: '2025-03-15', includesOverdue: true, basis: 'persisted' }, personalTasks: [task()], taskCompletions: [] }; }
function queries(data: unknown, history: unknown, flags = {}) {
  const query = { isLoading: false, isRefetching: false, isFetching: false, isCached: false, ...flags };
  jest.mocked(usePlanningSnapshot).mockReturnValue({ ...query, data, refetch: refreshProgress } as unknown as ReturnType<typeof usePlanningSnapshot>);
  jest.mocked(useFocusHistory).mockReturnValue({ ...query, data: history, refetch: refreshHistory } as unknown as ReturnType<typeof useFocusHistory>);
}
beforeEach(() => {
  jest.clearAllMocks(); mockToken = 'first'; mockAccount = accountId; mockZone = 'America/Edmonton'; mockToday = '2025-03-09'; mockResume = 0; mockParams = {};
  queries(progress(), reportFixture()); save.mockReset().mockResolvedValue({}); jest.mocked(api).mockReset().mockResolvedValue(task());
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});

it('connects a proven day, shared study history, journal and tomorrow without writing on open', () => {
  render(<DayReview/>); expect(screen.getByText('25m')).toBeOnTheScreen(); expect(screen.getByText('Review lecture notes')).toBeOnTheScreen();
  expect(useFocusHistory).toHaveBeenLastCalledWith('2025-02-24', '2025-03-09');
  fireEvent.press(screen.getByRole('button', { name: 'Open my check-in journal' })); expect(mockPush).toHaveBeenLastCalledWith('/journal');
  fireEvent.press(screen.getByRole('button', { name: 'Open tomorrow’s plan' })); expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/today', params: { date: '2025-03-10' } });
  fireEvent.press(screen.getByRole('button', { name: 'Back to Today' })); expect(mockReplace).toHaveBeenCalledWith('/today');
  expect(save).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
});
it('loads the exact current task before prefilling only its schedule and requiring explicit save', async () => {
  const fresh = { ...task(), title: 'Updated lecture notes', due: { kind: 'date' as const, date: '2025-03-12' } };
  jest.mocked(api).mockResolvedValue(fresh); render(<DayReview/>);
  fireEvent.press(screen.getByRole('button', { name: 'Plan Review lecture notes for tomorrow' }));
  await screen.findByLabelText('Title'); expect(screen.getByLabelText('Title')).toHaveDisplayValue(fresh.title);
  expect(api).toHaveBeenCalledWith(`/tasks/${fresh.id}`, expect.objectContaining({ cache: 'no-store' }));
  expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue('2025-03-10');
  expect(screen.getByLabelText('Due date')).toHaveDisplayValue('2025-03-12'); expect(save).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Save task')));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ path: `/tasks/${fresh.id}`, method: 'PATCH', body: expect.objectContaining({ scheduled: { kind: 'date', date: '2025-03-10' } }) }));
  expect(save.mock.calls[0][0].body.due).toEqual(fresh.due);
  expect(screen.getByRole('alert')).toHaveTextContent(/Task saved\./);
});
it('preserves a failed scheduling draft and leaves cancellation without a write', async () => {
  save.mockRejectedValueOnce(new TypeError('Offline')); render(<DayReview/>);
  fireEvent.press(screen.getByRole('button', { name: 'Plan Review lecture notes for tomorrow' })); await screen.findByLabelText('Scheduled date');
  fireEvent.changeText(screen.getByLabelText('Scheduled date'), '2025-03-11');
  await act(async () => fireEvent.press(screen.getByText('Save task')));
  expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t confirm the save/);
  expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue('2025-03-11');
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' })); expect(screen.queryByLabelText('Scheduled date')).toBeNull(); expect(save).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Task saved\./)).toBeNull();
});
it('does not turn missing or foreign sections into empty success', () => {
  queries(undefined, undefined); const view = render(<DayReview/>);
  expect(screen.getByText('This day hasn’t loaded.')).toBeOnTheScreen(); expect(screen.getByText('Study time hasn’t loaded.')).toBeOnTheScreen();
  expect(screen.queryByText('0s')).toBeNull(); expect(screen.queryByText('Room for a fresh start.')).toBeNull();
  queries({ ...progress(), accountId: '10000000-0000-4000-8000-000000000002' }, undefined); view.rerender(<DayReview/>);
  expect(screen.queryByText('Review lecture notes')).toBeNull();
});
it('keeps cached sections usable, labels their freshness and refreshes both sources', () => {
  queries(progress(), reportFixture(), { isCached: true, error: new Error('Offline') }); render(<DayReview/>);
  expect(screen.getByText('Showing saved study time.')).toBeOnTheScreen(); expect(screen.getByRole('alert')).toHaveTextContent(/Showing saved progress/);
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'); expect(refreshProgress).toHaveBeenCalledTimes(1); expect(refreshHistory).toHaveBeenCalledTimes(1);
});
it.each(['invalid', '2025-02-30', '2025-03-10', ['2025-03-08', '2025-03-09']])('ignores an unusable date query without passing it to the API', date => {
  mockParams = { date }; render(<DayReview/>); expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-09');
});
it('browses past days but plans for tomorrow relative to the current account day', () => {
  mockParams = { date: '2025-03-08' }; render(<DayReview/>);
  expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-08');
  fireEvent.press(screen.getByRole('button', { name: 'Open tomorrow’s plan' })); expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/today', params: { date: '2025-03-10' } });
  fireEvent.press(screen.getByRole('button', { name: 'Today' })); expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
});
it('refreshes study history on resume and follows midnight when no day is selected', () => {
  const view = render(<DayReview/>); mockResume++; mockToday = '2025-03-10'; view.rerender(<DayReview/>);
  expect(refreshHistory).toHaveBeenCalledWith({ cancelRefetch: false }); expect(usePlanningSnapshot).toHaveBeenLastCalledWith('2025-03-10');
  expect(screen.getByText('Study time hasn’t loaded.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Open tomorrow’s plan' })); expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/today', params: { date: '2025-03-11' } });
});
it.each(['credentials', 'account', 'zone', 'logout'])('clears private editing when %s changes', async change => {
  const view = render(<DayReview/>); fireEvent.press(screen.getByRole('button', { name: 'Plan Review lecture notes for tomorrow' })); await screen.findByLabelText('Title');
  if (change === 'credentials') mockToken = 'second'; else if (change === 'account') mockAccount = '10000000-0000-4000-8000-000000000002';
  else if (change === 'zone') mockZone = 'UTC'; else mockToken = null;
  view.rerender(<DayReview/>); await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull()); expect(save).not.toHaveBeenCalled();
});
it('does not confirm an earlier account save in the new credential scope', async () => {
  let resolve!: (value: object) => void; save.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const view = render(<DayReview/>); fireEvent.press(screen.getByRole('button', { name: 'Plan Review lecture notes for tomorrow' })); await screen.findByLabelText('Scheduled date');
  await act(async () => fireEvent.press(screen.getByText('Save task')));
  mockToken = 'second'; view.rerender(<DayReview/>);
  await act(async () => resolve({})); expect(screen.queryByText(/Task saved\./)).toBeNull(); expect(screen.queryByLabelText('Scheduled date')).toBeNull();
});
