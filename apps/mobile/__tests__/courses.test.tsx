import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CoursesScreen from '../app/courses';
import { useAcademic, useAction, useCourses } from '../src/features/queries';
import { useSessionStore } from '../src/store/session';
import type { AcademicItem, Course } from '../src/lib/types';

jest.mock('expo-router', () => { const router = { push: jest.fn(), replace: jest.fn() }; return { router, useRouter: () => router }; });
jest.mock('../src/features/queries', () => ({ useCourses: jest.fn(), useAcademic: jest.fn(), useAction: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const manual: Course = { id: '60000000-0000-4000-8000-000000000001', externalId: '60000000-0000-4000-8000-000000000001', name: 'Cognitive Psychology', code: 'PSY 223', active: true, source: 'manual', color: 'plum' };
const imported: Course = { id: '60000000-0000-4000-8000-000000000002', externalId: 'canvas-1', name: 'Statistics', code: 'STAT 151', active: true, source: 'canvas', color: null };
const item = (courseId: string, submissionState: AcademicItem['submissionState']): AcademicItem => ({ id: `50000000-0000-4000-8000-00000000000${submissionState === 'submitted' ? 2 : 1}`,
  courseId, title: 'Essay', kind: 'assignment', due: null, submissionState, source: 'manual', externalId: 'x', mainGoalDate: null, updatedAt: '2026-10-01T00:00:00Z' });
const save = jest.fn();
const show = (courses: Course[] | undefined) => jest.mocked(useCourses).mockReturnValue({ data: courses, isLoading: false, isRefetching: false, refetch: jest.fn() } as unknown as ReturnType<typeof useCourses>);
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  useSessionStore.setState({ session: { accessToken: 'courses', expiresAt: '2099-01-01T00:00:00Z', user: { id: '10000000-0000-4000-8000-000000000001',
    email: 'c@example.test', displayName: 'C', timeZone: 'America/Edmonton', createdAt: '2026-01-01T00:00:00Z' } }, ready: true });
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useAcademic).mockReturnValue({ data: [item(manual.id, 'unsubmitted'), item(manual.id, 'submitted')], refetch: jest.fn() } as unknown as ReturnType<typeof useAcademic>);
  show([manual, imported]);
});

it('lists courses with their source and open coursework', () => {
  render(<CoursesScreen/>);
  expect(screen.getByText('PSY 223 · Your course · 1 open item')).toBeOnTheScreen();
  expect(screen.getByText('STAT 151 · Imported from Canvas · 0 open items')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Archive Statistics' })).toBeNull();
});
it('creates a course with a client ID, trimmed fields and a chosen colour, reusing the ID on retry', async () => {
  save.mockRejectedValueOnce(new TypeError('Network request failed'));
  render(<CoursesScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Add course' }));
  fireEvent.changeText(screen.getByLabelText('Course name'), ' Ethics '); fireEvent.changeText(screen.getByLabelText('Course code (optional)'), ' ');
  fireEvent.press(screen.getByRole('radio', { name: 'Teal colour' }));
  await act(async () => { fireEvent.press(screen.getAllByRole('button', { name: 'Add course' }).at(-1)!); });
  expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t confirm/);
  await act(async () => { fireEvent.press(screen.getAllByRole('button', { name: 'Add course' }).at(-1)!); });
  const [first, second] = save.mock.calls.map(([request]) => request);
  expect(first).toMatchObject({ path: '/courses', method: 'POST', body: { name: 'Ethics', code: null, color: 'teal' } });
  expect(second.body.id).toBe(first.body.id); expect(first.body.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.queryByText('New course')).toBeNull();
});
it('validates a blank name without saving', async () => {
  render(<CoursesScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Add course' }));
  await act(async () => { fireEvent.press(screen.getAllByRole('button', { name: 'Add course' }).at(-1)!); });
  expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('Enter a course name.');
});
it('edits only the colour of an imported course', async () => {
  render(<CoursesScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Edit Statistics' }));
  expect(screen.getByLabelText('Course name')).toHaveProp('editable', false); expect(screen.queryByRole('button', { name: 'Delete course' })).toBeNull();
  fireEvent.press(screen.getByRole('radio', { name: 'Gold colour' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save course' })); });
  expect(save).toHaveBeenCalledWith({ path: `/courses/${imported.id}`, method: 'PATCH', body: { color: 'gold' } });
});
it('archives, restores and deletes a manual course after confirmation', async () => {
  const view = render(<CoursesScreen/>);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Archive Cognitive Psychology' })); });
  expect(save).toHaveBeenCalledWith({ path: `/courses/${manual.id}`, method: 'PATCH', body: { active: false } });
  show([{ ...manual, active: false }, imported]); view.rerender(<CoursesScreen/>);
  expect(screen.getByText('Archived')).toBeOnTheScreen(); expect(screen.getByRole('button', { name: 'Restore Cognitive Psychology' })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Edit Cognitive Psychology' })); fireEvent.press(screen.getByRole('button', { name: 'Delete course' }));
  expect(screen.getByText(/becomes “No course”/)).toBeOnTheScreen(); fireEvent.press(screen.getByRole('button', { name: 'Keep course' }));
  expect(save).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Edit Cognitive Psychology' })); fireEvent.press(screen.getByRole('button', { name: 'Delete course' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Delete course' })); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${manual.id}`, method: 'DELETE' });
});
it('offers an empty state', () => {
  show([]); render(<CoursesScreen/>); expect(screen.getByText('Add your first course.')).toBeOnTheScreen();
});
