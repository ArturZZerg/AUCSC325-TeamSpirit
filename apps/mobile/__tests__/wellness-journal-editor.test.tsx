import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { WellnessJournalEditor } from '../src/features/wellness-journal-editor';
import type { useWellnessJournalAction } from '../src/features/queries';
import { api } from '../src/lib/api';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';
import { journalEntry, journalFixture, journalOwner } from './journal-fixture';
jest.mock('../src/lib/api', () => ({ api: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const owner: Session = { accessToken: 'journal-owner-token', expiresAt: '2030-01-01T00:00:00Z', user: {
  id: journalOwner, email: 'journal-fixture@example.test', displayName: 'Fixture', timeZone: 'America/Edmonton', createdAt: '2025-01-01T00:00:00Z',
} };
const save = jest.fn(), close = jest.fn(), saved = jest.fn(), cleanup = jest.fn();
const action = () => ({ mutateAsync: save, isPending: false, confirmSaved: cleanup }) as unknown as ReturnType<typeof useWellnessJournalAction>;
const open = (entry: typeof journalEntry | null = journalEntry) => render(<WellnessJournalEditor date={journalEntry.date} entry={entry} action={action()} onClose={close} onSaved={saved}/>);
const press = async (name: string) => { await act(async () => { fireEvent.press(screen.getByRole('button', { name })); }); };
beforeEach(() => {
  jest.clearAllMocks(); jest.useRealTimers(); save.mockReset(); cleanup.mockResolvedValue(undefined); jest.mocked(api).mockReset();
  useSessionStore.setState({ session: owner, ready: true });
  save.mockImplementation(async input => input.method === 'DELETE' ? { deleted: true } : { ...journalEntry,
    mood: input.body.mood, energy: input.body.energy, stress: input.body.stress, note: input.body.note, revision: (input.body.expected?.revision ?? 0) + 1 });
});
it('loads the saved entry, clears a rating explicitly and saves the reviewed identity without clearing the note', async () => {
  open(); expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue('A calm afternoon');
  expect(screen.getByRole('radio', { name: 'mood, Good, 4 of 5' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Clear energy' })).toBeDisabled();
  await press('Clear stress'); await press('Save check-in');
  expect(save).toHaveBeenCalledWith({ path: '/wellness/journal/2025-03-09', method: 'PUT', body: { expected: { id: journalEntry.id, revision: 3 }, mood: 4, energy: null, stress: null, note: 'A calm afternoon' } });
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ revision: 4, note: 'A calm afternoon', stress: null })); expect(close).toHaveBeenCalledTimes(1);
});
it('starts blank, refuses empty entries and permits note-only check-ins', async () => {
  open(null); expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue('');
  for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  await press('Save check-in'); expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('Choose a rating or add a note.');
  fireEvent.changeText(screen.getByLabelText('Private note (optional)'), ' A note '); await press('Save check-in');
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ body: { expected: null, mood: null, energy: null, stress: null, note: 'A note' } }));
});
it('retains failed drafts and retries with the same reviewed version', async () => {
  open(); fireEvent.changeText(screen.getByLabelText('Private note (optional)'), 'Keep this draft'); save.mockRejectedValueOnce(new Error('Offline'));
  await press('Save check-in'); expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue('Keep this draft');
  expect(screen.getByRole('alert')).toHaveTextContent(/Could not confirm your change/); await press('Save check-in');
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ note: 'Keep this draft' }));
});
it('blocks repeated submission, dismissal and field changes while saving', async () => {
  let finish!: (value: unknown) => void; save.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); const ui = open();
  const button = screen.getByRole('button', { name: 'Save check-in' }); act(() => { fireEvent.press(button); fireEvent.press(button); });
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Cancel check-in' })).toBeDisabled();
  expect(screen.getByLabelText('Private note (optional)').props.editable).toBe(false);
  act(() => ui.UNSAFE_getByType(Modal).props.onRequestClose()); expect(close).not.toHaveBeenCalled();
  await act(async () => finish({ ...journalEntry, revision: 4 })); expect(close).toHaveBeenCalledTimes(1);
});
it('reconciles a lost save reply from current server fields without a second write', async () => {
  open(); save.mockRejectedValueOnce(new Error('Lost reply')); await press('Save check-in');
  jest.mocked(api).mockResolvedValue({ ...journalFixture(), from: journalEntry.date, through: journalEntry.date, entries: [{ ...journalEntry, revision: 4 }] });
  await press('Check saved entry'); expect(save).toHaveBeenCalledTimes(1); expect(cleanup).toHaveBeenCalledTimes(1);
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ revision: 4 })); expect(close).toHaveBeenCalledTimes(1);
});
it('shows a conflicting saved version without rebasing or replacing the private draft until explicitly reviewed', async () => {
  open(); fireEvent.changeText(screen.getByLabelText('Private note (optional)'), 'My draft'); save.mockRejectedValueOnce(new Error('Conflict')); await press('Save check-in');
  const newer = { ...journalEntry, note: 'Saved on another device', revision: 5 };
  jest.mocked(api).mockResolvedValue({ ...journalFixture(), from: journalEntry.date, through: journalEntry.date, entries: [newer] });
  await press('Check saved entry'); expect(screen.getByText('Saved on another device')).toBeOnTheScreen();
  expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue('My draft'); expect(screen.getByRole('button', { name: 'Save check-in' })).toBeDisabled();
  expect(save).toHaveBeenCalledTimes(1); await press('Use saved version');
  expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue('Saved on another device');
  fireEvent.changeText(screen.getByLabelText('Private note (optional)'), 'Reviewed edit'); await press('Save check-in');
  expect(save.mock.calls[1][0].body.expected).toEqual({ id: journalEntry.id, revision: 5 });
});
it('retains the expected version and draft when checking saved content fails', async () => {
  open(); save.mockRejectedValueOnce(new Error('Lost')); await press('Save check-in'); jest.mocked(api).mockRejectedValueOnce(new Error('Offline'));
  await press('Check saved entry'); expect(screen.getByRole('alert')).toHaveTextContent(/Your draft and reviewed version are kept/);
  expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue(journalEntry.note!); await press('Save check-in');
  expect(save.mock.calls[1][0].body.expected).toEqual({ id: journalEntry.id, revision: 3 });
});
it('requires explicit deletion confirmation and reconciles uncertain deletion through known absence', async () => {
  open(); await press('Delete check-in'); expect(save).not.toHaveBeenCalled(); await press('Keep check-in');
  await press('Delete check-in'); save.mockRejectedValueOnce(new Error('Lost delete reply')); await press('Confirm delete check-in');
  expect(save).toHaveBeenCalledWith({ path: '/wellness/journal/2025-03-09', method: 'DELETE', body: { expected: { id: journalEntry.id, revision: 3 } } });
  expect(close).not.toHaveBeenCalled(); jest.mocked(api).mockResolvedValue({ ...journalFixture(), from: journalEntry.date, through: journalEntry.date, entries: [] });
  await press('Check saved entry'); expect(saved).toHaveBeenCalledWith(null); expect(cleanup).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
});
it('confirms before discarding a changed note and keeps it when dismissal is cancelled', async () => {
  open(); fireEvent.changeText(screen.getByLabelText('Private note (optional)'), 'Unsaved'); await press('Cancel check-in');
  expect(close).not.toHaveBeenCalled(); await press('Keep editing'); expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue('Unsaved');
  await press('Cancel check-in'); await press('Discard draft'); expect(close).toHaveBeenCalledTimes(1);
});
it('ignores late mutation/reconciliation acknowledgments after the captured account changes', async () => {
  let finish!: (value: unknown) => void; save.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); open();
  act(() => fireEvent.press(screen.getByRole('button', { name: 'Save check-in' })));
  act(() => useSessionStore.setState({ session: { ...owner, accessToken: 'replacement-token' } }));
  await act(async () => finish({ ...journalEntry, revision: 4 })); expect(saved).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
it('rejects malformed success and validates note length even after an earlier uncertain attempt', async () => {
  open(); save.mockResolvedValueOnce({ ...journalEntry, revision: 3 }); await press('Save check-in'); expect(saved).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Private note (optional)'), 'x'.repeat(2001)); await press('Save check-in');
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('alert')).toHaveTextContent(/2000/);
});
it('aborts saved-entry checks after the deadline, retaining the draft', async () => {
  open(); save.mockRejectedValueOnce(new Error('Lost')); await press('Save check-in'); jest.useFakeTimers();
  let signal!: AbortSignal; jest.mocked(api).mockImplementation((_path, init) => new Promise((_resolve, reject) => {
    signal = init!.signal as AbortSignal; signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  act(() => fireEvent.press(screen.getByRole('button', { name: 'Check saved entry' })));
  await act(async () => { jest.advanceTimersByTime(15000); }); expect(signal.aborted).toBe(true);
  expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue(journalEntry.note!); expect(saved).not.toHaveBeenCalled(); jest.useRealTimers();
});
it('aborts reconciliation when the editor closes and ignores a late server reply', async () => {
  const ui = open(); save.mockRejectedValueOnce(new Error('Lost')); await press('Save check-in');
  let signal!: AbortSignal, resolve!: (value: unknown) => void;
  jest.mocked(api).mockImplementation((_path, init) => new Promise(done => { signal = init!.signal as AbortSignal; resolve = done; }));
  act(() => fireEvent.press(screen.getByRole('button', { name: 'Check saved entry' })));
  ui.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(journalFixture()));
  expect(cleanup).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
