import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CourseScreen from '../app/course/[id]';
import { useAcademic, useAction, useClasses, useCourses } from '../src/features/queries';
import { useTodayClock } from '../src/features/today-clock';
import { useSessionStore } from '../src/store/session';
import type { Course } from '../src/lib/types';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockId = '60000000-0000-4000-8000-000000000001';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('../src/features/queries', () => ({ useCourses: jest.fn(), useAcademic: jest.fn(), useClasses: jest.fn(), useAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

// A Canvas course weighting Assignments 60% and Exams 40%, plus a group the student made.
const assignments = { id: '80000000-0000-4000-8000-000000000001', title: 'Assignments', weight: 60, canvas: { externalId: '10', weight: 60, weightEdited: false } };
const exams = { id: '80000000-0000-4000-8000-000000000002', title: 'Exams', weight: 25, canvas: { externalId: '20', weight: 40, weightEdited: true } };
const labs = { id: '80000000-0000-4000-8000-000000000003', title: 'Labs', weight: null };
const essay = { id: '70000000-0000-4000-8000-000000000001', title: 'Essay', weight: 20, score: 85, groupId: assignments.id,
  canvas: { externalId: '101', pointsPossible: 20, weightEdited: false } };
const report = { id: '70000000-0000-4000-8000-000000000002', title: 'Report', weight: 5, score: null, groupId: assignments.id,
  canvas: { externalId: '102', pointsPossible: 30, weightEdited: true } };
const midterm = { id: '70000000-0000-4000-8000-000000000003', title: 'Midterm', weight: 50, score: 70, groupId: exams.id,
  canvas: { externalId: '201', pointsPossible: 50, weightEdited: false } };
const course: Course = { id: mockId, externalId: '1', name: 'Software Engineering', code: 'AUCSC 325', active: true, source: 'canvas', color: 'blue',
  assessments: [essay, report, midterm], assessmentGroups: [assignments, exams, labs], targetGrade: 80 };
const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  useSessionStore.setState({ session: { accessToken: 'groups', expiresAt: '2099-01-01T00:00:00Z', user: { id: '10000000-0000-4000-8000-000000000001',
    email: 'g@example.test', displayName: 'G', timeZone: 'America/Edmonton', createdAt: '2026-01-01T00:00:00Z' } }, ready: true });
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useCourses).mockReturnValue({ data: [course], isLoading: false, isRefetching: false, refetch: jest.fn() } as unknown as ReturnType<typeof useCourses>);
  jest.mocked(useAcademic).mockReturnValue({ data: [], refetch: jest.fn() } as unknown as ReturnType<typeof useAcademic>);
  jest.mocked(useClasses).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useClasses>);
  jest.mocked(useTodayClock).mockReturnValue({ date: '2026-10-15', resumeCount: 0 });
});

it('shows each group with its weight, source and average, and each assessment’s share of the course', () => {
  render(<CourseScreen/>);
  // Assignments average 85 (60%), exams 70 (25%): (5100 + 1750) / 85 = 80.6.
  expect(screen.getByLabelText('Current grade 80.6%')).toBeOnTheScreen();
  expect(screen.getByText('60% of course · From Canvas · Average 85%')).toBeOnTheScreen();
  expect(screen.getByText('25% of course · From Canvas · Average 70%')).toBeOnTheScreen();
  expect(screen.getByText('Graded by points')).toBeOnTheScreen();
  // Essay is 20 of the group's 25 points: 48% of the course. Report keeps the student's own weight of 5.
  expect(screen.getByText('20 pts · 48% of course')).toBeOnTheScreen();
  expect(screen.getByText('Your weight 5 (Canvas 30 pts) · 12% of course')).toBeOnTheScreen();
  expect(screen.getByText('No assessments in this group yet.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Add assessment to Assignments' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Add assessment to Labs' })).toBeOnTheScreen();
});

it('lets a Canvas assessment’s weight change and reset, but not its name, score or existence', async () => {
  render(<CourseScreen/>);
  fireEvent.press(screen.getByRole('button', { name: 'Edit Report' }));
  expect(screen.getByText(/Imported from Canvas: 30 points, not graded yet\./)).toBeOnTheScreen();
  expect(screen.queryByLabelText('Assessment name')).toBeNull(); expect(screen.queryByLabelText('Score (%)')).toBeNull();
  expect(screen.queryByText('Delete assessment')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Share of group'), '0');
  await act(async () => { fireEvent.press(screen.getByText('Save weight')); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${mockId}/assessments/${report.id}`, method: 'PATCH', body: { weight: 0 } });
  fireEvent.press(screen.getByRole('button', { name: 'Edit Report' }));
  await act(async () => { fireEvent.press(screen.getByText('Use the Canvas weight (30)')); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${mockId}/assessments/${report.id}`, method: 'PATCH', body: { resetWeight: true } });
});

it('changes and resets a Canvas group weight without renaming it', async () => {
  render(<CourseScreen/>);
  fireEvent.press(screen.getByRole('button', { name: 'Edit group Exams' }));
  expect(screen.getByText(/Imported from Canvas, which weights it 40%\./)).toBeOnTheScreen();
  expect(screen.queryByLabelText('Group name')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Group weight (%)'), '35');
  await act(async () => { fireEvent.press(screen.getByText('Save group')); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${mockId}/assessment-groups/${exams.id}`, method: 'PATCH', body: { weight: 35 } });
  fireEvent.press(screen.getByRole('button', { name: 'Edit group Exams' }));
  await act(async () => { fireEvent.press(screen.getByText('Use the Canvas weight (40%)')); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${mockId}/assessment-groups/${exams.id}`, method: 'PATCH', body: { resetWeight: true } });
});

it('adds a group by points and an assessment inside it, and deletes an empty group', async () => {
  render(<CourseScreen/>);
  fireEvent.press(screen.getByRole('button', { name: 'Add group' }));
  fireEvent.changeText(screen.getByLabelText('Group name'), 'Quizzes');
  // The modal's own button, not the screen's link behind it.
  await act(async () => { fireEvent.press(screen.getAllByText('Add group').at(-1)!); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${mockId}/assessment-groups`, method: 'POST', body: expect.objectContaining({ title: 'Quizzes', weight: null }) });
  fireEvent.press(screen.getByRole('button', { name: 'Add assessment to Labs' }));
  expect(screen.getByRole('radio', { name: 'Group Labs' })).toBeChecked();
  fireEvent.changeText(screen.getByLabelText('Assessment name'), 'Lab 1');
  fireEvent.changeText(screen.getByLabelText('Share of group'), '10');
  await act(async () => { fireEvent.press(screen.getByText('Add assessment')); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${mockId}/assessments`, method: 'POST',
    body: expect.objectContaining({ title: 'Lab 1', weight: 10, score: null, groupId: labs.id }) });
  fireEvent.press(screen.getByRole('button', { name: 'Edit group Labs' }));
  await act(async () => { fireEvent.press(screen.getByText('Delete group')); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${mockId}/assessment-groups/${labs.id}`, method: 'DELETE' });
});

it('offers what-if scores that flow through group weights', () => {
  render(<CourseScreen/>);
  expect(screen.getByText('Weight 12%')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('What-if score for Report (%)'), '100');
  // Assignments become (20×85 + 5×100) / 25 = 88: (60×88 + 25×70) / 85 = 82.7, which meets the 80% target.
  expect(screen.getByText('Your final grade would be 82.7%. That meets your 80% target.')).toBeOnTheScreen();
});
