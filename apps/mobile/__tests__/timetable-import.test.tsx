import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ClassImportDraft, ClassImportPreview } from '@campusflow/contracts';
import TimetableImportScreen from '../app/timetable-import';
import { useAction } from '../src/features/queries';
import { pickCalendarFile, previewCalendar } from '../src/services/timetable-import';

const mockReplace = jest.fn(); const save = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('../src/services/timetable-import', () => ({ pickCalendarFile: jest.fn(), previewCalendar: jest.fn() }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: 'token', user: { id: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');

const draft = (title: string, fields: Partial<ClassImportDraft> = {}): ClassImportDraft => ({ title, weekdays: [1, 3], termStart: '2026-09-09', termEnd: '2026-12-09',
  startTime: '09:00', endTime: '09:50', timeZone: 'America/Edmonton', location: 'Arts 101', instructor: null, notes: null, color: 'moss', meetings: 28, duplicateOf: null, ...fields });
const preview = (classes: ClassImportDraft[], skipped: Partial<ClassImportPreview['skipped']> = {}): ClassImportPreview =>
  ({ classes, skipped: { oneTime: 0, allDay: 0, unsupported: 0, finished: 0, overLimit: 0, ...skipped } });
const choose = async (result: ClassImportPreview) => {
  jest.mocked(pickCalendarFile).mockResolvedValueOnce({ name: 'fall.ics', text: 'BEGIN:VCALENDAR' });
  jest.mocked(previewCalendar).mockResolvedValueOnce(result);
  fireEvent.press(screen.getByText('Choose a calendar file'));
  await screen.findByText(/found$/);
};
const posted = () => save.mock.calls.map(([request]) => request.body.title);
beforeEach(() => { jest.clearAllMocks(); save.mockReset().mockResolvedValue({}); jest.mocked(useAction).mockReturnValue({ mutateAsync: save } as unknown as ReturnType<typeof useAction>); });

it('previews classes, leaves likely duplicates unselected and saves only what the student keeps', async () => {
  render(<TimetableImportScreen/>);
  await choose(preview([draft('Psychology'), draft('Biology', { weekdays: [2, 4], duplicateOf: '20000000-0000-4000-8000-000000000001' }), draft('Writing')], { oneTime: 2 }));
  expect(screen.getByText('3 weekly classes found')).toBeTruthy(); expect(screen.getByText('Skipped: 2 one-time events.')).toBeTruthy();
  expect(screen.getByText('Looks like a class already in your timetable.')).toBeTruthy();
  fireEvent.press(screen.getByRole('checkbox', { name: /^Writing/ }));
  fireEvent.press(screen.getByText('Add 1 class'));
  await screen.findByText('1 class added to your timetable.');
  expect(posted()).toEqual(['Psychology']);
  // Preview-only fields never reach the class API.
  expect(save.mock.calls[0][0]).toEqual({ path: '/classes', method: 'POST', body: expect.not.objectContaining({ meetings: expect.anything() }) });
  expect(save.mock.calls[0][0].body).not.toHaveProperty('duplicateOf');
  fireEvent.press(screen.getByText('Open timetable')); expect(mockReplace).toHaveBeenCalledWith('/timetable');
});

it('keeps saved classes after a partial failure and retries only the rest', async () => {
  save.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Offline'));
  render(<TimetableImportScreen/>);
  await choose(preview([draft('Psychology'), draft('Biology')]));
  fireEvent.press(screen.getByText('Add 2 classes'));
  await screen.findByText('1 class couldn’t be saved. Your other classes are saved. Check your connection and try again.');
  expect(screen.getByText('Added')).toBeTruthy(); expect(screen.getByText('Not saved yet')).toBeTruthy();
  fireEvent.press(screen.getByText('Retry 1 class'));
  await screen.findByText('2 classes added to your timetable.');
  expect(posted()).toEqual(['Psychology', 'Biology', 'Biology']);
});

it('does nothing when the student cancels the picker', async () => {
  jest.mocked(pickCalendarFile).mockResolvedValueOnce(undefined);
  render(<TimetableImportScreen/>); fireEvent.press(screen.getByText('Choose a calendar file'));
  await waitFor(() => expect(pickCalendarFile).toHaveBeenCalled());
  expect(previewCalendar).not.toHaveBeenCalled(); expect(screen.queryByText(/found$/)).toBeNull();
});

it('explains unreadable files and lets the student choose again', async () => {
  jest.mocked(pickCalendarFile).mockResolvedValueOnce({ name: 'notes.txt', text: 'hello' });
  jest.mocked(previewCalendar).mockRejectedValueOnce(new Error('CampusFlow couldn’t read classes from this file. Export the calendar again as .ics and retry.'));
  render(<TimetableImportScreen/>); fireEvent.press(screen.getByText('Choose a calendar file'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t read classes/);
  expect(screen.getByText('Choose a calendar file')).toBeEnabled();
});

it('guides the student when a file has no weekly classes', async () => {
  render(<TimetableImportScreen/>);
  await choose(preview([], { oneTime: 3, allDay: 1 }));
  expect(screen.getByText('No weekly classes found')).toBeTruthy();
  expect(screen.getByText(/Classes need to repeat at least twice/)).toBeTruthy();
  expect(screen.queryByText(/^Add /)).toBeNull();
});
