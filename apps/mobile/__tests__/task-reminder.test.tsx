import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TaskReminderEditor } from '../src/features/task-reminder-editor';
import { taskReminderDefaults, taskReminderRequest } from '../src/features/task-reminder-form';
import { useAction, useTasks } from '../src/features/queries';
import Tasks from '../app/(tabs)/tasks';
import { snapshotFixture } from './snapshot-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useTasks: jest.fn(), useAcademic: () => ({ data: [], isLoading: false }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { id: 'account-one', timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const zone = 'America/Edmonton'; const task = snapshotFixture().personalTasks[0]; const save = jest.fn();
const values = { mode: 'instant' as const, date: '2025-03-08', time: '17:00' };
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2025-03-08T18:00:00Z')); jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useTasks).mockReturnValue({ data: [task], isLoading: false } as ReturnType<typeof useTasks>);
});
afterEach(() => { jest.useRealTimers(); });
describe('explicit task reminder boundary (ToR 7, 13)', () => {
  it('sends only the reminder field, converting account-local input to UTC', () => {
    expect(taskReminderRequest(values, task, zone)).toEqual({ path: `/tasks/${task.id}`, method: 'PATCH', body: { reminder: { kind: 'instant', at: '2025-03-09T00:00:00Z' } } });
  });
  it('removes a reminder with an explicit null', () => {
    expect(taskReminderRequest({ ...values, mode: 'none' }, task, zone).body).toEqual({ reminder: null });
  });
  it('retains an existing repeated-hour instant with its original precision', () => {
    const existing = { ...task, reminder: { kind: 'instant' as const, at: '2025-11-02T08:30:12.345Z' } };
    const defaults = taskReminderDefaults(existing, zone); expect(defaults).toEqual({ mode: 'existing', date: '2025-11-02', time: '01:30' });
    expect(taskReminderRequest(defaults, existing, zone).body).toEqual({ reminder: existing.reminder });
  });
  it('requires an explicit delivery time for a saved date-only configuration', () => {
    const existing = { ...task, reminder: { kind: 'date' as const, date: '2025-03-09' } };
    expect(taskReminderDefaults(existing, zone)).toEqual({ mode: 'instant', date: '2025-03-09', time: '' });
    expect(() => taskReminderRequest(taskReminderDefaults(existing, zone), existing, zone)).toThrow();
    expect(() => taskReminderRequest({ ...values, mode: 'existing' }, task, zone)).toThrow();
  });
  it.each([['2025-03-08', '11:00'], ['2025-03-07', '17:00'], ['2025-02-30', '17:00'], ['2025-03-08', '25:00'], ['2025-03-09', '02:30'], ['2025-11-02', '01:30']])('rejects expired, malformed or ambiguous input %s %s', (date, time) => {
    expect(() => taskReminderRequest({ ...values, date, time }, task, zone)).toThrow();
  });
});
const show = (selected = task, close = jest.fn()) => render(<TaskReminderEditor task={selected} timeZone={zone} onClose={close}/>);
function fill() {
  fireEvent.press(screen.getByRole('radio', { name: 'Choose date and time' }));
  fireEvent.changeText(screen.getByLabelText('Reminder date'), values.date); fireEvent.changeText(screen.getByLabelText('Reminder time'), values.time);
}
describe('task reminder controls', () => {
  it('saves a chosen time and closes after server confirmation', async () => {
    const close = jest.fn(); show(task, close); fill(); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(taskReminderRequest(values, task, zone));
  });
  it('explains expired input and permits correction', async () => {
    show(); fill(); fireEvent.changeText(screen.getByLabelText('Reminder time'), '11:00'); fireEvent.press(screen.getByText('Save reminder'));
    await screen.findByText('Choose a reminder time in the future.'); expect(save).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Reminder time'), '17:00'); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
  it('preserves a failed draft and supports retry', async () => {
    const close = jest.fn(); save.mockRejectedValueOnce(new Error('Offline')); show(task, close); fill(); fireEvent.press(screen.getByText('Save reminder')); await screen.findByText('Offline');
    expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Reminder time')).toHaveDisplayValue('17:00');
    fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).toHaveBeenCalledTimes(2);
  });
  it('guards rapid repeat saves and dismissal while pending', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); const close = jest.fn(); show(task, close); fill();
    act(() => { const button = screen.getByText('Save reminder'); fireEvent.press(button); fireEvent.press(button); }); await screen.findByText('Saving…');
    expect(screen.getByLabelText('Reminder time')).toHaveProp('editable', false); fireEvent.press(screen.getByText('Cancel')); expect(close).not.toHaveBeenCalled(); expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); }); expect(close).toHaveBeenCalledTimes(1);
  });
  it('removes existing configuration and explains completed-task behavior', async () => {
    const existing = { ...task, reminder: { kind: 'instant' as const, at: '2025-03-09T00:00:00Z' }, completedAt: task.createdAt };
    show(existing); expect(screen.getByText(/Undo completion to reactivate/)).toBeOnTheScreen(); fireEvent.press(screen.getByRole('radio', { name: 'No reminder' }));
    fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(save).toHaveBeenCalledWith({ path: `/tasks/${task.id}`, method: 'PATCH', body: { reminder: null } }));
  });
  it('keeps an unchanged instant without replacing its delivery intent', async () => {
    const existing = { ...task, reminder: { kind: 'instant' as const, at: '2025-11-02T08:30:12.345Z' } }; const close = jest.fn();
    show(existing, close); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).not.toHaveBeenCalled();
  });
  it('asks for a delivery time for saved date-only configuration', () => {
    show({ ...task, reminder: { kind: 'date', date: '2025-03-09' } }); expect(screen.getByText(/Choose a delivery time/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Reminder date')).toHaveDisplayValue('2025-03-09'); expect(screen.getByLabelText('Reminder time')).toHaveDisplayValue('');
  });
  it('opens from Tasks in the account zone and shows only refreshed reminder values', async () => {
    const view = render(<Tasks/>); fireEvent.press(screen.getByText('Set reminder')); expect(screen.getByText(/One reminder at/)).toHaveTextContent(/America\/Edmonton/);
    fill(); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(screen.queryByText('Task reminder')).toBeNull());
    expect(screen.queryByText(/^Reminder:/)).toBeNull();
    jest.mocked(useTasks).mockReturnValue({ data: [{ ...task, reminder: { kind: 'instant', at: '2025-03-09T00:00:00Z' } }], isLoading: false } as ReturnType<typeof useTasks>);
    view.rerender(<Tasks/>); expect(screen.getByText('Reminder: 2025-03-08 17:00 · America/Edmonton')).toBeOnTheScreen(); expect(screen.getByText('Edit reminder')).toBeOnTheScreen();
  });
});
