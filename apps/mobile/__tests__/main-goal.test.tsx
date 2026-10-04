import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Tasks from '../app/(tabs)/tasks';
import { useAcademic, useAction, useTasks } from '../src/features/queries';
import { useTodayClock } from '../src/features/today-clock';
import type { AcademicItem, PersonalTask } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

jest.mock('../src/features/queries', () => ({ useAcademic: jest.fn(), useAction: jest.fn(), useTasks: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: jest.fn() }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const date = '2025-03-09';
const task: PersonalTask = { ...snapshotFixture().personalTasks[0], title: 'Undated reading', due: null, recurrence: null };
const academic: AcademicItem = { id: '50000000-0000-4000-8000-000000000001', courseId: null, title: 'Essay', kind: 'assignment',
  due: null, submissionState: 'unsubmitted', source: 'fixture', externalId: 'essay', mainGoalDate: null, updatedAt: snapshotFixture().capturedAt };
const save = jest.fn();
function show(tasks: PersonalTask[], academics: AcademicItem[] = []) {
  jest.mocked(useTasks).mockReturnValue({ data: tasks, isLoading: false } as ReturnType<typeof useTasks>);
  jest.mocked(useAcademic).mockReturnValue({ data: academics, isLoading: false } as ReturnType<typeof useAcademic>);
}
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useTodayClock).mockReturnValue({ date, resumeCount: 0 }); show([task]);
});

describe('Main Goal selection (ToR 6)', () => {
  it('selects an undated task for the account day without changing its deadline', async () => {
    render(<Tasks/>); await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Make Main Goal today' })); });
    await waitFor(() => expect(save).toHaveBeenCalledWith({ path: `/tasks/${task.id}/main-goal`, body: { date } }));
    expect(useTodayClock).toHaveBeenCalledWith('America/Edmonton');
    expect(screen.getByText(/No deadline/)).toBeOnTheScreen();
    expect(screen.queryByText('★ MAIN GOAL TODAY')).toBeNull();
  });
  it('uses PATCH for academic work and supports clearing the selection', async () => {
    show([], [academic]); const view = render(<Tasks/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Make Main Goal today' })); });
    await waitFor(() => expect(save).toHaveBeenCalledWith({ path: `/academic-items/${academic.id}/main-goal`, method: 'PATCH', body: { date } }));
    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
    show([], [{ ...academic, mainGoalDate: date }]); view.rerender(<Tasks/>);
    expect(screen.getByText('★ MAIN GOAL TODAY')).toBeOnTheScreen();
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Remove Main Goal' })); });
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ path: `/academic-items/${academic.id}/main-goal`, method: 'PATCH', body: { date: null } }));
  });
  it('can remove a completed personal task selection', async () => {
    show([{ ...task, mainGoalDate: date, completedAt: '2025-03-09T15:00:00Z' }]); render(<Tasks/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Remove Main Goal' })); });
    await waitFor(() => expect(save).toHaveBeenCalledWith({ path: `/tasks/${task.id}/main-goal`, body: { date: null } }));
  });
  it('keeps failed selection unchanged and supports retry', async () => {
    save.mockRejectedValueOnce(new Error('Network unavailable')); render(<Tasks/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Make Main Goal today' })); });
    await screen.findByText('Network unavailable');
    expect(screen.queryByText('★ MAIN GOAL TODAY')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Make Main Goal today' })); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull()); expect(save).toHaveBeenCalledTimes(2);
  });
  it('guards repeated selection and disables unrelated writes while pending', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); render(<Tasks/>);
    const select = screen.getByRole('button', { name: 'Make Main Goal today' });
    act(() => { fireEvent.press(select); fireEvent.press(select); fireEvent.press(screen.getByRole('button', { name: 'Complete' })); });
    expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
    await act(async () => { resolve(); }); expect(screen.getByRole('button', { name: 'Make Main Goal today' })).toBeEnabled();
  });
  it('only permits a recurring task scheduled for the selected account day', () => {
    const onDay = { ...task, title: 'Daily task', due: { kind: 'date' as const, date: '2025-03-08' }, recurrence: { frequency: 'daily' as const, interval: 1 } };
    const offDay = { ...onDay, id: '20000000-0000-4000-8000-000000000002', title: 'Monday task', recurrence: { frequency: 'weekly' as const, weekdays: [1], interval: 1 } };
    show([onDay, offDay]); render(<Tasks/>);
    expect(screen.getAllByRole('button', { name: 'Make Main Goal today' })).toHaveLength(1);
  });
  it('does not offer new selections for completed, submitted or graded work', () => {
    show([{ ...task, completedAt: '2025-03-09T15:00:00Z' }], [
      { ...academic, submissionState: 'submitted' }, { ...academic, id: '50000000-0000-4000-8000-000000000002', submissionState: 'graded' },
    ]); render(<Tasks/>); expect(screen.queryByRole('button', { name: 'Make Main Goal today' })).toBeNull();
  });
  it('renders only the refreshed server selection when replacing a Main Goal', async () => {
    show([{ ...task, mainGoalDate: date }], [academic]); const view = render(<Tasks/>);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Make Main Goal today' })); });
    expect(save).toHaveBeenCalledWith({ path: `/academic-items/${academic.id}/main-goal`, method: 'PATCH', body: { date } });
    expect(screen.queryByText('Saving…')).toBeNull();
    expect(screen.getAllByText('★ MAIN GOAL TODAY')).toHaveLength(1);
    show([task], [{ ...academic, mainGoalDate: date }]); view.rerender(<Tasks/>);
    expect(screen.getAllByText('★ MAIN GOAL TODAY')).toHaveLength(1);
  });
});
