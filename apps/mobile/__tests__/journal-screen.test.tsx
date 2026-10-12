import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Journal from '../app/journal';
import { useWellnessJournal, useWellnessJournalAction } from '../src/features/queries';
import { useTodayClock } from '../src/features/today-clock';
import { useSessionStore } from '../src/store/session';
import type { Session } from '../src/lib/types';
import { journalEntry, journalFixture, journalOwner } from './journal-fixture';
jest.mock('../src/features/queries', () => ({ useWellnessJournal: jest.fn(), useWellnessJournalAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const mockReplace = jest.fn(); jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
const refresh = jest.fn(), save = jest.fn(), cleanup = jest.fn();
const owner: Session = { accessToken: 'journal-token', expiresAt: '2030-01-01T00:00:00Z', user: {
  id: journalOwner, email: 'journal-screen@example.test', displayName: 'Fixture', timeZone: 'America/Edmonton', createdAt: '2025-01-01T00:00:00Z',
} };
const query = (extra = {}) => ({ data: journalFixture(), isLoading: false, isError: false, isCached: false, isFetching: false, isRefetching: false, refetch: refresh, ...extra }) as unknown as ReturnType<typeof useWellnessJournal>;
const press = async (name: string) => { await act(async () => { fireEvent.press(screen.getByRole('button', { name })); }); };
beforeEach(() => {
  jest.clearAllMocks(); useSessionStore.setState({ session: owner, ready: true }); refresh.mockResolvedValue({}); cleanup.mockResolvedValue(undefined);
  jest.mocked(useTodayClock).mockReturnValue({ date: '2025-03-09', resumeCount: 0 }); jest.mocked(useWellnessJournal).mockReturnValue(query());
  jest.mocked(useWellnessJournalAction).mockReturnValue({ mutateAsync: save, isPending: false, confirmSaved: cleanup, retryCleanup: cleanup } as unknown as ReturnType<typeof useWellnessJournalAction>);
  save.mockImplementation(async input => ({ ...journalEntry, mood: input.body.mood, energy: input.body.energy, stress: input.body.stress, note: input.body.note, revision: 4 }));
});
it('shows recorded coverage and actual saved fields with an explicit editor, preserving server-saved notes', async () => {
  render(<Journal/>); expect(screen.getByText('1 of 7 days have a check-in')).toBeOnTheScreen();
  expect(screen.getAllByText('0 recorded ratings')).toHaveLength(1); await press('Edit selected check-in');
  expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue(journalEntry.note!);
  expect(screen.getByRole('radio', { name: 'mood, Good, 4 of 5' })).toBeChecked();
});
it('distinguishes known empty saved coverage from unavailable history', async () => {
  jest.mocked(useWellnessJournal).mockReturnValue(query({ data: { ...journalFixture(), entries: [] }, isError: true, isCached: true }));
  const ui = render(<Journal/>); expect(screen.getByText('0 of 7 days have a check-in')).toBeOnTheScreen(); await press('Add selected check-in');
  expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue(''); await press('Cancel check-in');
  jest.mocked(useWellnessJournal).mockReturnValue(query({ data: undefined, isError: true })); ui.rerender(<Journal/>);
  expect(screen.getByText('History unavailable')).toBeOnTheScreen(); expect(screen.queryByRole('button', { name: 'Add selected check-in' })).toBeNull();
});
it('switches the visible period, searches only recorded dates/notes and opens a dated reviewed entry', async () => {
  render(<Journal/>); fireEvent.press(screen.getByRole('radio', { name: '30-day view' })); expect(screen.getByText('1 of 30 days have a check-in')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('Search check-ins'), 'does not match'); expect(screen.queryByRole('button', { name: 'Review 2025-03-09' })).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Search check-ins'), 'calm'); await press('Review 2025-03-09'); expect(screen.getByLabelText('Private note (optional)')).toHaveDisplayValue(journalEntry.note!);
  expect(mockReplace).not.toHaveBeenCalled();
});
it('browses bounded historical ranges and offers only forward navigation up to today', async () => {
  render(<Journal/>); expect(screen.getByRole('button', { name: 'Next 30 days' })).toBeDisabled(); await press('Previous 30 days');
  expect(useWellnessJournal).toHaveBeenLastCalledWith('2025-01-09', '2025-02-07'); await press('Recent days');
  expect(useWellnessJournal).toHaveBeenLastCalledWith('2025-02-08', '2025-03-09');
});
it('keeps the selected edit date stable across local midnight and refreshes after foreground', async () => {
  const ui = render(<Journal/>); await press('Edit selected check-in');
  jest.mocked(useTodayClock).mockReturnValue({ date: '2025-03-10', resumeCount: 1 }); ui.rerender(<Journal/>);
  await press('Save check-in'); expect(save.mock.calls[0][0].path).toBe('/wellness/journal/2025-03-09'); expect(refresh).toHaveBeenCalled();
});
it.each(['switch', 'relogin'])('discards private drafts when account/token identity changes on %s', async transition => {
  render(<Journal/>); await press('Edit selected check-in'); fireEvent.changeText(screen.getByLabelText('Private note (optional)'), 'Private draft');
  act(() => useSessionStore.setState({ session: { ...owner, accessToken: 'new-token', user: { ...owner.user, id: transition === 'switch' ? '72000000-0000-4000-8000-000000000009' : owner.user.id } } }));
  expect(screen.queryByLabelText('Private note (optional)')).toBeNull();
  if (transition === 'switch') { expect(screen.queryByText(journalEntry.note!)).toBeNull(); expect(screen.getByText('History unavailable')).toBeOnTheScreen(); }
});
it('shows a confirmed saved edit when the wider history refresh is unavailable', async () => {
  jest.mocked(useWellnessJournal).mockReturnValue(query({ isError: true })); render(<Journal/>); await press('Edit selected check-in');
  fireEvent.changeText(screen.getByLabelText('Private note (optional)'), 'Confirmed new note'); await press('Save check-in');
  expect(screen.getByRole('alert')).toHaveTextContent('Check-in saved to your account.'); expect(screen.getAllByText('Confirmed new note').length).toBeGreaterThan(0);
  expect(screen.getByText(/Your confirmed change is included/)).toBeOnTheScreen();
});
