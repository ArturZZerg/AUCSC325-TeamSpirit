import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EventReminderEditor } from '../src/features/event-reminder-editor';
import { eventReminderDefaults, eventReminderRequest } from '../src/features/event-reminder-form';
import { useAction, useEvents } from '../src/features/queries';
import Campus from '../app/(tabs)/campus';
import { eventFixture } from './event-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useEvents: jest.fn() }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const event = eventFixture(); const zone = 'America/Edmonton'; const save = jest.fn(); const refresh = jest.fn();
const values = { mode: 'instant' as const, date: '2025-03-08', time: '17:00' };
const expected = { path: `/events/${event.id}/saved`, method: 'PATCH', body: { reminder: { kind: 'instant' as const, at: '2025-03-09T00:00:00Z' } } };
const eventsQuery = (data: ReturnType<typeof eventFixture>[] | undefined) => ({ data, isLoading: false, refetch: refresh, isFetching: false }) as unknown as ReturnType<typeof useEvents>;
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2025-03-08T18:00:00Z')); jest.clearAllMocks(); save.mockReset().mockResolvedValue({}); refresh.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useEvents).mockReturnValue(eventsQuery([event]));
});
afterEach(() => { jest.useRealTimers(); });
const show = (selected = event, close = jest.fn()) => render(<EventReminderEditor event={selected} timeZone={zone} onClose={close}/>);
function fill() {
  fireEvent.press(screen.getByRole('radio', { name: 'Choose date and time' }));
  fireEvent.changeText(screen.getByLabelText('Reminder date'), values.date); fireEvent.changeText(screen.getByLabelText('Reminder time'), values.time);
}
describe('saved event reminder boundary (ToR 11, 13)', () => {
  it('sends a reminder-only PATCH in the account zone, preserving event and plan state', () => { expect(eventReminderRequest(values, event, zone)).toEqual(expected); });
  it('removes a reminder without unsaving or changing plan inclusion', () => { expect(eventReminderRequest({ ...values, mode: 'none' }, event, zone)).toEqual({ ...expected, body: { reminder: null } }); });
  it('refuses edits for unsaved events and unknown cached configuration', () => {
    for (const unknown of [{ ...event, saved: false }, { ...event, savedReminder: undefined }]) {
      expect(() => eventReminderRequest(values, unknown, zone)).toThrow(/refresh reminder details/); expect(() => eventReminderDefaults(unknown, zone)).toThrow();
    }
  });
  it('preserves original precision and repeated-hour instants', () => {
    const existing = { ...event, savedReminder: { kind: 'instant' as const, at: '2025-11-02T08:30:12.345Z' } };
    expect(eventReminderRequest(eventReminderDefaults(existing, zone), existing, zone).body).toEqual({ reminder: existing.savedReminder });
  });
  it('requires a chosen time for date-only configuration', () => {
    const existing = { ...event, savedReminder: { kind: 'date' as const, date: '2025-03-09' } };
    expect(eventReminderDefaults(existing, zone)).toEqual({ mode: 'instant', date: '2025-03-09', time: '' }); expect(() => eventReminderRequest(eventReminderDefaults(existing, zone), existing, zone)).toThrow();
  });
});
describe('event reminder controls', () => {
  it('saves a chosen account-local time and closes only after confirmation', async () => {
    const close = jest.fn(); show(event, close); fill(); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).toHaveBeenCalledWith(expected);
  });
  it('rejects expired input and permits correction', async () => {
    show(); fill(); fireEvent.changeText(screen.getByLabelText('Reminder time'), '11:00'); fireEvent.press(screen.getByText('Save reminder')); await screen.findByText(/time in the future/); expect(save).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Reminder time'), '17:00'); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
  it('preserves failed drafts for retry', async () => {
    const close = jest.fn(); save.mockRejectedValueOnce(new Error('Offline')); show(event, close); fill(); fireEvent.press(screen.getByText('Save reminder')); await screen.findByText('Offline');
    expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Reminder time')).toHaveDisplayValue('17:00');
    fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
  it('blocks rapid repeated saves and dismissal while pending', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); const close = jest.fn(); show(event, close); fill();
    act(() => { const button = screen.getByText('Save reminder'); fireEvent.press(button); fireEvent.press(button); }); await screen.findByText('Saving…');
    fireEvent.press(screen.getByText('Cancel')); expect(close).not.toHaveBeenCalled(); expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); }); expect(close).toHaveBeenCalledTimes(1);
  });
  it('keeps unchanged intent without writing and removes explicit configuration when requested', async () => {
    const close = jest.fn(); const view = show({ ...event, savedReminder: expected.body.reminder }, close); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).not.toHaveBeenCalled();
    view.unmount(); show({ ...event, savedReminder: expected.body.reminder }); fireEvent.press(screen.getByRole('radio', { name: 'No reminder' })); fireEvent.press(screen.getByText('Save reminder'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...expected, body: { reminder: null } }));
  });
});
describe('Campus saved controls', () => {
  it('opens reminders in the account zone and displays only refreshed server values', async () => {
    const view = render(<Campus/>); expect(screen.getByText('2025-03-08 17:00 · America/Edmonton · Library')).toBeOnTheScreen(); fireEvent.press(screen.getByText('Set reminder'));
    expect(screen.getByText(/One reminder at/)).toHaveTextContent(/America\/Edmonton/); fill(); fireEvent.press(screen.getByText('Save reminder')); await waitFor(() => expect(screen.queryByText('Event reminder')).toBeNull());
    expect(screen.queryByText(/^Reminder:/)).toBeNull(); jest.mocked(useEvents).mockReturnValue(eventsQuery([{ ...event, savedReminder: expected.body.reminder }]));
    view.rerender(<Campus/>); expect(screen.getByText('Reminder: 2025-03-08 17:00 · America/Edmonton')).toBeOnTheScreen(); expect(screen.getByText('Edit reminder')).toBeOnTheScreen();
  });
  it('requires saving before offering reminder controls', async () => {
    jest.mocked(useEvents).mockReturnValue(eventsQuery([{ ...event, saved: false, includedInPlan: false }])); render(<Campus/>);
    expect(screen.queryByText('Set reminder')).toBeNull(); await act(async () => { fireEvent.press(screen.getByText('Save event')); });
    expect(save).toHaveBeenCalledWith({ path: expected.path, method: 'PUT', body: { includedInPlan: false } });
  });
  it('keeps legacy reminder details unavailable until an explicit refresh', async () => {
    jest.mocked(useEvents).mockReturnValue(eventsQuery([{ ...event, savedReminder: undefined }])); render(<Campus/>);
    expect(screen.getByText(/Reminder details unavailable/)).toBeOnTheScreen(); expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled();
    await act(async () => { fireEvent.press(screen.getByText('Refresh events')); }); expect(refresh).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
  });
  it('does not invent saved status or an empty result for missing cache', () => {
    const view = render(<Campus/>); jest.mocked(useEvents).mockReturnValue(eventsQuery([{ ...event, saved: undefined, includedInPlan: undefined }])); view.rerender(<Campus/>);
    expect(screen.getByText(/Saved status unavailable/)).toBeOnTheScreen(); expect(screen.getByRole('button', { name: 'Save event' })).toBeDisabled();
    jest.mocked(useEvents).mockReturnValue(eventsQuery(undefined)); view.rerender(<Campus/>); expect(screen.queryByText(/No events match/)).toBeNull();
  });
  it('preserves reminder configuration on plan-only updates and reports failed unsave for retry', async () => {
    render(<Campus/>); await act(async () => { fireEvent.press(screen.getByText('In my plan')); }); expect(save).toHaveBeenCalledWith({ path: expected.path, method: 'PATCH', body: { includedInPlan: false } });
    save.mockRejectedValueOnce(new Error('Remove failed')); await act(async () => { fireEvent.press(screen.getByText('Remove saved')); }); expect(screen.getByText('Remove failed')).toBeOnTheScreen();
    await act(async () => { fireEvent.press(screen.getByText('Remove saved')); }); expect(save).toHaveBeenLastCalledWith({ path: expected.path, method: 'DELETE' });
  });
  it('guards repeated save/unsave taps and disables reminder entry until settled', async () => {
    let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); render(<Campus/>);
    act(() => { const button = screen.getByText('Remove saved'); fireEvent.press(button); fireEvent.press(button); }); expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled(); await act(async () => { resolve(); }); expect(screen.getByRole('button', { name: 'Set reminder' })).toBeEnabled();
  });
  it('filters readable cached events without changing saved configuration', () => {
    render(<Campus/>); fireEvent.changeText(screen.getByLabelText('Filter events'), 'career'); expect(screen.queryByText(event.title)).toBeNull(); expect(screen.getByText(/No events match/)).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Filter events'), 'club'); expect(screen.getByText(event.title)).toBeOnTheScreen(); expect(save).not.toHaveBeenCalled();
  });
});
