import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { taskOccursOn } from '@campusflow/domain';
import { taskFormDefaults, taskFormRequest, taskTimingLabel } from '../src/features/task-form';
import { TaskEditor } from '../src/features/task-editor';
import { useAction, useTasks } from '../src/features/queries';
import Tasks from '../app/(tabs)/tasks';
import { snapshotFixture } from './snapshot-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useTasks: jest.fn(), useAcademic: () => ({ data: [], isLoading: false }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const zone = 'America/Edmonton'; const task = { ...snapshotFixture().personalTasks[0], due: null, recurrence: null };
const values = { ...taskFormDefaults(null, zone), title: 'Read' }; const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useTasks).mockReturnValue({ data: [task], isLoading: false } as ReturnType<typeof useTasks>);
});
describe('task scheduling request boundary (ToR 7)', () => {
  it('keeps timed deadlines separate from scheduled work and converts both to UTC', () => {
    const request = taskFormRequest({ ...values, dueMode: 'instant', dueDate: '2025-03-08', dueTime: '17:00', scheduledMode: 'instant', scheduledDate: '2025-03-08', scheduledTime: '15:00' }, null, zone);
    expect(request.body).toMatchObject({ due: { kind: 'instant', at: '2025-03-09T00:00:00Z' }, scheduled: { kind: 'instant', at: '2025-03-08T22:00:00Z' } });
  });
  it('creates a recurring undated task using its scheduled calendar date', () => {
    expect(taskFormRequest({ ...values, scheduledMode: 'date', scheduledDate: '2025-03-08', recurrenceMode: 'daily', interval: '2' }, null, zone).body).toMatchObject({ due: null, scheduled: { kind: 'date', date: '2025-03-08' }, recurrence: { frequency: 'daily', interval: 2 } });
  });
  it('normalizes selected weekdays and follows the scheduled anchor through repeat weeks', () => {
    const body = taskFormRequest({ ...values, scheduledMode: 'date', scheduledDate: '2025-03-05', recurrenceMode: 'weekly', weekdays: [3, 1, 3], interval: '2' }, null, zone).body;
    expect(body.recurrence).toEqual({ frequency: 'weekly', interval: 2, weekdays: [1, 3] });
    const timing = { scheduled: body.scheduled ?? undefined, due: body.due ?? undefined, recurrence: body.recurrence ?? undefined };
    expect(taskOccursOn(timing, '2025-03-03', zone)).toBe(false);
    expect(taskOccursOn(timing, '2025-03-10', zone)).toBe(true);
    expect(taskOccursOn(timing, '2025-03-17', zone)).toBe(false);
    expect(taskOccursOn(timing, '2025-03-24', zone)).toBe(true);
  });
  it('sends explicit nulls to remove scheduling and recurrence together', () => {
    const existing = { ...task, scheduled: { kind: 'date' as const, date: '2025-03-08' }, recurrence: { frequency: 'daily' as const, interval: 1 } };
    expect(taskFormRequest({ ...taskFormDefaults(existing), scheduledMode: 'none', recurrenceMode: 'none' }, existing).body).toMatchObject({ scheduled: null, recurrence: null, due: null });
  });
  it('preserves exact existing instants and omits unchanged scheduling/recurrence', () => {
    const existing = { ...task, due: { kind: 'instant' as const, at: '2025-11-02T08:30:12.345Z' }, scheduled: { kind: 'instant' as const, at: '2025-11-02T07:30:12.345Z' }, recurrence: { frequency: 'daily' as const, interval: 1 } };
    const defaults = taskFormDefaults(existing, zone); expect(defaults).toMatchObject({ dueMode: 'existing', dueDate: '2025-11-02', dueTime: '01:30', scheduledMode: 'existing' });
    const body = taskFormRequest({ ...defaults, title: 'New title' }, existing, zone).body;
    expect(body.due).toEqual(existing.due); expect(body).not.toHaveProperty('scheduled'); expect(body).not.toHaveProperty('recurrence'); expect(body).not.toHaveProperty('reminder');
  });
  it.each(['', '0', '366', '1.5', 'text'])('rejects daily interval %s', interval => {
    expect(() => taskFormRequest({ ...values, scheduledMode: 'date', scheduledDate: '2025-03-08', recurrenceMode: 'daily', interval }, null)).toThrow();
  });
  it('does not rewrite an unchanged weekly rule because its property or weekday order differs', () => {
    const existing = { ...task, scheduled: { kind: 'date' as const, date: '2025-03-08' }, recurrence: { frequency: 'weekly' as const, weekdays: [5, 1], interval: 2 } };
    const body = taskFormRequest({ ...taskFormDefaults(existing, zone), title: 'New title' }, existing, zone).body;
    expect(body).not.toHaveProperty('recurrence'); expect(body).not.toHaveProperty('scheduled');
  });
  it('rejects weekly intervals beyond 52, missing weekdays, and anchorless recurrence', () => {
    for (const extra of [{ interval: '53', weekdays: [1] }, { interval: '1', weekdays: [] }]) {
      expect(() => taskFormRequest({ ...values, dueMode: 'date', dueDate: '2025-03-08', recurrenceMode: 'weekly', ...extra }, null)).toThrow();
    }
    expect(() => taskFormRequest({ ...values, recurrenceMode: 'daily' }, null)).toThrow();
  });
  it.each([['2025-03-09', '02:30'], ['2025-11-02', '01:30'], ['2025-03-08', '25:00']])('rejects invalid or ambiguous local timing %s %s', (date, time) => {
    expect(() => taskFormRequest({ ...values, dueMode: 'instant', dueDate: date, dueTime: time }, null, zone)).toThrow();
    expect(() => taskFormRequest({ ...values, scheduledMode: 'instant', scheduledDate: date, scheduledTime: time }, null, zone)).toThrow();
  });
  it('formats instants in the account zone while preserving calendar dates', () => {
    expect(taskTimingLabel({ kind: 'instant', at: '2025-03-09T00:00:00Z' }, zone)).toBe('2025-03-08 17:00 · America/Edmonton');
    expect(taskTimingLabel({ kind: 'date', date: '2025-03-09' }, zone)).toBe('2025-03-09');
  });
});
describe('task scheduling controls', () => {
  it('saves a selected-weekday task and timed deadline in the account zone', async () => {
    const close = jest.fn(); render(<TaskEditor task={null} timeZone={zone} onClose={close}/>);
    fireEvent.changeText(screen.getByLabelText('Title'), 'Read'); fireEvent.press(screen.getByRole('radio', { name: 'Timed deadline' }));
    fireEvent.changeText(screen.getByLabelText('Due date'), '2025-03-08'); fireEvent.changeText(screen.getByLabelText('Due time'), '17:00');
    fireEvent.press(screen.getByRole('radio', { name: 'Scheduled date only' })); fireEvent.changeText(screen.getByLabelText('Scheduled date'), '2025-03-05');
    fireEvent.press(screen.getByRole('radio', { name: 'Weekly' })); fireEvent.press(screen.getByRole('checkbox', { name: 'Monday' }));
    fireEvent.changeText(screen.getByLabelText('Repeat every (weeks)'), '2'); fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(close).toHaveBeenCalled()); expect(save).toHaveBeenCalledWith({ path: '/tasks', method: 'POST', body: { title: 'Read', description: null, priority: 'medium', category: 'personal',
      due: { kind: 'instant', at: '2025-03-09T00:00:00Z' }, scheduled: { kind: 'date', date: '2025-03-05' }, recurrence: { frequency: 'weekly', interval: 2, weekdays: [1] } } });
  });
  it('explains invalid DST input and permits correction', async () => {
    const close = jest.fn(); render(<TaskEditor task={task} timeZone={zone} onClose={close}/>);
    fireEvent.press(screen.getByRole('radio', { name: 'Scheduled date and time' })); fireEvent.changeText(screen.getByLabelText('Scheduled date'), '2025-03-09');
    fireEvent.changeText(screen.getByLabelText('Scheduled time'), '02:30'); fireEvent.press(screen.getByText('Save task')); await screen.findByText(/This time is missing/); expect(save).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Scheduled time'), '03:30'); fireEvent.press(screen.getByText('Save task')); await waitFor(() => expect(close).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ scheduled: { kind: 'instant', at: '2025-03-09T09:30:00Z' } }) }));
  });
  it('validates a weekly selection and interval before saving', async () => {
    render(<TaskEditor task={task} timeZone={zone} onClose={jest.fn()}/>); fireEvent.press(screen.getByRole('radio', { name: 'Scheduled date only' }));
    fireEvent.changeText(screen.getByLabelText('Scheduled date'), '2025-03-08'); fireEvent.press(screen.getByRole('radio', { name: 'Weekly' })); fireEvent.press(screen.getByText('Save task'));
    await screen.findByText('Choose at least one weekday.'); fireEvent.press(screen.getByRole('checkbox', { name: 'Monday' }));
    fireEvent.changeText(screen.getByLabelText('Repeat every (weeks)'), '53'); fireEvent.press(screen.getByText('Save task')); await screen.findByText('Choose a repeat interval from 1 to 52.'); expect(save).not.toHaveBeenCalled();
  });
  it('loads current schedules and can explicitly remove their repeat rule', async () => {
    const existing = { ...task, scheduled: { kind: 'date' as const, date: '2025-03-08' }, recurrence: { frequency: 'weekly' as const, interval: 2, weekdays: [1, 5] } };
    const close = jest.fn(); render(<TaskEditor task={existing} timeZone={zone} onClose={close}/>);
    expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue('2025-03-08'); expect(screen.getByRole('checkbox', { name: 'Friday' })).toBeChecked();
    fireEvent.press(screen.getByRole('radio', { name: 'Does not repeat' })); fireEvent.press(screen.getByRole('radio', { name: 'Not scheduled' }));
    fireEvent.press(screen.getByText('Save task')); await waitFor(() => expect(close).toHaveBeenCalled()); expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ scheduled: null, recurrence: null }) }));
  });
  it('retains timed scheduling and weekday input after a failed save', async () => {
    save.mockRejectedValueOnce(new Error('Offline')); render(<TaskEditor task={task} timeZone={zone} onClose={jest.fn()}/>);
    fireEvent.press(screen.getByRole('radio', { name: 'Scheduled date and time' })); fireEvent.changeText(screen.getByLabelText('Scheduled date'), '2025-03-08'); fireEvent.changeText(screen.getByLabelText('Scheduled time'), '15:00');
    fireEvent.press(screen.getByRole('radio', { name: 'Weekly' })); fireEvent.press(screen.getByRole('checkbox', { name: 'Saturday' })); fireEvent.press(screen.getByText('Save task')); await screen.findByText('Offline');
    expect(screen.getByLabelText('Scheduled time')).toHaveDisplayValue('15:00'); expect(screen.getByRole('checkbox', { name: 'Saturday' })).toBeChecked();
    fireEvent.press(screen.getByText('Save task')); await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });
  it('passes the account zone to the editor and shows the stored schedule', async () => {
    jest.mocked(useTasks).mockReturnValue({ data: [{ ...task, scheduled: { kind: 'instant', at: '2025-03-09T00:00:00Z' }, recurrence: { frequency: 'weekly', interval: 2, weekdays: [1, 5] } }], isLoading: false } as ReturnType<typeof useTasks>);
    render(<Tasks/>); expect(screen.getByText('Scheduled: 2025-03-08 17:00 · America/Edmonton')).toBeOnTheScreen(); expect(screen.getByText(/Mon, Fri/)).toBeOnTheScreen();
    await act(async () => { fireEvent.press(screen.getByText('Edit')); }); expect(screen.getByText(/Dates and times follow/)).toHaveTextContent(/America\/Edmonton/);
    expect(screen.getByText(/Current schedule:/)).toHaveTextContent(/17:00/);
  });
});
