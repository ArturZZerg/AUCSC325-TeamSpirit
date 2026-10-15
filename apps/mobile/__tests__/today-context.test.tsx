import { render, screen } from '@testing-library/react-native';
import TodayScreen from '../app/(tabs)/today';
import { useAcademic, useAction, useCourses, useTasks, useToday } from '../src/features/queries';
import type { PlanItem, Today } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { push: jest.fn() } }));
jest.mock('../src/features/day-agenda', () => ({ DayAgenda: () => null }));
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useToday: jest.fn(), useTasks: jest.fn(), useAcademic: jest.fn(), useCourses: jest.fn() }));

const date = '2026-10-15', taskId = '10000000-0000-4000-8000-000000000001', itemId = '50000000-0000-4000-8000-000000000001', courseId = '60000000-0000-4000-8000-000000000001';
const row = (patch: Partial<PlanItem>): PlanItem => ({ key: `k:${patch.entityId}`, kind: 'personalTask', entityId: taskId, occurrenceKey: null, title: 'Essay',
  schedule: { kind: 'date', date }, due: null, state: 'today', isMainGoal: false, priority: 'medium', allowedActions: ['complete'], ...patch });
const data = (items: PlanItem[]): Today => ({ date, timeZone: 'America/Edmonton', generatedAt: '2026-10-15T12:00:00Z',
  sourceStatus: { availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null }, items, upcoming: [], campusEvents: [] });
const lists = (tasks: unknown, academic: unknown, courses: unknown) => {
  jest.mocked(useTasks).mockReturnValue({ data: tasks } as ReturnType<typeof useTasks>);
  jest.mocked(useAcademic).mockReturnValue({ data: academic } as ReturnType<typeof useAcademic>);
  jest.mocked(useCourses).mockReturnValue({ data: courses } as ReturnType<typeof useCourses>);
};
beforeEach(() => {
  jest.mocked(useAction).mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useToday).mockReturnValue({ date, timeZone: 'America/Edmonton', isLoading: false, isRefetching: false, refetch: jest.fn(),
    data: data([row({}), row({ kind: 'academic', entityId: itemId, title: 'Lab report', allowedActions: [] })]) } as unknown as ReturnType<typeof useToday>);
});

it('labels coursework with its course and shows task step progress from cached lists', () => {
  lists([{ ...snapshotFixture().personalTasks[0], id: taskId, recurrence: null, checklist: [{ id: '30000000-0000-4000-8000-000000000001', title: 'Outline', done: true },
    { id: '30000000-0000-4000-8000-000000000002', title: 'Draft', done: false }] }],
  [{ id: itemId, courseId }], [{ id: courseId, externalId: courseId, name: 'Cognitive Psychology', code: 'PSY 223', active: true, source: 'manual', color: 'plum' }]);
  render(<TodayScreen/>);
  expect(screen.getByText('PSY 223')).toBeOnTheScreen(); expect(screen.getByText('1/2 steps')).toBeOnTheScreen();
  expect(screen.getByText('TASK')).toBeOnTheScreen();
});
it('falls back to plain kind labels when lists are unavailable or empty', () => {
  lists(undefined, undefined, undefined); render(<TodayScreen/>);
  expect(screen.getByText('COURSEWORK')).toBeOnTheScreen(); expect(screen.queryByText(/steps$/)).toBeNull();
});
