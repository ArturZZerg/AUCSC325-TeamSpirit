import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { taskFormDefaults, taskFormRequest } from '../src/features/task-form';
import { TaskEditor } from '../src/features/task-editor';
import Tasks from '../app/(tabs)/tasks';
import { useAction, useTasks } from '../src/features/queries';
import { snapshotFixture } from './snapshot-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useTasks: jest.fn(), useAcademic: () => ({ data: [], isLoading: false }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'UTC' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const task = { ...snapshotFixture().personalTasks[0], estimatedMinutes: 30 }; const save = jest.fn();
const label = 'Estimated minutes (optional)';
const press = async () => { await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save task' })); }); };
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useTasks).mockReturnValue({ data: [task], isLoading: false } as ReturnType<typeof useTasks>);
});
describe('optional task duration (ToR 3.2, 7)', () => {
  it.each(['1', '1440', ' 45 '])('creates a duration of %s minutes', estimatedMinutes => {
    const request = taskFormRequest({ ...taskFormDefaults(null), title: 'Read', estimatedMinutes }, null);
    expect(request.body.estimatedMinutes).toBe(Number(estimatedMinutes));
  });
  it.each(['0', '-1', '1441', '1.5', 'text', '1e3', '0x10', 'Infinity'])('rejects invalid duration %s before a request', estimatedMinutes => {
    expect(() => taskFormRequest({ ...taskFormDefaults(task), estimatedMinutes }, task)).toThrow(/Enter whole minutes/);
  });
  it('omits unchanged estimates, including equivalent numeric text, and clears an existing estimate explicitly', () => {
    expect(taskFormDefaults(task).estimatedMinutes).toBe('30');
    expect(taskFormRequest({ ...taskFormDefaults(task), title: 'New title', estimatedMinutes: '030' }, task).body).not.toHaveProperty('estimatedMinutes');
    expect(taskFormRequest({ ...taskFormDefaults(task), estimatedMinutes: ' ' }, task).body).toMatchObject({ estimatedMinutes: null });
    expect(taskFormRequest({ ...taskFormDefaults(null), title: 'No estimate' }, null).body).not.toHaveProperty('estimatedMinutes');
  });
  it('validates the field, permits correction, and sends only intended editable fields', async () => {
    const close = jest.fn(); render(<TaskEditor task={task} onClose={close}/>);
    expect(screen.getByLabelText(label)).toHaveDisplayValue('30');
    fireEvent.changeText(screen.getByLabelText(label), '1441'); await press();
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter whole minutes/); expect(save).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText(label), '45'); await press();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ path: `/tasks/${task.id}`, method: 'PATCH', body: expect.objectContaining({ estimatedMinutes: 45 }) }));
    const body = save.mock.calls[0][0].body;
    for (const key of ['reminder', 'scheduled', 'recurrence', 'completedAt', 'snoozedUntil', 'mainGoalDate']) expect(body).not.toHaveProperty(key);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('allows removing an estimate in the editor', async () => {
    render(<TaskEditor task={task} onClose={jest.fn()}/>); fireEvent.changeText(screen.getByLabelText(label), ''); await press();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ estimatedMinutes: null }) }));
  });
  it('retains duration after a failed write and retries the same value', async () => {
    save.mockRejectedValueOnce(new Error('Offline')); const close = jest.fn(); render(<TaskEditor task={null} onClose={close}/>);
    fireEvent.changeText(screen.getByLabelText('Title'), 'Read'); fireEvent.changeText(screen.getByLabelText(label), '25'); await press();
    expect(screen.getByLabelText(label)).toHaveDisplayValue('25'); expect(screen.getByText('Offline')).toBeOnTheScreen(); expect(close).not.toHaveBeenCalled();
    await press(); expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]); expect(close).toHaveBeenCalledTimes(1);
  });
  it('disables duration input during save and guards rapid taps', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    render(<TaskEditor task={task} onClose={jest.fn()}/>);
    await act(async () => { const button = screen.getByRole('button', { name: 'Save task' }); fireEvent.press(button); fireEvent.press(button); });
    expect(screen.getByLabelText(label)).toHaveProp('editable', false); expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
  });
  it('shows refreshed estimates and hides removed estimates in task cards', () => {
    const view = render(<Tasks/>); expect(screen.getByText('Estimated duration: 30 min')).toBeOnTheScreen();
    jest.mocked(useTasks).mockReturnValue({ data: [{ ...task, estimatedMinutes: 60 }], isLoading: false } as ReturnType<typeof useTasks>);
    view.rerender(<Tasks/>); expect(screen.getByText('Estimated duration: 60 min')).toBeOnTheScreen();
    jest.mocked(useTasks).mockReturnValue({ data: [{ ...task, estimatedMinutes: null }], isLoading: false } as ReturnType<typeof useTasks>);
    view.rerender(<Tasks/>); expect(screen.queryByText(/Estimated duration:/)).toBeNull();
  });
});
