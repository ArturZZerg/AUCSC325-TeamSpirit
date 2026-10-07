import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import TodayScreen from '../app/(tabs)/today';
import { useAction, useToday } from '../src/features/queries';
import type { PlanItem, Today } from '../src/lib/types';

jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(), router: { push: jest.fn() } }));
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useToday: jest.fn() }));

const date = '2026-10-03';
const task: PlanItem = {
  key: 'personalTask:10000000-0000-4000-8000-000000000001', kind: 'personalTask',
  entityId: '10000000-0000-4000-8000-000000000001', occurrenceKey: null, title: 'Buy groceries',
  schedule: null, due: { kind: 'date', date }, state: 'today', isMainGoal: false,
  priority: 'medium', allowedActions: ['complete', 'snooze', 'open'],
};
const recurring: PlanItem = { ...task, key: `${task.key}:${date}`, occurrenceKey: date, title: 'Daily reading' };
const goal: PlanItem = {
  ...task, key: 'goal:20000000-0000-4000-8000-000000000001:2026-10-02', kind: 'goal',
  entityId: '20000000-0000-4000-8000-000000000001', title: 'Go for a walk',
  occurrenceKey: '2026-10-02', allowedActions: ['complete', 'skip', 'snooze', 'open'],
};
const mutate = jest.fn();
const refetch = jest.fn();
function plan(items: PlanItem[]): Today {
  return { date, timeZone: 'America/Edmonton', generatedAt: '2026-10-03T12:00:00Z',
    sourceStatus: { availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null },
    items, upcoming: [], campusEvents: [] };
}
function show(items: PlanItem[], overrides = {}) {
  jest.mocked(useToday).mockReturnValue({ date, timeZone: 'America/Edmonton', data: plan(items), isLoading: false, isRefetching: false, refetch, ...overrides } as unknown as ReturnType<typeof useToday>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mutate.mockReset().mockResolvedValue(undefined);
  refetch.mockReset().mockResolvedValue(undefined);
  jest.mocked(useLocalSearchParams).mockReturnValue({ date });
  jest.mocked(useAction).mockReturnValue({ mutateAsync: mutate, isPending: false } as unknown as ReturnType<typeof useAction>);
  show([task]);
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-03T18:00:00Z').getTime());
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Today occurrence controls (ToR 3.4, 4, 5, 7)', () => {
  it('opens the weekly planner from Today', () => {
    render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Plan your week' }));
    expect(router.push).toHaveBeenCalledWith('/planner');
  });
  it('uses the query account date for the header when no date is selected', () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    show([], { date: '2026-10-02' });
    render(<TodayScreen/>);
    expect(useToday).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('Friday, October 2')).toBeOnTheScreen();
  });

  it('shows timed campus events in the account timezone', () => {
    const data = { ...plan([]), campusEvents: [{ id: '30000000-0000-4000-8000-000000000001',
      title: 'Campus meetup', description: null, category: null, source: 'fixture', externalId: 'meetup',
      timing: { kind: 'timed' as const, startsAt: '2026-10-03T18:00:00Z', endsAt: null }, location: null, url: null }] };
    show([], { timeZone: 'Pacific/Honolulu', data });
    render(<TodayScreen/>);
    expect(useToday).toHaveBeenCalledWith(date);
    expect(screen.getByText(/^0?8:00.* · Campus$/)).toBeOnTheScreen();
  });

  it('completes a one-time task without sending an occurrence date', async () => {
    render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ path: `/tasks/${task.entityId}/complete`, body: { completed: true } }));
  });

  it.each([false, true])('uses the recurring occurrence identity for completion/undo (completed=%s)', async completed => {
    const occurrence = { ...recurring, state: completed ? 'completed' as const : 'today' as const,
      allowedActions: completed ? ['uncomplete' as const, 'open' as const] : recurring.allowedActions };
    show([occurrence]);
    render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: completed ? 'Undo completion' : 'Complete' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ path: `/tasks/${task.entityId}/complete`,
      body: { completed: !completed, occurrenceKey: recurring.occurrenceKey } }));
  });

  it('undoes one-time completion without an occurrence date', async () => {
    show([{ ...task, state: 'completed', allowedActions: ['uncomplete', 'open'] }]);
    render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Undo completion' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ path: `/tasks/${task.entityId}/complete`, body: { completed: false } }));
  });

  it.each([['Complete', 'completed'], ['Skip today', 'skipped']])('sends the goal occurrence in its own zone for %s', async (label, state) => {
    show([goal]);
    render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ path: `/goals/${goal.entityId}/complete`,
      body: { occurrenceKey: '2026-10-02', state } }));
  });

  it('requires a supplied goal occurrence instead of substituting the displayed date', async () => {
    show([{ ...goal, occurrenceKey: null }]);
    render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Complete' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Refresh your plan before changing this goal.')).toBeOnTheScreen();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('honors allowed actions and keeps academic/events and terminal goals read-only', () => {
    show([
      { ...task, allowedActions: ['open'] },
      { ...goal, state: 'completed', allowedActions: ['open'] },
      { ...goal, key: 'skipped-goal', state: 'skipped', allowedActions: ['open'] },
      { ...task, key: 'academic', kind: 'academic', state: 'submitted', title: 'Submitted essay', allowedActions: ['open'] },
      { ...task, key: 'event', kind: 'event', title: 'Campus event', allowedActions: ['open'] },
    ]);
    render(<TodayScreen/>);
    expect(screen.queryAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('Submitted essay')).toBeOnTheScreen();
    expect(screen.getByText('Campus event')).toBeOnTheScreen();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows an offline write failure, preserves the item state, and permits retry', async () => {
    mutate.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Complete' }));
    await screen.findByText('Network unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.getByText('today')).toBeOnTheScreen();
    expect(screen.getByText('Buy groceries')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled();
    fireEvent.press(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('shows a helpful fallback for non-Error rejections', async () => {
    mutate.mockRejectedValueOnce('offline');
    render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Complete' }));
    await screen.findByText('Could not save the change. Please try again.');
  });

  it('blocks repeated taps and other item actions until the request finishes', async () => {
    let resolve!: () => void;
    mutate.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    show([task, goal]);
    render(<TodayScreen/>);
    const complete = screen.getAllByRole('button', { name: 'Complete' })[0];
    const skip = screen.getByRole('button', { name: 'Skip today' });
    act(() => {
      fireEvent.press(complete);
      fireEvent.press(complete);
      fireEvent.press(skip);
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip today' })).toBeDisabled();
    expect(screen.getAllByText('today')).toHaveLength(2);
    await act(async () => { resolve(); });
    expect(screen.getByRole('button', { name: 'Skip today' })).toBeEnabled();
  });

  it('renders the refreshed server state after a successful action', async () => {
    let resolve!: () => void;
    mutate.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    const view = render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Complete' }));
    expect(screen.getByText('Saving…')).toBeOnTheScreen();
    await act(async () => { resolve(); });
    expect(screen.queryByText('Saving…')).toBeNull();
    // The screen itself never claims success before the API's refreshed plan.
    expect(screen.getByText('today')).toBeOnTheScreen();
    show([{ ...task, state: 'completed', allowedActions: ['uncomplete', 'open'] }]);
    view.rerender(<TodayScreen/>);
    expect(screen.getByText('completed')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Undo completion' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull();
  });

  it.each([task, recurring])('snoozes a task without changing its deadline or completion (occurrence=$occurrenceKey)', async item => {
    show([item]); render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Snooze 1 hour' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ path: `/tasks/${item.entityId}/snooze`,
      body: { until: '2026-10-03T19:00:00.000Z' } }));
    expect(screen.getByText('today')).toBeOnTheScreen();
    expect(item.due).toEqual(task.due);
  });

  it('snoozes a goal with its timezone-specific occurrence', async () => {
    show([goal]); render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Snooze 1 hour' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ path: `/goals/${goal.entityId}/snooze`,
      body: { until: '2026-10-03T19:00:00.000Z', occurrenceKey: '2026-10-02' } }));
  });

  it('refuses to invent a missing goal occurrence for snooze', async () => {
    show([{ ...goal, occurrenceKey: null }]); render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Snooze 1 hour' }));
    await screen.findByText('Refresh your plan before changing this goal.');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('rechecks the current day if midnight passes after rendering a selected plan', async () => {
    render(<TodayScreen/>);
    jest.mocked(Date.now).mockReturnValue(new Date('2026-10-04T06:00:00Z').getTime());
    fireEvent.press(screen.getByRole('button', { name: 'Snooze 1 hour' }));
    await screen.findByText('Open today’s plan before snoozing.');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('snoozes for an elapsed hour across the spring daylight-saving jump', async () => {
    jest.mocked(Date.now).mockReturnValue(new Date('2025-03-09T08:30:00Z').getTime());
    show([task], { date: '2025-03-09' }); render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Snooze 1 hour' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ path: `/tasks/${task.entityId}/snooze`,
      body: { until: '2025-03-09T09:30:00.000Z' } }));
  });

  it.each(['2026-10-02', '2026-10-04'])('hides time-relative snooze on selected date %s', selected => {
    show([task, goal], { date: selected }); render(<TodayScreen/>);
    expect(screen.queryByRole('button', { name: 'Snooze 1 hour' })).toBeNull();
  });

  it('does not claim an offline snooze succeeded and lets the user retry', async () => {
    mutate.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<TodayScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Snooze 1 hour' }));
    await screen.findByText('Network unavailable');
    expect(screen.getByText('today')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Snooze 1 hour' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('blocks repeated snooze taps and completion until the write finishes', async () => {
    let resolve!: () => void;
    mutate.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    render(<TodayScreen/>);
    const snooze = screen.getByRole('button', { name: 'Snooze 1 hour' });
    act(() => { fireEvent.press(snooze); fireEvent.press(snooze); fireEvent.press(screen.getByRole('button', { name: 'Complete' })); });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await act(async () => { resolve(); });
    expect(screen.getByRole('button', { name: 'Snooze 1 hour' })).toBeEnabled();
  });

  it('lets the user refresh a cached plan after a read failure', () => {
    show([task], { error: new Error('Offline') });
    render(<TodayScreen/>);
    expect(screen.getByText('Buy groceries')).toBeOnTheScreen();
    expect(screen.getByText('Couldn’t refresh. Showing saved information when available.')).toBeOnTheScreen();
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
  });
});
