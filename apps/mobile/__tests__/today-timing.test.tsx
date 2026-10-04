import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TodayScreen from '../app/(tabs)/today';
import { useAction, useToday } from '../src/features/queries';
import type { PlanItem, Today } from '../src/lib/types';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useToday: jest.fn() }));
const item: PlanItem = { key: 'personalTask:1', kind: 'personalTask', entityId: '1', occurrenceKey: null, title: 'Read', schedule: null, due: null, state: 'today', isMainGoal: false, priority: 'medium', allowedActions: ['complete'] };
const show = (items: PlanItem[], upcoming: PlanItem[] = [], timeZone = 'America/Edmonton', extra = {}) => {
  const data: Today = { date: '2025-03-09', timeZone, generatedAt: '2025-03-09T12:00:00Z', sourceStatus: { availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null }, items, upcoming, campusEvents: [] };
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
  expect(screen.getByText('Due: 2025-03-09 23:59 · America/Edmonton')).toBeOnTheScreen();
  expect(screen.getByText('Scheduled: 2025-03-09 15:00 · America/Edmonton')).toBeOnTheScreen(); expect(screen.getByText('Due: 2025-03-10')).toBeOnTheScreen();
});
it('keeps calendar dates unchanged even in a timezone on the previous day', () => {
  show([{ ...item, due: { kind: 'date', date: '2024-02-29' }, schedule: { kind: 'date', date: '2024-02-28' } }], [], 'Pacific/Honolulu');
  render(<TodayScreen/>); expect(screen.getByText('Due: 2024-02-29')).toBeOnTheScreen(); expect(screen.getByText('Scheduled: 2024-02-28')).toBeOnTheScreen();
});
it('uses the occurrence-specific recurring values supplied by the read model', () => {
  show([{ ...item, occurrenceKey: '2025-03-09', schedule: { kind: 'instant', at: '2025-03-09T09:30:00Z' }, due: { kind: 'date', date: '2025-03-11' } }]);
  render(<TodayScreen/>); expect(screen.getByText('Scheduled: 2025-03-09 03:30 · America/Edmonton')).toBeOnTheScreen(); expect(screen.getByText('Due: 2025-03-11')).toBeOnTheScreen();
});
it.each([
  ['2025-03-09T08:30:00Z', '2025-03-09 01:30'], ['2025-03-09T09:30:00Z', '2025-03-09 03:30'],
  ['2025-11-02T07:30:00Z', '2025-11-02 01:30'], ['2025-11-02T09:30:00Z', '2025-11-02 02:30'],
  ['2025-03-10T06:00:00Z', '2025-03-10 00:00'],
])('formats timed deadline %s using the account clock', (at, label) => {
  show([{ ...item, due: { kind: 'instant', at } }]); render(<TodayScreen/>); expect(screen.getByText(`Due: ${label} · America/Edmonton`)).toBeOnTheScreen();
});
it('shows timing in Coming up and labels saved event starts', () => {
  show([{ ...item, kind: 'event', allowedActions: [], schedule: { kind: 'instant', at: '2025-03-09T22:00:00Z' } }],
    [{ ...item, key: 'personalTask:3', state: 'upcoming', due: { kind: 'date', date: '2025-03-12' }, schedule: { kind: 'date', date: '2025-03-11' } }]);
  render(<TodayScreen/>); expect(screen.getByText('Starts: 2025-03-09 16:00 · America/Edmonton')).toBeOnTheScreen();
  expect(screen.getByText('Due: 2025-03-12')).toBeOnTheScreen(); expect(screen.getByText('Scheduled: 2025-03-11')).toBeOnTheScreen();
});
it('does not invent timing for undated work or routines without timing', () => {
  show([item, { ...item, key: 'goal:2', kind: 'goal' }]); render(<TodayScreen/>);
  expect(screen.queryByText(/^(Due|Scheduled|Starts):/)).toBeNull();
});
it('retains cached timing on refresh failure and updates when the server changes a deadline', () => {
  show([{ ...item, due: { kind: 'date', date: '2025-03-09' } }], [], 'America/Edmonton', { error: new Error('Offline') });
  const view = render(<TodayScreen/>); expect(screen.getByText('Due: 2025-03-09')).toBeOnTheScreen(); expect(screen.getByText(/Couldn’t refresh/)).toBeOnTheScreen();
  show([{ ...item, due: { kind: 'date', date: '2025-03-10' } }]); view.rerender(<TodayScreen/>);
  expect(screen.getByText('Due: 2025-03-10')).toBeOnTheScreen(); expect(screen.queryByText('Due: 2025-03-09')).toBeNull();
});
it('preserves timing and existing mutation payloads while completion is pending', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
  show([{ ...item, due: { kind: 'date', date: '2025-03-09' } }]); render(<TodayScreen/>);
  act(() => { fireEvent.press(screen.getByRole('button', { name: 'Complete' })); });
  expect(screen.getByText('Due: 2025-03-09')).toBeOnTheScreen(); expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(save).toHaveBeenCalledWith({ path: '/tasks/1/complete', body: { completed: true } });
  await act(async () => { resolve(); });
});
