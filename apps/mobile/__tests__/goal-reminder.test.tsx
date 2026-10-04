import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GoalReminderEditor } from '../src/features/goal-reminder-editor';
import { goalReminderDefaults, goalReminderRequest } from '../src/features/goal-reminder-form';
import { useAction, useGoals, useGoalHistory, useWellness } from '../src/features/queries';
import Wellness from '../app/(tabs)/wellness';
import { snapshotFixture } from './snapshot-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useGoals: jest.fn(), useGoalHistory: jest.fn(), useWellness: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-08', resumeCount: 0 }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const goal = snapshotFixture().goals[0]; const save = jest.fn(); const values = { mode: 'instant' as const, date: '2025-03-08', time: '17:00' };
const expected = { path: `/goals/${goal.id}`, method: 'PATCH', body: { reminder: { kind: 'instant' as const, at: '2025-03-09T03:00:00Z' } } };
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2025-03-08T18:00:00Z')); jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useGoals).mockReturnValue({ data: [goal], isLoading: false } as ReturnType<typeof useGoals>);
  jest.mocked(useGoalHistory).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useGoalHistory>);
  jest.mocked(useWellness).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useWellness>);
});
afterEach(() => { jest.useRealTimers(); });
const show = (selected = goal, close = jest.fn()) => render(<GoalReminderEditor goal={selected} onClose={close}/>);
function fill() {
  fireEvent.press(screen.getByRole('radio', { name: 'Choose date and time' }));
  fireEvent.changeText(screen.getByLabelText('Reminder date'), values.date); fireEvent.changeText(screen.getByLabelText('Reminder time'), values.time);
}
describe('goal reminder boundary (ToR 3.4, 13)', () => {
  it('converts using the goal timezone and sends only reminder configuration', () => { expect(goalReminderRequest(values, goal)).toEqual(expected); });
  it('removes configuration explicitly without changing pause or schedule', () => { expect(goalReminderRequest({ ...values, mode: 'none' }, { ...goal, pausedAt: goal.createdAt }).body).toEqual({ reminder: null }); });
  it('retains original instant precision in a repeated local hour', () => {
    const existing = { ...goal, timeZone: 'America/Edmonton', reminder: { kind: 'instant' as const, at: '2025-11-02T08:30:12.345Z' } };
    const defaults = goalReminderDefaults(existing); expect(defaults).toEqual({ mode: 'existing', date: '2025-11-02', time: '01:30' });
    expect(goalReminderRequest(defaults, existing).body).toEqual({ reminder: existing.reminder });
  });
  it.each([['2025-03-09', '02:30'], ['2025-11-02', '01:30']])('rejects ambiguous/missing goal-local timing %s %s', (date, time) => {
    expect(() => goalReminderRequest({ ...values, date, time }, { ...goal, timeZone: 'America/Edmonton' })).toThrow(/goal time zone/);
  });
  it('rejects expired input in the goal timezone', () => { expect(() => goalReminderRequest({ ...values, time: '08:00' }, goal)).toThrow(/future/); });
  it('requires a delivery time for date-only configuration', () => {
    const existing = { ...goal, reminder: { kind: 'date' as const, date: '2025-03-09' } };
    expect(goalReminderDefaults(existing)).toEqual({ mode: 'instant', date: '2025-03-09', time: '' }); expect(() => goalReminderRequest(goalReminderDefaults(existing), existing)).toThrow();
  });
});
describe('goal reminder controls', () => {
  it('uses the goal timezone and closes after server confirmation', async () => {
    const close = jest.fn(); show(goal, close); expect(screen.getByText(/One reminder at/)).toHaveTextContent(/Pacific\/Honolulu/);
    fill(); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).toHaveBeenCalledWith(expected);
  });
  it('explains paused delivery while allowing a configuration edit without resuming', async () => {
    show({ ...goal, pausedAt: goal.createdAt }); expect(screen.getByText(/Resume this goal/)).toBeOnTheScreen(); fill(); fireEvent.press(screen.getByText('Save reminder'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expected));
  });
  it('removes an existing reminder explicitly', async () => {
    show({ ...goal, reminder: expected.body.reminder }); fireEvent.press(screen.getByRole('radio', { name: 'No reminder' })); fireEvent.press(screen.getByText('Save reminder'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...expected, body: { reminder: null } }));
  });
  it('keeps unchanged configuration without replacing intent', async () => {
    const close = jest.fn(); show({ ...goal, reminder: expected.body.reminder }, close); fireEvent.press(screen.getByText('Save reminder'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).not.toHaveBeenCalled();
  });
  it('explains invalid goal-local DST timing and permits correction', async () => {
    show({ ...goal, timeZone: 'America/Edmonton' }); fill(); fireEvent.changeText(screen.getByLabelText('Reminder date'), '2025-03-09'); fireEvent.changeText(screen.getByLabelText('Reminder time'), '02:30');
    fireEvent.press(screen.getByText('Save reminder')); await screen.findByText(/occurs twice in your goal time zone/); expect(save).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Reminder time'), '03:30'); fireEvent.press(screen.getByText('Save reminder'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...expected, body: { reminder: { kind: 'instant', at: '2025-03-09T09:30:00Z' } } }));
  });
  it('preserves failed drafts and supports retry', async () => {
    const close = jest.fn(); save.mockRejectedValueOnce(new Error('Offline')); show(goal, close); fill(); fireEvent.press(screen.getByText('Save reminder')); await screen.findByText('Offline');
    expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Reminder time')).toHaveDisplayValue('17:00');
    fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).toHaveBeenCalledTimes(2);
  });
  it('guards rapid repeat saves and dismissal while pending', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); const close = jest.fn(); show(goal, close); fill();
    act(() => { const button = screen.getByText('Save reminder'); fireEvent.press(button); fireEvent.press(button); }); await screen.findByText('Saving…');
    expect(save).toHaveBeenCalledTimes(1); fireEvent.press(screen.getByText('Cancel')); expect(close).not.toHaveBeenCalled();
    await act(async () => { resolve(); }); expect(close).toHaveBeenCalledTimes(1);
  });
  it('opens from Wellness and displays only refreshed configuration, including paused status', async () => {
    const view = render(<Wellness/>); fireEvent.press(screen.getByText('Set reminder')); fill(); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(screen.queryByText('Goal reminder')).toBeNull());
    expect(screen.queryByText(/^Reminder:/)).toBeNull();
    jest.mocked(useGoals).mockReturnValue({ data: [{ ...goal, reminder: expected.body.reminder, pausedAt: goal.createdAt }], isLoading: false } as ReturnType<typeof useGoals>);
    view.rerender(<Wellness/>); expect(screen.getByText('Reminder: 2025-03-08 17:00 · Pacific/Honolulu · Inactive while paused')).toBeOnTheScreen();
    expect(screen.getByText('Edit reminder')).toBeOnTheScreen();
  });
  it('discards cancelled drafts when reopened', async () => {
    render(<Wellness/>); fireEvent.press(screen.getByText('Set reminder')); fill(); fireEvent.press(screen.getByText('Cancel'));
    fireEvent.press(screen.getByText('Set reminder')); expect(screen.getByRole('radio', { name: 'No reminder' })).toBeChecked(); expect(screen.queryByLabelText('Reminder time')).toBeNull(); expect(save).not.toHaveBeenCalled();
  });
});
