import { fireEvent, render, screen } from '@testing-library/react-native';
import SearchScreen from '../app/search';
import { searchEverything } from '../src/features/global-search';
import { useAcademic, useCourses, useEvents, useGoals, useTasks } from '../src/features/queries';
import { useSessionStore } from '../src/store/session';
import type { AcademicItem, CampusEvent, Course, Goal, PersonalTask } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../src/features/queries', () => ({ useTasks: jest.fn(), useAcademic: jest.fn(), useCourses: jest.fn(), useGoals: jest.fn(), useEvents: jest.fn(), useAction: jest.fn() }));
jest.mock('../src/features/task-editor', () => ({ TaskEditor: ({ task }: { task: { title: string } }) => { const { Text } = jest.requireActual('react-native'); return <Text>Editing {task.title}</Text>; } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const fixture = snapshotFixture();
const course: Course = { id: '60000000-0000-4000-8000-000000000001', externalId: 'c', name: 'Cognitive Psychology', code: 'PSY 223', active: true, source: 'manual', color: 'plum' };
const tasks: PersonalTask[] = [
  { ...fixture.personalTasks[0], id: '20000000-0000-4000-8000-000000000001', title: 'Essay draft', description: 'Use the psychology reader', completedAt: null,
    checklist: [{ id: '30000000-0000-4000-8000-000000000001', title: 'Find café sources', done: true }] },
  { ...fixture.personalTasks[0], id: '20000000-0000-4000-8000-000000000002', title: 'Groceries', description: null, completedAt: '2026-10-01T00:00:00Z' },
];
const academic: AcademicItem[] = [{ id: '50000000-0000-4000-8000-000000000001', courseId: course.id, title: 'Midterm', kind: 'exam', due: null, submissionState: 'unsubmitted',
  source: 'manual', externalId: 'x', mainGoalDate: null, updatedAt: '2026-10-01T00:00:00Z' }];
const goals: Goal[] = [{ ...fixture.goals[0], title: 'Evening walk', pausedAt: null }];
const events: CampusEvent[] = [{ id: '40000000-0000-4000-8000-000000000001', title: 'Psychology club social', description: null, category: null, source: 'f', externalId: 'e',
  timing: { kind: 'timed', startsAt: '2026-10-20T01:00:00Z', endsAt: null }, location: 'Forum', url: null, saved: true }];
const sources = { tasks, academic, courses: [course], goals, events };

describe('searchEverything', () => {
  it('requires every word, ranks title starts first and searches steps, descriptions and course codes', () => {
    expect(searchEverything('psych', sources).results.map(row => [row.kind, row.title])).toEqual([
      ['event', 'Psychology club social'], ['course', 'Cognitive Psychology'], ['task', 'Essay draft'], ['coursework', 'Midterm']]);
    expect(searchEverything('cafe', sources).results.map(row => row.title)).toEqual(['Essay draft']);
    expect(searchEverything('essay reader', sources).results.map(row => row.title)).toEqual(['Essay draft']);
    expect(searchEverything('essay walk', sources).results).toEqual([]);
    expect(searchEverything('psy 223', sources).results[0]).toMatchObject({ kind: 'course', detail: 'PSY 223' });
  });
  it('describes results and reports unavailable lists', () => {
    expect(searchEverything('midterm', sources).results[0]).toMatchObject({ kind: 'coursework', detail: 'Exam · PSY 223' });
    expect(searchEverything('essay', sources).results[0].detail).toBe('Personal · 1/1 steps');
    expect(searchEverything('  ', sources).results).toEqual([]);
    expect(searchEverything('walk', { goals }).missing).toEqual(['tasks', 'academic', 'courses', 'events']);
  });
  it('sorts finished work after open work with the same score', () => {
    const done = { ...tasks[0], id: '20000000-0000-4000-8000-000000000003', title: 'Essay final', completedAt: '2026-10-01T00:00:00Z' };
    expect(searchEverything('essay', { tasks: [done, tasks[0]] }).results.map(row => row.title)).toEqual(['Essay draft', 'Essay final']);
  });
});

describe('search screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ session: { accessToken: 's', expiresAt: '2099-01-01T00:00:00Z', user: { id: '10000000-0000-4000-8000-000000000001',
      email: 's@example.test', displayName: 'S', timeZone: 'America/Edmonton', createdAt: '2026-01-01T00:00:00Z' } }, ready: true });
    jest.mocked(useTasks).mockReturnValue({ data: tasks } as ReturnType<typeof useTasks>);
    jest.mocked(useAcademic).mockReturnValue({ data: academic } as ReturnType<typeof useAcademic>);
    jest.mocked(useCourses).mockReturnValue({ data: [course] } as ReturnType<typeof useCourses>);
    jest.mocked(useGoals).mockReturnValue({ data: goals } as ReturnType<typeof useGoals>);
    jest.mocked(useEvents).mockReturnValue({ data: undefined } as ReturnType<typeof useEvents>);
  });
  it('searches as you type, notes incomplete lists and opens each kind of result', () => {
    render(<SearchScreen/>); expect(screen.getByText('Find anything in your plan.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Search CampusFlow'), 'psych');
    expect(screen.getByText('3 results')).toBeOnTheScreen(); expect(screen.getByText(/may be incomplete/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Course: Cognitive Psychology/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/course/[id]', params: { id: course.id } });
    fireEvent.press(screen.getByRole('button', { name: /^Coursework: Midterm/ })); expect(mockRouter.push).toHaveBeenLastCalledWith('/academics');
    fireEvent.press(screen.getByRole('button', { name: /^Task: Essay draft/ })); expect(screen.getByText('Editing Essay draft')).toBeOnTheScreen();
  });
  it('clears the query and explains no matches', () => {
    render(<SearchScreen/>); fireEvent.changeText(screen.getByLabelText('Search CampusFlow'), 'zzz');
    expect(screen.getByText(/No matches/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Clear search' })); expect(screen.getByText('Find anything in your plan.')).toBeOnTheScreen();
  });
});
