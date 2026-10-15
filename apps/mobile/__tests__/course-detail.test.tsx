import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CourseScreen from '../app/course/[id]';
import { useAcademic, useAction, useClasses, useCourses } from '../src/features/queries';
import { classFixture } from './class-fixture';
import { useTodayClock } from '../src/features/today-clock';
import { useSessionStore } from '../src/store/session';
import type { Course } from '../src/lib/types';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockId = '60000000-0000-4000-8000-000000000001';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('../src/features/queries', () => ({ useCourses: jest.fn(), useAcademic: jest.fn(), useClasses: jest.fn(), useAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const midterm = { id: '70000000-0000-4000-8000-000000000001', title: 'Midterm', weight: 30, score: 80 };
const essays = { id: '70000000-0000-4000-8000-000000000002', title: 'Essays', weight: 20, score: 90 };
const final = { id: '70000000-0000-4000-8000-000000000003', title: 'Final exam', weight: 50, score: null };
const base: Course = { id: mockId, externalId: mockId, name: 'Cognitive Psychology', code: 'PSY 223', active: true, source: 'manual', color: 'plum',
  assessments: [midterm, essays, final], targetGrade: 85 };
const save = jest.fn();
const show = (course: Course) => jest.mocked(useCourses).mockReturnValue({ data: [course], isLoading: false, isRefetching: false, refetch: jest.fn() } as unknown as ReturnType<typeof useCourses>);
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({}); mockId = base.id;
  useSessionStore.setState({ session: { accessToken: 'course', expiresAt: '2099-01-01T00:00:00Z', user: { id: '10000000-0000-4000-8000-000000000001',
    email: 'c@example.test', displayName: 'C', timeZone: 'America/Edmonton', createdAt: '2026-01-01T00:00:00Z' } }, ready: true });
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useAcademic).mockReturnValue({ data: [{ id: '50000000-0000-4000-8000-000000000001', courseId: base.id, title: 'Lab report', kind: 'assignment',
    due: { kind: 'date', date: '2026-10-16' }, submissionState: 'unsubmitted', source: 'manual', externalId: 'x', mainGoalDate: null, updatedAt: '2026-10-01T00:00:00Z' }], refetch: jest.fn() } as unknown as ReturnType<typeof useAcademic>);
  jest.mocked(useTodayClock).mockReturnValue({ date: '2026-10-15', resumeCount: 0 });
  jest.mocked(useClasses).mockReturnValue({ data: [classFixture({ courseId: base.id, title: 'PSY 223 · Lecture' }), classFixture({ id: '20000000-0000-4000-8000-000000000009', title: 'Other class' })] } as unknown as ReturnType<typeof useClasses>);
  show(base);
});

it('shows the weighted grade, graded share and what is needed for the target', () => {
  render(<CourseScreen/>);
  expect(screen.getByText('84%')).toBeOnTheScreen(); expect(screen.getByText('50% of 100% graded')).toBeOnTheScreen();
  expect(screen.getByText('Average 86% on the remaining 50% to reach 85%.')).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Target 85%' })).toBeChecked();
  expect(screen.getByText('Not graded')).toBeOnTheScreen(); expect(screen.getByText('Lab report')).toBeOnTheScreen();
  expect(screen.getByText(/Assignment · Due tomorrow/)).toBeOnTheScreen();
});
it.each([
  [{ ...base, targetGrade: 40 }, /Target secured\. Even 0% on the remaining 50% keeps you at 42%\./],
  [{ ...base, targetGrade: 95 }, /Out of reach: 100% on the rest gives 92%\./],
  [{ ...base, assessments: [midterm, essays, { ...final, score: 70 }] }, /Final grade: 77%/],
  [{ ...base, assessments: [], targetGrade: null }, /Add assessments from your course outline/],
])('explains the outlook %#', (course, text) => { show(course); render(<CourseScreen/>); expect(screen.getByText(text)).toBeOnTheScreen(); });
it('sets preset and custom targets and rejects invalid ones', async () => {
  render(<CourseScreen/>);
  await act(async () => { fireEvent.press(screen.getByRole('radio', { name: 'No target' })); });
  expect(save).toHaveBeenCalledWith({ path: `/courses/${base.id}`, method: 'PATCH', body: { targetGrade: null } });
  fireEvent.changeText(screen.getByLabelText('Custom target (%)'), '101');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Set target' })); });
  expect(screen.getByRole('alert')).toHaveTextContent(/from 0 to 100/); expect(save).toHaveBeenCalledTimes(1);
  fireEvent.changeText(screen.getByLabelText('Custom target (%)'), '75');
  await act(async () => { fireEvent(screen.getByLabelText('Custom target (%)'), 'submitEditing'); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${base.id}`, method: 'PATCH', body: { targetGrade: 75 } });
});
it('adds and scores assessments with percentages, keeping blanks ungraded', async () => {
  render(<CourseScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Add assessment' }));
  fireEvent.changeText(screen.getByLabelText('Assessment name'), ' Quiz 1 '); fireEvent.changeText(screen.getByLabelText('Weight (%)'), '7,5%');
  await act(async () => { fireEvent.press(screen.getAllByRole('button', { name: 'Add assessment' }).at(-1)!); });
  expect(save.mock.calls[0][0]).toMatchObject({ path: `/courses/${base.id}/assessments`, method: 'POST', body: { title: 'Quiz 1', weight: 7.5, score: null } });
  fireEvent.press(screen.getByRole('button', { name: 'Edit Final exam' })); fireEvent.changeText(screen.getByLabelText('Score (%)'), '88');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save assessment' })); });
  expect(save).toHaveBeenLastCalledWith({ path: `/courses/${base.id}/assessments/${final.id}`, method: 'PATCH', body: { title: 'Final exam', weight: 50, score: 88 } });
});
it('validates weights before saving and deletes an assessment', async () => {
  render(<CourseScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Add assessment' }));
  fireEvent.changeText(screen.getByLabelText('Assessment name'), 'Lab'); fireEvent.changeText(screen.getByLabelText('Weight (%)'), 'ten');
  await act(async () => { fireEvent.press(screen.getAllByRole('button', { name: 'Add assessment' }).at(-1)!); });
  expect(screen.getByRole('alert')).toHaveTextContent(/Enter the weight as a percentage/); expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.press(screen.getByRole('button', { name: 'Edit Midterm' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Delete assessment' })); });
  expect(save).toHaveBeenCalledWith({ path: `/courses/${base.id}/assessments/${midterm.id}`, method: 'DELETE' });
});
it('deletes a manual course after confirmation and returns to the list', async () => {
  render(<CourseScreen/>); fireEvent.press(screen.getByRole('button', { name: 'Edit course' }));
  fireEvent.press(screen.getByRole('button', { name: 'Delete course' }));
  expect(screen.getByText(/assessments are removed/)).toBeOnTheScreen();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Delete course' })); });
  expect(save).toHaveBeenCalledWith({ path: `/courses/${base.id}`, method: 'DELETE' }); expect(mockRouter.replace).toHaveBeenCalledWith('/courses');
});
it('limits imported courses to colour edits and handles a missing course', () => {
  const view = render(<CourseScreen/>);
  show({ ...base, source: 'canvas' }); view.rerender(<CourseScreen/>);
  fireEvent.press(screen.getByRole('button', { name: 'Edit course' }));
  expect(screen.getByLabelText('Course name')).toHaveProp('editable', false); expect(screen.queryByRole('button', { name: 'Delete course' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  mockId = '60000000-0000-4000-8000-000000000009'; view.rerender(<CourseScreen/>);
  expect(screen.getByText(/isn’t available/)).toBeOnTheScreen();
});
it('lists only this course’s class times and adds one already linked to it', async () => {
  render(<CourseScreen/>);
  expect(screen.getByText('PSY 223 · Lecture')).toBeOnTheScreen(); expect(screen.getByText('Mon · Wed · Fri · 09:00–10:00 · Library 204')).toBeOnTheScreen();
  expect(screen.queryByText('Other class')).toBeNull();
  fireEvent.press(screen.getByText('Add a class time'));
  expect(screen.getByRole('radio', { name: 'PSY 223 course', checked: true })).toBeOnTheScreen();
});
