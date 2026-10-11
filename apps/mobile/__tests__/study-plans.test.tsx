import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal, RefreshControl } from 'react-native';
import StudyPlansScreen from '../app/study-plans';
import { useAction, useStudyPlans } from '../src/features/queries';
import { preparationFixture, planId } from './preparation-fixture';
import type { StudyPlan } from '@campusflow/contracts';
const mockPush = jest.fn(), mockReplace = jest.fn(); let mockToken = 'first'; let mockParams: { planId?: string | string[] } = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useLocalSearchParams: () => mockParams }));
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useStudyPlans: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09' }) }));
jest.mock('../src/features/use-agenda-clock', () => ({ useAgendaClock: () => '2025-03-09T18:00:00Z' }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { accessToken: mockToken, user: { id: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton' } } }) }));
jest.mock('../src/features/task-editor', () => ({ TaskEditor: ({ task, onClose }: { task: { title: string }; onClose(): void }) => {
  const { Text, Pressable } = jest.requireActual('react-native'); return <Pressable onPress={onClose}><Text>Editing {task.title}</Text></Pressable>;
} }));
jest.mock('../src/features/task-reminder-editor', () => ({ TaskReminderEditor: ({ task }: { task: { title: string } }) => {
  const { Text } = jest.requireActual('react-native'); return <Text>Reminder for {task.title}</Text>;
} }));
const save = jest.fn(), refetch = jest.fn();
function show(data: StudyPlan[] | undefined = [preparationFixture()], overrides = {}) {
  jest.mocked(useStudyPlans).mockReturnValue({ data, isLoading: false, isRefetching: false, isCached: false, refetch, ...overrides } as unknown as ReturnType<typeof useStudyPlans>);
}
beforeEach(() => { jest.clearAllMocks(); mockToken = 'first'; mockParams = {}; save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>); show(); });
it('shows progress, earlier sessions and a focus target without writing', () => {
  render(<StudyPlansScreen/>); expect(screen.getByText('0 of 2 sessions completed · 100 min estimated left')).toBeOnTheScreen();
  expect(screen.getByText(/1 session was scheduled earlier/)).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Focus next session'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/focus', params: { taskId: preparationFixture().tasks[0].id } }); expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Plan from coursework')); expect(mockPush).toHaveBeenLastCalledWith('/academics');
  fireEvent.press(screen.getByText('My study report')); expect(mockPush).toHaveBeenLastCalledWith('/study-report');
});
it('uses existing completion and editing/reminder flows for the exact session', async () => {
  render(<StudyPlansScreen/>); fireEvent.press(screen.getByText('Show sessions'));
  await act(async () => fireEvent.press(screen.getAllByText('Complete session')[0]));
  expect(save).toHaveBeenCalledWith({ path: `/tasks/${preparationFixture().tasks[0].id}/complete`, body: { completed: true } });
  fireEvent.press(screen.getAllByText('Edit session')[0]); expect(screen.getByText('Editing Recall key topics')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Editing Recall key topics')); fireEvent.press(screen.getAllByText('Reminder')[0]); expect(screen.getByText('Reminder for Recall key topics')).toBeOnTheScreen();
});
it('updates completion from confirmed query records and offers undo', async () => {
  const plan = preparationFixture(); plan.tasks[0].completedAt = '2025-03-09T18:00:00Z'; show([plan]); render(<StudyPlansScreen/>);
  expect(screen.getByText('1 of 2 sessions completed · 50 min estimated left')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 50 });
  fireEvent.press(screen.getByText('Show sessions')); await act(async () => fireEvent.press(screen.getByText('Undo completion')));
  expect(save).toHaveBeenCalledWith({ path: `/tasks/${plan.tasks[0].id}/complete`, body: { completed: false } });
});
it('retains progress and permits retry after a failed completion', async () => {
  save.mockRejectedValueOnce(new Error('Offline')); render(<StudyPlansScreen/>); fireEvent.press(screen.getByText('Show sessions'));
  await act(async () => fireEvent.press(screen.getAllByText('Complete session')[0]));
  expect(screen.getByRole('alert')).toHaveTextContent('Offline'); expect(screen.getByText('0 of 2 sessions completed · 100 min estimated left')).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getAllByText('Complete session')[0])); expect(save).toHaveBeenCalledTimes(2);
});
it('blocks duplicate/pending writes and opening editors during completion', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); render(<StudyPlansScreen/>); fireEvent.press(screen.getByText('Show sessions'));
  act(() => { const button = screen.getAllByText('Complete session')[0]; fireEvent.press(button); fireEvent.press(button); });
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getAllByRole('button', { name: 'Edit session' })[0]).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Archive plan' })).toBeDisabled(); await act(async () => resolve());
});
it('renames with a retained failed draft and protects modal dismissal while saving', async () => {
  save.mockRejectedValueOnce(new Error('Offline')); render(<StudyPlansScreen/>); fireEvent.press(screen.getByText('Rename plan'));
  fireEvent.changeText(screen.getByLabelText('Plan name'), 'My revised plan'); await act(async () => fireEvent.press(screen.getByText('Save plan name')));
  expect(screen.getByLabelText('Plan name')).toHaveDisplayValue('My revised plan'); expect(screen.getByRole('alert')).toHaveTextContent('Offline');
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
  act(() => fireEvent.press(screen.getByText('Save plan name'))); fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled(); await act(async () => resolve());
  expect(save).toHaveBeenLastCalledWith({ path: `/study-plans/${planId}`, method: 'PATCH', body: { title: 'My revised plan' } }); expect(screen.queryByLabelText('Plan name')).toBeNull();
});
it('rejects an empty rename without a mutation', async () => {
  render(<StudyPlansScreen/>); fireEvent.press(screen.getByText('Rename plan')); fireEvent.changeText(screen.getByLabelText('Plan name'), ' ');
  await act(async () => fireEvent.press(screen.getByText('Save plan name'))); expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent(/1–240/);
});
it('archives/restores metadata without changing preparation tasks', async () => {
  const ui = render(<StudyPlansScreen/>); await act(async () => fireEvent.press(screen.getByText('Archive plan')));
  expect(save).toHaveBeenCalledWith({ path: `/study-plans/${planId}`, method: 'PATCH', body: { archived: true } });
  show([preparationFixture({ archivedAt: '2025-03-09T18:00:00Z' })]); ui.rerender(<StudyPlansScreen/>);
  fireEvent.press(screen.getByRole('radio', { name: 'Archived' })); await act(async () => fireEvent.press(screen.getByText('Restore plan')));
  expect(save).toHaveBeenLastCalledWith({ path: `/study-plans/${planId}`, method: 'PATCH', body: { archived: false } });
});
it('searches session content and preserves finished/archived grouping', () => {
  const plan = preparationFixture(); plan.tasks = plan.tasks.map(task => ({ ...task, completedAt: '2025-03-09T18:00:00Z' })); show([plan]); render(<StudyPlansScreen/>);
  expect(screen.getByText('No plans in this view.')).toBeOnTheScreen(); fireEvent.press(screen.getByRole('radio', { name: 'Finished' }));
  expect(screen.getByText('PREPARATION FINISHED')).toBeOnTheScreen(); expect(screen.queryByText('Focus next session')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Search study plans'), 'graphs'); expect(screen.getByText('My graph revision')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('Search study plans'), 'missing'); expect(screen.getByText('No plans in this view.')).toBeOnTheScreen();
});
it('keeps unavailable reads distinct from empty/loading/cached data and refreshes', () => {
  show([], { data: undefined, error: new Error('Offline') }); const ui = render(<StudyPlansScreen/>);
  expect(screen.getByText('Study plans are unavailable.')).toBeOnTheScreen(); expect(screen.queryByText('Give your next deadline a plan.')).toBeNull();
  fireEvent.press(screen.getByText('Retry study plans')); expect(refetch).toHaveBeenCalledTimes(1);
  show([preparationFixture()], { isCached: true, error: new Error('Offline') }); ui.rerender(<StudyPlansScreen/>);
  expect(screen.getByText('Showing saved plans. Refresh to check changes made elsewhere.')).toBeOnTheScreen();
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'); expect(refetch).toHaveBeenCalledTimes(2);
});
it('labels missing estimates, changed deadlines and source deletion honestly', () => {
  const plan = preparationFixture(); plan.tasks[0].estimatedMinutes = null; plan.academicItem = { ...plan.academicItem!, due: null }; show([plan]); const ui = render(<StudyPlansScreen/>);
  expect(screen.getByText(/50 min estimated left \+ 1 without an estimate/)).toBeOnTheScreen();
  expect(screen.getByText('Coursework deadline: No deadline')).toBeOnTheScreen(); expect(screen.getByText(/coursework deadline changed/)).toBeOnTheScreen();
  show([{ ...plan, academicItem: null, academicItemId: null }]); ui.rerender(<StudyPlansScreen/>);
  expect(screen.getByText('The original coursework is no longer available. Your preparation is saved.')).toBeOnTheScreen();
});
it('discards private filters, expanded state and rename drafts on a session change', () => {
  const ui = render(<StudyPlansScreen/>); fireEvent.changeText(screen.getByLabelText('Search study plans'), 'graph'); fireEvent.press(screen.getByText('Show sessions'));
  fireEvent.press(screen.getByText('Rename plan')); fireEvent.changeText(screen.getByLabelText('Plan name'), 'Private plan');
  mockToken = 'next-session'; ui.rerender(<StudyPlansScreen/>);
  expect(screen.getByLabelText('Search study plans')).toHaveDisplayValue(''); expect(screen.queryByLabelText('Plan name')).toBeNull();
  expect(screen.queryByText('Hide sessions')).toBeNull(); expect(save).not.toHaveBeenCalled();
});
it.each(['archived', 'finished'] as const)('opens the exact %s linked plan with sessions expanded', view => {
  const target = preparationFixture({ archivedAt: view === 'archived' ? '2025-03-09T18:00:00Z' : null });
  if (view === 'finished') target.tasks = target.tasks.map(task => ({ ...task, completedAt: '2025-03-09T18:00:00Z' }));
  mockParams = { planId }; show([preparationFixture({ id: '60000000-0000-4000-8000-000000000002', title: 'Unrelated plan', tasks: [] }), target]);
  render(<StudyPlansScreen/>); expect(screen.getByText('Your selected preparation plan')).toBeOnTheScreen();
  expect(screen.getByText('Recall key topics')).toBeOnTheScreen(); expect(screen.queryByText('Unrelated plan')).toBeNull();
  fireEvent.press(screen.getByText('Browse all study plans'));
  fireEvent.press(screen.getByRole('radio', { name: view === 'archived' ? 'Archived' : 'Finished' }));
  fireEvent.changeText(screen.getByLabelText('Search study plans'), 'missing');
  expect(screen.queryByText('Your selected preparation plan')).toBeNull(); expect(screen.getByText('No plans in this view.')).toBeOnTheScreen();
});
it('keeps missing or malformed targeted links honest and retryable', () => {
  mockParams = { planId }; show([], { isCached: true }); const ui = render(<StudyPlansScreen/>);
  expect(screen.getByText(/not in the available information/)).toBeOnTheScreen(); expect(screen.queryByText('Give your next deadline a plan.')).toBeNull();
  fireEvent.press(screen.getByText('Refresh selected plan')); expect(refetch).toHaveBeenCalledTimes(1);
  mockParams = { planId: [planId, planId] }; ui.rerender(<StudyPlansScreen/>);
  expect(screen.getByText('This plan link is invalid. Choose a plan below.')).toBeOnTheScreen();
});
