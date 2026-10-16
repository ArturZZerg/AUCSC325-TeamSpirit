import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TodayScreen from '../app/(tabs)/today';
import { useAction, useToday } from '../src/features/queries';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { push: jest.fn() } }));
jest.mock('../src/features/day-agenda', () => ({ DayAgenda: () => null }));
jest.mock('../src/features/focus-recovery-card', () => ({ FocusRecoveryCard: () => null }));
jest.mock('../src/features/queries', () => ({ useTasks: () => ({ data: undefined }), useAcademic: () => ({ data: undefined }), useCourses: () => ({ data: undefined }), useAction: jest.fn(), useToday: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const save = jest.fn(), date = '2026-11-01';
function day(selected = date, overrides = {}) {
  jest.mocked(useToday).mockReturnValue({ date: selected, timeZone: 'America/Denver', isLoading: false,
    isRefetching: false, refetch: jest.fn(), data: { items: [], upcoming: [], campusEvents: [],
      sourceStatus: { availability: 'notConnected' } }, ...overrides } as unknown as ReturnType<typeof useToday>);
}
function capture(title = 'Read chapter five') {
  fireEvent.press(screen.getByRole('button', { name: 'Add a task to this day' }));
  fireEvent.changeText(screen.getByLabelText('Title'), title);
}
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({}); day();
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});

describe('Today task capture (ToR 4, 7, 19)', () => {
  it('opens one draft on repeated capture presses and writes only once after explicit Save', async () => {
    render(<TodayScreen/>);
    const captureButton = screen.getByRole('button', { name: 'Add a task to this day' });
    act(() => { fireEvent.press(captureButton); fireEvent.press(captureButton); });
    expect(screen.getAllByText('New task')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Add a task to this day' })).toBeNull();
    expect(save).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Title'), 'Read chapter five');
    fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(screen.queryByText('New task')).toBeNull());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].body.scheduled).toEqual({ kind: 'date', date });
  });

  it('saves work on the displayed calendar day without inventing a deadline or timed instant', async () => {
    render(<TodayScreen/>); capture();
    expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue(date);
    expect(screen.getByRole('radio', { name: 'No deadline' })).toBeChecked();
    fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('New task')).toBeNull());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ path: '/tasks', method: 'POST', body: {
      title: 'Read chapter five', description: null, priority: 'medium', category: 'personal',
      due: null, scheduled: { kind: 'date', date },
    } });
  });

  it('keeps the opened day when the live day rolls over while typing', async () => {
    const view = render(<TodayScreen/>); capture(); day('2026-11-02'); view.rerender(<TodayScreen/>);
    expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue(date);
    fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].body.scheduled).toEqual({ kind: 'date', date });
  });

  it('lets a student choose separate work and deadline dates and an estimate', async () => {
    render(<TodayScreen/>); capture();
    fireEvent.changeText(screen.getByLabelText('Scheduled date'), '2026-11-03');
    fireEvent.press(screen.getByRole('radio', { name: 'Date only' }));
    fireEvent.changeText(screen.getByLabelText('Due date'), '2026-11-06');
    fireEvent.changeText(screen.getByLabelText('Estimated minutes (optional)'), '25');
    fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].body).toMatchObject({ scheduled: { kind: 'date', date: '2026-11-03' },
      due: { kind: 'date', date: '2026-11-06' }, estimatedMinutes: 25 });
  });

  it('cancels without writing and starts a fresh draft on the next displayed day', () => {
    const view = render(<TodayScreen/>); capture('Unsaved private draft');
    fireEvent.press(screen.getByText('Cancel')); expect(save).not.toHaveBeenCalled();
    day('2026-11-02'); view.rerender(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Add a task to this day' }));
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue('2026-11-02');
  });

  it('retains an offline failed draft for explicit retry without claiming a save', async () => {
    day(date, { error: new Error('Offline') }); save.mockRejectedValueOnce(new Error('Connect to save this task.'));
    render(<TodayScreen/>); capture(); fireEvent.press(screen.getByText('Save task'));
    await screen.findByText('Connect to save this task.');
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Read chapter five');
    expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue(date);
    fireEvent.press(screen.getByText('Save task'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('New task')).toBeNull());
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('blocks repeated saves and dismissal while the task write is pending', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    render(<TodayScreen/>); capture();
    act(() => { fireEvent.press(screen.getByText('Save task')); fireEvent.press(screen.getByText('Save task')); });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.press(screen.getByText('Cancel')); expect(screen.getByText('New task')).toBeOnTheScreen();
    await act(async () => { resolve(); });
    expect(screen.queryByText('New task')).toBeNull();
  });

  it('describes an unconfirmed network save without exposing the native fetch diagnostic', async () => {
    save.mockRejectedValueOnce(new TypeError('Network request failed'));
    render(<TodayScreen/>); capture(); fireEvent.press(screen.getByText('Save task'));
    await screen.findByText('Couldn’t confirm the save. Check your connection and saved tasks before retrying.');
    expect(screen.queryByText('Network request failed')).toBeNull();
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Read chapter five');
    expect(screen.getByRole('button', { name: 'Save task' })).toBeEnabled();
  });

  it('can open capture before any Today read succeeds and validates the title before writing', async () => {
    day(date, { data: undefined, isLoading: true }); render(<TodayScreen/>);
    fireEvent.press(screen.getByRole('button', { name: 'Add a task to this day' }));
    fireEvent.press(screen.getByText('Save task')); await screen.findByText('Enter a title.');
    expect(save).not.toHaveBeenCalled();
  });
});
