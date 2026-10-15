import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TodayScreen from '../app/(tabs)/today';
import { useAction, useToday } from '../src/features/queries';
import type { PlanItem, Today } from '../src/lib/types';
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('../src/features/day-agenda', () => ({ DayAgenda: () => null }));
jest.mock('../src/features/queries', () => ({ useTasks: () => ({ data: undefined }), useAcademic: () => ({ data: undefined }), useCourses: () => ({ data: undefined }), useAction: jest.fn(), useToday: jest.fn() }));
const item: PlanItem = { key: 'personalTask:1', kind: 'personalTask', entityId: '1', occurrenceKey: null, title: 'Read', schedule: null, due: null, state: 'today', isMainGoal: false, priority: 'medium', allowedActions: ['complete'] };
const show = (items: PlanItem[], upcoming: PlanItem[] = [], timeZone = 'America/Edmonton', extra = {}, date = '2025-03-09') => {
  const data: Today = { date, timeZone, generatedAt: '2025-03-09T12:00:00Z', sourceStatus: { availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null }, items, upcoming, campusEvents: [] };
  jest.mocked(useToday).mockReturnValue({ date: data.date, timeZone, data, isLoading: false, isRefetching: false, ...extra } as ReturnType<typeof useToday>);
};
const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});
it('shows separate scheduled work and academic deadlines in the account timezone', () => {
  show([{ ...item, kind: 'academic', allowedActions: [], due: { kind: 'instant', at: '2025-03-10T05:59:00Z' } },
    { ...item, key: 'personalTask:2', schedule: { kind: 'instant', at: '2025-03-09T21:00:00Z' }, due: { kind: 'date', date: '2025-03-10' } }]);
  render(<TodayScreen/>);
  // 05:59 UTC on the 10th is still the 9th in Edmonton.
  expect(screen.getByText(/^Due 11:59\sPM$/)).toBeOnTheScreen();
  expect(screen.getByText(/^Planned 3:00\sPM · Due tomorrow$/)).toBeOnTheScreen();
});
it('keeps calendar dates unchanged even in a timezone on the previous day', () => {
  show([{ ...item, due: { kind: 'date', date: '2024-02-29' }, schedule: { kind: 'date', date: '2024-02-28' } }], [], 'Pacific/Honolulu');
  render(<TodayScreen/>); expect(screen.getByText('Planned Wed, Feb 28, 2024 · Due Thu, Feb 29, 2024')).toBeOnTheScreen();
});
it('uses the occurrence-specific recurring values supplied by the read model', () => {
  show([{ ...item, occurrenceKey: '2025-03-09', schedule: { kind: 'instant', at: '2025-03-09T09:30:00Z' }, due: { kind: 'date', date: '2025-03-11' } }]);
  render(<TodayScreen/>); expect(screen.getByText(/^Planned 3:30\sAM · Due Tue, Mar 11$/)).toBeOnTheScreen();
});
it.each([
  ['2025-03-09', '2025-03-09T08:30:00Z', 'Due 1:30 AM'], ['2025-03-09', '2025-03-09T09:30:00Z', 'Due 3:30 AM'],
  ['2025-11-02', '2025-11-02T07:30:00Z', 'Due 1:30 AM'], ['2025-11-02', '2025-11-02T09:30:00Z', 'Due 2:30 AM'],
  ['2025-03-09', '2025-03-10T06:00:00Z', 'Due tomorrow, 12:00 AM'],
])('formats a timed deadline on %s (%s) across daylight-saving changes using the account clock', (date, at, label) => {
  show([{ ...item, due: { kind: 'instant', at } }], [], 'America/Edmonton', {}, date); render(<TodayScreen/>);
  expect(screen.getByText(new RegExp(`^${label.split(' ').join('\\s')}$`))).toBeOnTheScreen();
});
it('shows timing in Coming up and labels saved event starts', () => {
  show([{ ...item, kind: 'event', allowedActions: [], schedule: { kind: 'instant', at: '2025-03-10T22:00:00Z' } }],
    [{ ...item, key: 'personalTask:3', state: 'upcoming', due: { kind: 'date', date: '2025-03-12' }, schedule: { kind: 'date', date: '2025-03-11' } }]);
  render(<TodayScreen/>); expect(screen.getByText(/^Starts tomorrow, 4:00\sPM$/)).toBeOnTheScreen();
  expect(screen.getByText('Planned Tue, Mar 11 · Due Wed, Mar 12')).toBeOnTheScreen();
});
it('does not invent timing for undated work or routines without timing', () => {
  show([item, { ...item, key: 'goal:2', kind: 'goal' }]); render(<TodayScreen/>);
  expect(screen.queryByText(/^(Due|Planned|Starts)\b/)).toBeNull();
});
it('retains cached timing on refresh failure and updates when the server changes a deadline', () => {
  show([{ ...item, due: { kind: 'date', date: '2025-03-09' } }], [], 'America/Edmonton', { error: new Error('Offline') });
  const view = render(<TodayScreen/>); expect(screen.getByText('Due today')).toBeOnTheScreen(); expect(screen.getByText(/Couldn’t refresh/)).toBeOnTheScreen();
  show([{ ...item, due: { kind: 'date', date: '2025-03-10' } }]); view.rerender(<TodayScreen/>);
  expect(screen.getByText('Due tomorrow')).toBeOnTheScreen(); expect(screen.queryByText('Due today')).toBeNull();
});
it('preserves timing and existing mutation payloads while completion is pending', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
  show([{ ...item, due: { kind: 'date', date: '2025-03-09' } }]); render(<TodayScreen/>);
  act(() => { fireEvent.press(screen.getByRole('button', { name: 'Complete' })); });
  expect(screen.getByText('Due today')).toBeOnTheScreen(); expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(save).toHaveBeenCalledWith({ path: '/tasks/1/complete', body: { completed: true } });
  await act(async () => { resolve(); });
});
