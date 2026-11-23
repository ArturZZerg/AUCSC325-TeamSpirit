import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TodayScreen from '../app/(tabs)/today';
import { useAction, useTasks, useToday } from '../src/features/queries';
import type { PersonalTask, PlanItem, Today } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { push: jest.fn() } }));
jest.mock('../src/features/day-agenda', () => ({ DayAgenda: () => null }));
jest.mock('../src/features/up-next-card', () => ({ UpNextCard: () => null }));
jest.mock('../src/features/queries', () => ({
  useTasks: jest.fn(), useToday: jest.fn(), useAction: jest.fn(),
  useAcademic: () => ({ data: [] }), useCourses: () => ({ data: [] }),
}));
const task: PersonalTask = { ...snapshotFixture().personalTasks[0], title: 'Prepare for lab', recurrence: null, completedAt: null,
  checklist: [{ id: '30000000-0000-4000-8000-000000000001', title: 'Read instructions', done: false }] };
const item: PlanItem = { key: 'personalTask:' + task.id, kind: 'personalTask', entityId: task.id, occurrenceKey: null,
  title: task.title, due: null, schedule: null, state: 'today', isMainGoal: false, priority: 'medium', allowedActions: ['complete'] };
const save = jest.fn();
function tasks(value: PersonalTask[]) {
  jest.mocked(useTasks).mockReturnValue({ data: value, isLoading: false } as ReturnType<typeof useTasks>);
}
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  const data: Today = { date: '2026-11-15', timeZone: 'UTC', generatedAt: '2026-11-15T12:00:00Z',
    sourceStatus: { availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null },
    items: [item], upcoming: [], campusEvents: [] };
  jest.mocked(useToday).mockReturnValue({ date: data.date, timeZone: data.timeZone, data, isLoading: false,
    isRefetching: false, refetch: jest.fn() } as unknown as ReturnType<typeof useToday>);
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  tasks([task]);
});
it('shows and toggles a saved task checklist in Today To do using the task step endpoint', async () => {
  const view = render(<TodayScreen/>);
  expect(screen.getByText('To do')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: 'Read instructions' })).not.toBeChecked();
  await act(async () => { fireEvent.press(screen.getByRole('checkbox', { name: 'Read instructions' })); });
  expect(save).toHaveBeenCalledWith({ path: '/tasks/' + task.id + '/checklist/' + task.checklist![0].id,
    method: 'PATCH', body: { done: true } });
  tasks([{ ...task, checklist: [{ ...task.checklist![0], done: true }] }]);
  view.rerender(<TodayScreen/>);
  expect(screen.getByRole('checkbox', { name: 'Read instructions' })).toBeChecked();
  expect(screen.getByLabelText('1 of 1 steps done')).toBeOnTheScreen();
  await act(async () => { fireEvent.press(screen.getByRole('checkbox', { name: 'Read instructions' })); });
  expect(save).toHaveBeenLastCalledWith({ path: '/tasks/' + task.id + '/checklist/' + task.checklist![0].id,
    method: 'PATCH', body: { done: false } });
});
it('shows a failed step save without marking it complete, and tolerates missing task details', async () => {
  save.mockRejectedValueOnce(new Error('Offline'));
  const view = render(<TodayScreen/>);
  await act(async () => { fireEvent.press(screen.getByRole('checkbox', { name: 'Read instructions' })); });
  expect(screen.getByText('Offline')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: 'Read instructions' })).not.toBeChecked();
  tasks([]); view.rerender(<TodayScreen/>);
  expect(screen.queryByRole('checkbox', { name: 'Read instructions' })).toBeNull();
  expect(screen.getByText(task.title)).toBeOnTheScreen();
});
