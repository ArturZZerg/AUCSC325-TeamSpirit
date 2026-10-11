import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal, RefreshControl } from 'react-native';
import WorkloadScreen from '../app/workload';
import { useAcademic, useAction, useStudyPlans, useTasks } from '../src/features/queries';
import { preparationFixture, planId } from './preparation-fixture';
import { quiz } from './academic-fixture';
import type { AcademicItem, PersonalTask } from '../src/lib/types';
import type { StudyPlan } from '@campusflow/contracts';
const mockPush = jest.fn(), mockReplace = jest.fn(); let mockToken = 'first', mockResume = 0;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('../src/features/queries', () => ({ useTasks: jest.fn(), useAcademic: jest.fn(), useStudyPlans: jest.fn(), useAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09', resumeCount: mockResume }) }));
jest.mock('../src/features/use-agenda-clock', () => ({ useAgendaClock: () => '2025-03-09T18:00:00Z' }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: mockToken, user: { id: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton' } } }) }));
const save = jest.fn(), refreshTasks = jest.fn(), refreshAcademic = jest.fn(), refreshPlans = jest.fn();
const looseTask = (): PersonalTask => ({ ...preparationFixture().tasks[0], studyPlanId: null, title: 'Read chapter notes', scheduled: null });
function show(tasks: PersonalTask[] | undefined, academic: AcademicItem[] | undefined, plans: StudyPlan[] | undefined, overrides = {}) {
  const query = { isLoading: false, isRefetching: false, isCached: false, ...overrides };
  jest.mocked(useTasks).mockReturnValue({ ...query, data: tasks, refetch: refreshTasks } as unknown as ReturnType<typeof useTasks>);
  jest.mocked(useAcademic).mockReturnValue({ ...query, data: academic, refetch: refreshAcademic } as unknown as ReturnType<typeof useAcademic>);
  jest.mocked(useStudyPlans).mockReturnValue({ ...query, data: plans, refetch: refreshPlans } as unknown as ReturnType<typeof useStudyPlans>);
}
beforeEach(() => { jest.clearAllMocks(); mockToken = 'first'; mockResume = 0; save.mockReset().mockResolvedValue({}); show([looseTask()], [quiz], []);
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>); });
it('connects loose tasks, preparation and weekly windows without writing on open', () => {
  render(<WorkloadScreen/>); expect(screen.getByText('Read chapter notes')).toBeOnTheScreen(); expect(screen.getByText('Graph quiz')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Find a study window')); expect(mockPush).toHaveBeenLastCalledWith('/planner');
  fireEvent.press(screen.getByText('Focus on task')); expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/focus', params: { taskId: looseTask().id } });
  expect(save).not.toHaveBeenCalled();
});
it('reviews an existing archived plan by exact identity without offering another creation', () => {
  show([preparationFixture().tasks[0]], [quiz], [preparationFixture({ archivedAt: '2025-03-09T18:00:00Z' })]); render(<WorkloadScreen/>);
  fireEvent.press(screen.getByText('Open study plan')); expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/study-plans', params: { planId } });
  fireEvent.press(screen.getByRole('radio', { name: 'Later' })); fireEvent.press(screen.getByText('Review preparation'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/study-plans', params: { planId } }); expect(screen.queryByText('Build preparation plan')).toBeNull();
});
it('edits the exact task, retains a failed schedule draft and protects a pending retry', async () => {
  save.mockRejectedValueOnce(new Error('Offline')); render(<WorkloadScreen/>); fireEvent.press(screen.getByText('Schedule task'));
  fireEvent.press(screen.getByRole('radio', { name: 'Scheduled date only' })); fireEvent.changeText(screen.getByLabelText('Scheduled date'), '2025-03-10');
  await act(async () => fireEvent.press(screen.getByText('Save task')));
  expect(screen.getByRole('alert')).toHaveTextContent('Offline'); expect(screen.getByLabelText('Scheduled date')).toHaveDisplayValue('2025-03-10');
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
  await act(async () => { const button = screen.getByText('Save task'); fireEvent.press(button); fireEvent.press(button); });
  expect(save).toHaveBeenCalledTimes(2); fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose'); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await act(async () => resolve()); expect(screen.queryByLabelText('Scheduled date')).toBeNull();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ path: `/tasks/${looseTask().id}`, method: 'PATCH', body: expect.objectContaining({ scheduled: { kind: 'date', date: '2025-03-10' } }) }));
  expect(save.mock.calls[1][0].body.due).toEqual(looseTask().due);
});
it('previews and explicitly saves coursework preparation using the existing retry-safe editor', async () => {
  render(<WorkloadScreen/>); fireEvent.press(screen.getByText('Build preparation plan')); fireEvent.press(screen.getByText('Preview my sessions'));
  expect(save).not.toHaveBeenCalled(); fireEvent.changeText(screen.getByLabelText('Session 1 title'), 'Review lecture notes');
  await act(async () => fireEvent.press(screen.getByText('Save study plan')));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ path: '/study-plans', method: 'POST', body: expect.objectContaining({ academicItemId: quiz.id }) }));
  expect(save.mock.calls[0][0].body.sessions[0].title).toBe('Review lecture notes'); expect(mockPush).toHaveBeenLastCalledWith('/study-plans');
});
it.each([{ isCached: true }, { error: new Error('Offline') }, { isRefetching: true }])('withholds creation when plan absence cannot be confirmed: %p', overrides => {
  show([looseTask()], [quiz], [], overrides); render(<WorkloadScreen/>); expect(screen.queryByText('Build preparation plan')).toBeNull();
  fireEvent.press(screen.getByText('Check preparation status')); expect(refreshPlans).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
});
it('distinguishes missing reads from empty work and retains partial tasks', () => {
  show(undefined, undefined, undefined, { error: new Error('Offline') }); const ui = render(<WorkloadScreen/>);
  expect(screen.queryByText('Your next steps have a place.')).toBeNull(); expect(screen.queryByText('to revisit')).toBeNull();
  expect(screen.getByText(/Tasks, Coursework, Study plans: unavailable/)).toBeOnTheScreen();
  show([looseTask()], undefined, undefined); ui.rerender(<WorkloadScreen/>); expect(screen.getByText('Read chapter notes')).toBeOnTheScreen();
  show([], [], []); ui.rerender(<WorkloadScreen/>); expect(screen.getByText('Your next steps have a place.')).toBeOnTheScreen();
});
it('refreshes available sources, searches and isolates private editors across accounts', () => {
  const ui = render(<WorkloadScreen/>); fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(refreshTasks).toHaveBeenCalledTimes(1); expect(refreshAcademic).toHaveBeenCalledTimes(1); expect(refreshPlans).toHaveBeenCalledTimes(1);
  fireEvent.changeText(screen.getByLabelText('Search workload'), 'chapter'); fireEvent.press(screen.getByText('Schedule task'));
  fireEvent.changeText(screen.getByLabelText('Title'), 'Private draft'); mockToken = 'second'; ui.rerender(<WorkloadScreen/>);
  expect(screen.queryByLabelText('Title')).toBeNull(); expect(screen.getByLabelText('Search workload')).toHaveDisplayValue(''); expect(save).not.toHaveBeenCalled();
  mockResume++; ui.rerender(<WorkloadScreen/>); expect(refreshTasks).toHaveBeenCalledTimes(2); expect(refreshAcademic).toHaveBeenCalledTimes(2);
});
it('provides the repeating occurrence workspace instead of guessing completions', () => {
  show([{ ...looseTask(), recurrence: { frequency: 'daily', interval: 1 } }], [], []); render(<WorkloadScreen/>);
  expect(screen.queryByText('Read chapter notes')).toBeNull(); fireEvent.press(screen.getByText('Open today’s routines'));
  expect(mockPush).toHaveBeenCalledWith('/today');
});
