import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import CalendarScreen from '../app/calendar';
import { useAcademic, useAction, useCourses, useEvents, usePlanningSnapshot, useTasks } from '../src/features/queries';
import { useTodayClock } from '../src/features/today-clock';
import { useSessionStore } from '../src/store/session';
import type { PersonalTask } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

jest.mock('expo-router', () => { const router = { push: jest.fn(), replace: jest.fn() }; return { router, useRouter: () => router }; });
jest.mock('../src/features/queries', () => ({ useTasks: jest.fn(), useAcademic: jest.fn(), useEvents: jest.fn(), usePlanningSnapshot: jest.fn(), useAction: jest.fn(), useCourses: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const base: PersonalTask = { ...snapshotFixture().personalTasks[0], recurrence: null, completedAt: null, scheduled: null };
const query = (data: unknown, extra = {}) => ({ data, isLoading: false, isRefetching: false, isCached: false, refetch: jest.fn(), ...extra });
const show = (tasks: PersonalTask[], extra = {}) => {
  jest.mocked(useTasks).mockReturnValue(query(tasks, extra) as unknown as ReturnType<typeof useTasks>);
  jest.mocked(useAcademic).mockReturnValue(query([]) as unknown as ReturnType<typeof useAcademic>);
  jest.mocked(useEvents).mockReturnValue(query([]) as unknown as ReturnType<typeof useEvents>);
  jest.mocked(useCourses).mockReturnValue(query([]) as unknown as ReturnType<typeof useCourses>);
};
beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ session: { accessToken: 'calendar', expiresAt: '2099-01-01T00:00:00Z', user: { id: '10000000-0000-4000-8000-000000000001',
    email: 'c@example.test', displayName: 'Cal', timeZone: 'America/Edmonton', createdAt: '2026-01-01T00:00:00Z' } }, ready: true });
  jest.mocked(useTodayClock).mockReturnValue({ date: '2026-10-14', resumeCount: 0 });
  jest.mocked(usePlanningSnapshot).mockReturnValue(query(undefined) as unknown as ReturnType<typeof usePlanningSnapshot>);
  jest.mocked(useAction).mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as unknown as ReturnType<typeof useAction>);
  show([{ ...base, title: 'Lab report', due: { kind: 'date', date: '2026-10-20' } }, { ...base, id: '20000000-0000-4000-8000-000000000009', title: 'Read', due: { kind: 'date', date: '2026-10-14' } }]);
});

it('opens on the account month with today selected and its dated work listed', () => {
  render(<CalendarScreen/>);
  expect(screen.getByText('October 2026')).toBeOnTheScreen();
  expect(screen.getByText('Read')).toBeOnTheScreen(); expect(screen.queryByText('Lab report')).toBeNull();
  expect(screen.getByRole('button', { name: /^Tuesday, October 20: 1 open item$/ })).toBeOnTheScreen();
});
it('selects another day, navigates months and returns to today', () => {
  render(<CalendarScreen/>);
  fireEvent.press(screen.getByRole('button', { name: /^Tuesday, October 20/ }));
  expect(screen.getByText('Lab report')).toBeOnTheScreen(); expect(screen.getByText('Due this day')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Next month' })); expect(screen.getByText('November 2026')).toBeOnTheScreen();
  expect(screen.getByText('Nothing dated for this day.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Jump to today' })); expect(screen.getByText('Read')).toBeOnTheScreen();
});
it('opens the selected day plan and offers capture only for today or later', () => {
  render(<CalendarScreen/>);
  fireEvent.press(screen.getByRole('button', { name: /^Tuesday, October 20/ }));
  fireEvent.press(screen.getByRole('button', { name: 'Open day plan' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/today', params: { date: '2026-10-20' } });
  fireEvent.press(screen.getByRole('button', { name: 'Add task on this day' })); expect(screen.getByText('New task')).toBeOnTheScreen();
  expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue('2026-10-20');
});
it('hides capture for past days and never shows unavailable data as an empty month', () => {
  show([], { data: undefined, error: new Error('Offline') });
  render(<CalendarScreen/>);
  expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t load/);
  expect(screen.queryByText('Nothing dated for this day.')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.queryByRole('button', { name: 'Add task on this day' })).toBeNull();
});
it('does not present a failed event read as an empty day or a proven empty grid', () => {
  show([]);
  jest.mocked(useEvents).mockReturnValue(query(undefined, { error: new Error('Offline') }) as unknown as ReturnType<typeof useEvents>);
  render(<CalendarScreen/>);
  expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t load/);
  expect(screen.queryByText('Nothing dated for this day.')).toBeNull();
  expect(screen.getByRole('button', { name: /^Wednesday, October 14, today: Items not fully loaded$/ })).toBeOnTheScreen();
});
it('marks a recorded recurring occurrence complete using the owned covered snapshot', () => {
  const task = { ...base, title: 'Daily reading', scheduled: { kind: 'date' as const, date: '2026-10-14' }, recurrence: { frequency: 'daily' as const, interval: 1 } };
  show([task]);
  jest.mocked(usePlanningSnapshot).mockReturnValue(query({ ...snapshotFixture(), capturedAt: '2026-10-14T18:00:00Z',
    coverage: { from: '2026-10-01', through: '2026-10-31', includesOverdue: true, basis: 'persisted' }, personalTasks: [task],
    taskCompletions: [{ taskId: task.id, occurrenceKey: '2026-10-14', completedAt: '2026-10-14T17:00:00Z' }] }) as unknown as ReturnType<typeof usePlanningSnapshot>);
  render(<CalendarScreen/>);
  expect(screen.getByText('Daily reading')).toBeOnTheScreen();
  expect(screen.getByText('Finished · Planned for this day')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /^Wednesday, October 14, today: nothing open$/ })).toBeOnTheScreen();
});
it('keeps recurring completion unknown while its history is unavailable', () => {
  show([{ ...base, title: 'Daily reading', scheduled: { kind: 'date', date: '2026-10-14' }, recurrence: { frequency: 'daily', interval: 1 } }]);
  render(<CalendarScreen/>);
  expect(screen.getByText('Completion unavailable · Planned for this day')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /Wednesday, October 14, today: 1 repeating occurrence with completion unavailable/ })).toBeOnTheScreen();
});

it('labels exams and coursework with their course', () => {
  const courseId = '60000000-0000-4000-8000-000000000001';
  jest.mocked(useCourses).mockReturnValue(query([{ id: courseId, externalId: courseId, name: 'Cognitive Psychology', code: 'PSY 223', active: true, source: 'manual', color: 'plum' }]) as unknown as ReturnType<typeof useCourses>);
  jest.mocked(useAcademic).mockReturnValue(query([
    { id: '50000000-0000-4000-8000-000000000001', courseId, title: 'Midterm', kind: 'exam', due: { kind: 'date', date: '2026-10-14' }, submissionState: 'unsubmitted', source: 'manual', externalId: 'a', mainGoalDate: null, updatedAt: '2026-10-01T00:00:00Z' },
    { id: '50000000-0000-4000-8000-000000000002', courseId: null, title: 'Reading log', kind: 'assignment', due: { kind: 'date', date: '2026-10-14' }, submissionState: 'unsubmitted', source: 'manual', externalId: 'b', mainGoalDate: null, updatedAt: '2026-10-01T00:00:00Z' },
  ]) as unknown as ReturnType<typeof useAcademic>);
  render(<CalendarScreen/>);
  expect(screen.getByText('EXAM · PSY 223')).toBeOnTheScreen(); expect(screen.getByText('COURSEWORK')).toBeOnTheScreen();
});
