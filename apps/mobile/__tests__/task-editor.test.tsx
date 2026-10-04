import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TaskEditor } from '../src/features/task-editor';
import Tasks from '../app/(tabs)/tasks';
import { useAction, useTasks } from '../src/features/queries';
import type { PersonalTask } from '../src/lib/types';

jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useTasks: jest.fn(), useAcademic: () => ({ data: [], isLoading: false }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const task: PersonalTask = {
  id: '10000000-0000-4000-8000-000000000001', title: 'Buy groceries', description: 'Milk', priority: 'high', category: 'personal',
  due: { kind: 'date', date: '2026-10-03' }, scheduled: null, recurrence: null, reminder: null, estimatedMinutes: null,
  completedAt: null, snoozedUntil: null, mainGoalDate: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  save.mockReset().mockResolvedValue(task);
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useTasks).mockReturnValue({ data: [task], isLoading: false } as ReturnType<typeof useTasks>);
});

describe('task forms and actions (ToR 7)', () => {
  it('shows title/date validation and does not submit invalid input', async () => {
    render(<TaskEditor task={null} onClose={jest.fn()}/>);
    fireEvent.press(screen.getByText('Save task'));
    await screen.findByText('Enter a title.');
    fireEvent.changeText(screen.getByLabelText('Title'), 'Task');
    fireEvent.press(screen.getByRole('radio', { name: 'Date only' }));
    fireEvent.changeText(screen.getByLabelText('Due date'), '2026-02-30');
    fireEvent.press(screen.getByText('Save task'));
    await screen.findByText('Enter a valid date as YYYY-MM-DD.');
    expect(save).not.toHaveBeenCalled();
  });

  it('saves explicit clearing and selected category/priority', async () => {
    const close = jest.fn();
    render(<TaskEditor task={task} onClose={close}/>);
    expect(screen.getByLabelText('Title')).toHaveDisplayValue(task.title);
    fireEvent.changeText(screen.getByLabelText('Description'), '');
    fireEvent.press(screen.getByRole('radio', { name: 'No deadline' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Work' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Low' }));
    fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ path: `/tasks/${task.id}`, method: 'PATCH', body: { title: task.title, description: null, due: null, category: 'work', priority: 'low' } });
  });

  it('retains form input and shows a failed save with a working retry', async () => {
    save.mockRejectedValueOnce(new Error('Network unavailable'));
    const close = jest.fn();
    render(<TaskEditor task={null} onClose={close}/>);
    fireEvent.changeText(screen.getByLabelText('Title'), 'Keep this draft');
    fireEvent.press(screen.getByText('Save task'));
    await screen.findByText('Network unavailable');
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Keep this draft');
    expect(close).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('prevents repeat submission and dismissal while saving', async () => {
    let resolve!: () => void;
    save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    const close = jest.fn();
    render(<TaskEditor task={task} onClose={close}/>);
    fireEvent.press(screen.getByText('Save task'));
    await screen.findByText('Saving…');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.press(screen.getByText('Saving…'));
    fireEvent.press(screen.getByText('Cancel'));
    expect(close).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('starts each opened editor with that task and discards cancelled drafts', async () => {
    const other = { ...task, id: '10000000-0000-4000-8000-000000000002', title: 'Second task' };
    jest.mocked(useTasks).mockReturnValue({ data: [task, other], isLoading: false } as ReturnType<typeof useTasks>);
    render(<Tasks/>);
    fireEvent.press(screen.getAllByText('Edit')[0]);
    expect(screen.getByLabelText('Title')).toHaveDisplayValue(task.title);
    fireEvent.changeText(screen.getByLabelText('Title'), 'Cancelled draft');
    fireEvent.press(screen.getByText('Cancel'));
    fireEvent.press(screen.getAllByText('Edit')[1]);
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Second task');
    fireEvent.press(screen.getByText('Cancel'));
    fireEvent.press(screen.getByText('Add task'));
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('');
    expect(save).not.toHaveBeenCalled();
  });

  it('requires delete confirmation and keeps the task visible on failure', async () => {
    render(<Tasks/>);
    fireEvent.press(screen.getByText('Delete'));
    expect(save).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Keep task'));
    expect(save).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Delete'));
    save.mockRejectedValueOnce(new Error('Delete failed'));
    fireEvent.press(screen.getByText('Delete task'));
    await screen.findByText('Delete failed');
    expect(screen.getByText('Delete task?')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Delete task'));
    await waitFor(() => expect(screen.queryByText('Delete task?')).toBeNull());
    expect(save).toHaveBeenLastCalledWith({ path: `/tasks/${task.id}`, method: 'DELETE' });
  });

  it('exposes completion failure and allows undoing one-time completion', async () => {
    jest.mocked(useTasks).mockReturnValue({ data: [{ ...task, completedAt: '2026-10-03T12:00:00Z' }], isLoading: false } as ReturnType<typeof useTasks>);
    save.mockRejectedValueOnce(new Error('Completion failed'));
    render(<Tasks/>);
    fireEvent.press(screen.getByText('Undo completion'));
    await screen.findByText('Completion failed');
    expect(save).toHaveBeenCalledWith({ path: `/tasks/${task.id}/complete`, body: { completed: false } });
  });
});
