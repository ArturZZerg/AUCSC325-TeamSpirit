import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import Tasks from '../app/(tabs)/tasks';
import { filterPersonalTasks, defaultTaskFilters, useTaskFilters } from '../src/features/task-filters';
import { useAction, useTasks } from '../src/features/queries';
import type { PersonalTask } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useTasks: jest.fn(), useAcademic: () => ({ data: [], isLoading: false }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { id: 'account-one', timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const base = snapshotFixture().personalTasks[0];
const tasks: PersonalTask[] = [
  { ...base, title: 'Read chapter', description: 'Biology notes', category: 'university', recurrence: null },
  { ...base, id: '20000000-0000-4000-8000-000000000002', title: 'Groceries', description: null, category: 'personal', recurrence: null, completedAt: base.createdAt },
  { ...base, id: '20000000-0000-4000-8000-000000000003', title: 'Walk', description: 'Campus loop', category: 'health' },
];
const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useTasks).mockReturnValue({ data: tasks, isLoading: false } as ReturnType<typeof useTasks>);
});
describe('personal task filters (ToR 7, 10, 19)', () => {
  it('matches title and description case-insensitively and trims search whitespace', () => {
    expect(filterPersonalTasks(tasks, { ...defaultTaskFilters, search: '  READ ' })).toEqual([tasks[0]]);
    expect(filterPersonalTasks(tasks, { ...defaultTaskFilters, search: 'biology' })).toEqual([tasks[0]]);
    expect(filterPersonalTasks(tasks, { ...defaultTaskFilters, search: 'campus' })).toEqual([tasks[2]]);
  });
  it('combines category and completion filters without changing records or order', () => {
    expect(filterPersonalTasks(Object.freeze(tasks), { search: '', category: 'personal', completion: 'completed' })).toEqual([tasks[1]]);
    expect(filterPersonalTasks(tasks, { search: '', category: 'personal', completion: 'open' })).toEqual([]);
    expect(filterPersonalTasks(tasks, { ...defaultTaskFilters, completion: 'open' })).toEqual([tasks[0], tasks[2]]);
    expect(filterPersonalTasks(tasks, defaultTaskFilters)).toEqual(tasks);
  });
  it('handles absent descriptions, empty input and no matches', () => {
    expect(filterPersonalTasks(tasks, { ...defaultTaskFilters, search: 'not present' })).toEqual([]);
    expect(filterPersonalTasks([], defaultTaskFilters)).toEqual([]);
    expect(filterPersonalTasks(tasks, { ...defaultTaskFilters, search: ' ' })).toEqual(tasks);
  });
  it('resets private filter text and selections immediately on an account change', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useTaskFilters>, { account: string | undefined }>(({ account }) => useTaskFilters(account), { initialProps: { account: 'one' } });
    act(() => { result.current.update({ search: 'Private search', category: 'work', completion: 'completed' }); });
    rerender({ account: 'two' }); expect(result.current.filters).toEqual(defaultTaskFilters);
    rerender({ account: 'one' }); expect(result.current.filters).toEqual(defaultTaskFilters);
    rerender({ account: 'two' });
    act(() => { result.current.update({ search: 'Second search' }); }); expect(result.current.filters).toEqual({ ...defaultTaskFilters, search: 'Second search' });
    act(() => { result.current.reset(); }); expect(result.current.filters).toEqual(defaultTaskFilters);
    act(() => { result.current.update({ search: 'Private draft' }); }); rerender({ account: undefined }); expect(result.current.filters).toEqual(defaultTaskFilters);
  });
  it('combines UI controls, reports the result count and clears them together', () => {
    render(<Tasks/>); expect(screen.getByText('3 personal tasks')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Search personal tasks'), 'gro'); fireEvent.press(screen.getByRole('radio', { name: 'Personal' })); fireEvent.press(screen.getByRole('radio', { name: 'Completed tasks' }));
    expect(screen.getByText('Groceries')).toBeOnTheScreen(); expect(screen.queryByText('Read chapter')).toBeNull(); expect(screen.getByText('1 personal task')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Clear filters')); expect(screen.getByLabelText('Search personal tasks')).toHaveDisplayValue(''); expect(screen.getByText('3 personal tasks')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'All categories' })).toBeChecked(); expect(screen.getByRole('radio', { name: 'All tasks' })).toBeChecked(); expect(save).not.toHaveBeenCalled();
  });
  it('keeps search useful with cached tasks during an offline refresh failure', () => {
    jest.mocked(useTasks).mockReturnValue({ data: tasks, isLoading: false, error: new Error('Offline') } as ReturnType<typeof useTasks>);
    render(<Tasks/>); fireEvent.changeText(screen.getByLabelText('Search personal tasks'), 'biology'); expect(screen.getByText('Read chapter')).toBeOnTheScreen();
    expect(screen.queryByText('Groceries')).toBeNull(); expect(screen.getByText(/Couldn’t refresh/)).toBeOnTheScreen(); expect(save).not.toHaveBeenCalled();
  });
  it('shows a filter empty result only when the task list is available', () => {
    const view = render(<Tasks/>); fireEvent.changeText(screen.getByLabelText('Search personal tasks'), 'not found'); expect(screen.getByText('No personal tasks match your filters.')).toBeOnTheScreen();
    jest.mocked(useTasks).mockReturnValue({ data: undefined, isLoading: false, error: new Error('Offline') } as ReturnType<typeof useTasks>);
    view.rerender(<Tasks/>); expect(screen.queryByText('No personal tasks match your filters.')).toBeNull(); expect(screen.queryByText('0 personal tasks')).toBeNull();
  });
  it('updates results from refreshed data and keeps entity actions on the filtered task', async () => {
    const view = render(<Tasks/>); fireEvent.changeText(screen.getByLabelText('Search personal tasks'), 'groceries');
    await act(async () => { fireEvent.press(screen.getByText('Undo completion')); });
    expect(save).toHaveBeenCalledWith({ path: `/tasks/${tasks[1].id}/complete`, body: { completed: false } });
    jest.mocked(useTasks).mockReturnValue({ data: [{ ...tasks[1], title: 'Renamed task', completedAt: null }], isLoading: false } as ReturnType<typeof useTasks>);
    view.rerender(<Tasks/>); expect(screen.getByText('No personal tasks match your filters.')).toBeOnTheScreen();
  });
});
