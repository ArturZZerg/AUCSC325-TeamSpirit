import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import Reminders from '../app/reminders';
import { reminderRows } from '../src/features/reminder-center';
import * as queries from '../src/features/queries';
import { useSessionStore } from '../src/store/session';
import { snapshotFixture, accountId } from './snapshot-fixture';
import { eventFixture } from './event-fixture';
import type { AcademicItem, Reminder, Session } from '../src/lib/types';
const mockRouter = { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
let mockParams: { reminderId?: string | string[]; accountId?: string | string[] } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('../src/features/queries', () => ({ useTasks: jest.fn(), useAcademic: jest.fn(), useGoals: jest.fn(), useEvents: jest.fn(), useReminders: jest.fn(), usePreferences: jest.fn(), useAction: jest.fn(), useAcademicReminder: jest.fn() }));
jest.mock('../src/services/reminders', () => ({ clearScheduledReminders: jest.fn() }));
jest.mock('../src/services/cache', () => ({ clearAccountCache: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const snapshot = snapshotFixture(), zone = snapshot.timeZone;
const task = { ...snapshot.personalTasks[0], recurrence: null, title: 'Draft my essay', reminder: { kind: 'instant' as const, at: '2025-03-08T19:00:00Z' } };
const academic: AcademicItem = { id: '60000000-0000-4000-8000-000000000001', courseId: null, title: 'Midterm', kind: 'quiz', due: { kind: 'date', date: '2025-03-10' }, submissionState: 'unsubmitted', source: 'manual', externalId: 'manual', mainGoalDate: null, updatedAt: snapshot.capturedAt };
const event = eventFixture(), goal = snapshot.goals[0];
const reminder: Reminder = { id: '70000000-0000-4000-8000-000000000001', targetKind: 'personalTask', targetId: task.id, occurrenceKey: null, fireAt: '2025-03-08T19:00:00Z', enabled: true };
const preferences = { academicEnabled: true, personalEnabled: true, goalEnabled: true, eventEnabled: true, dailyOverviewEnabled: false, quietHoursStart: null, quietHoursEnd: null };
const session: Session = { accessToken: 'center-test', expiresAt: '2099-01-01T00:00:00Z', user: { id: accountId, email: 'center@example.test', displayName: 'Center', timeZone: zone, createdAt: snapshot.capturedAt } };
const refresh = jest.fn(), save = jest.fn();
function query<T>(data: T | undefined, overrides = {}) { return { data, isLoading: false, isCached: false, isRefetching: false, refetch: refresh, ...overrides }; }
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2025-03-08T18:00:00Z')); jest.clearAllMocks(); mockParams = {};
  useSessionStore.setState({ session, ready: true }); refresh.mockReset().mockResolvedValue({}); save.mockReset().mockResolvedValue({});
  jest.mocked(queries.useReminders).mockReturnValue(query([reminder]) as unknown as ReturnType<typeof queries.useReminders>);
  jest.mocked(queries.usePreferences).mockReturnValue(query(preferences) as unknown as ReturnType<typeof queries.usePreferences>);
  jest.mocked(queries.useTasks).mockReturnValue(query([task]) as unknown as ReturnType<typeof queries.useTasks>);
  jest.mocked(queries.useAcademic).mockReturnValue(query([academic]) as unknown as ReturnType<typeof queries.useAcademic>);
  jest.mocked(queries.useGoals).mockReturnValue(query([goal]) as unknown as ReturnType<typeof queries.useGoals>);
  jest.mocked(queries.useEvents).mockReturnValue(query([event]) as unknown as ReturnType<typeof queries.useEvents>);
  jest.mocked(queries.useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as unknown as ReturnType<typeof queries.useAction>);
  jest.mocked(queries.useAcademicReminder).mockReturnValue(query({ academicItemId: academic.id, leadMinutes: 60 }) as unknown as ReturnType<typeof queries.useAcademicReminder>);
});
afterEach(() => jest.useRealTimers());
it('opens the selected owned task and hands its exact identity to Focus without saving or starting anything', () => {
  mockParams = { reminderId: reminder.id, accountId }; render(<Reminders/>);
  expect(screen.getByRole('button', { name: 'Open reminder: Draft my essay' }).props.accessibilityState.expanded).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Focus on this task' }));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/focus', params: { taskId: task.id } }); expect(save).not.toHaveBeenCalled();
});
it('opens the existing task and reminder editors for the exact saved subject', async () => {
  mockParams = { reminderId: reminder.id }; render(<Reminders/>);
  fireEvent.press(screen.getByRole('button', { name: 'Edit this reminder' }));
  expect(screen.getByText('Task reminder')).toBeOnTheScreen(); expect(screen.getAllByText(task.title)).toHaveLength(2);
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.press(screen.getByRole('button', { name: 'Edit this task' })); expect(screen.getByDisplayValue(task.title)).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled(); await act(async () => {});
});
it.each([['academicItem', academic.id, academic.title, 'Coursework reminder'], ['goal', goal.id, goal.title, 'Goal reminder'], ['savedEvent', event.id, event.title, 'Event reminder']] as const)('resolves %s from owned records and reuses its reminder controls', (targetKind, targetId, title, heading) => {
  jest.mocked(queries.useReminders).mockReturnValue(query([{ ...reminder, targetKind, targetId }]) as unknown as ReturnType<typeof queries.useReminders>);
  mockParams = { reminderId: reminder.id }; render(<Reminders/>); expect(screen.getByText(title)).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Edit this reminder' })); expect(screen.getByText(heading)).toBeOnTheScreen(); expect(save).not.toHaveBeenCalled();
});
it('withholds Focus for recurring or already completed tasks', () => {
  mockParams = { reminderId: reminder.id };
  jest.mocked(queries.useTasks).mockReturnValue(query([{ ...task, completedAt: snapshot.capturedAt }]) as unknown as ReturnType<typeof queries.useTasks>);
  const view = render(<Reminders/>); expect(screen.queryByRole('button', { name: 'Focus on this task' })).toBeNull();
  jest.mocked(queries.useTasks).mockReturnValue(query([{ ...task, recurrence: { frequency: 'daily', interval: 1 } }]) as unknown as ReturnType<typeof queries.useTasks>);
  view.rerender(<Reminders/>); expect(screen.queryByRole('button', { name: 'Focus on this task' })).toBeNull();
});
it('searches locally, switches upcoming/earlier views and refreshes all available reads', () => {
  const earlier = { ...reminder, id: '70000000-0000-4000-8000-000000000002', targetKind: 'goal' as const, targetId: goal.id, fireAt: '2025-03-08T17:00:00Z' };
  jest.mocked(queries.useReminders).mockReturnValue(query([earlier, reminder]) as unknown as ReturnType<typeof queries.useReminders>);
  render(<Reminders/>); expect(screen.queryByText(goal.title)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Reminder view: earlier' })); expect(screen.getByText(goal.title)).toBeOnTheScreen(); expect(screen.queryByText(task.title)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Reminder view: all' })); fireEvent.changeText(screen.getByLabelText('Search reminders'), 'ESSAY');
  expect(screen.getByText(task.title)).toBeOnTheScreen(); expect(screen.queryByText(goal.title)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Refresh reminders' })); expect(refresh).toHaveBeenCalledTimes(6);
  expect(refresh).toHaveBeenCalledWith({ cancelRefetch: false });
});
it('keeps cached reminders useful after failed refresh and never describes earlier times as delivered', () => {
  jest.mocked(queries.useReminders).mockReturnValue(query([reminder], { isCached: true, error: new Error('Offline') }) as unknown as ReturnType<typeof queries.useReminders>);
  render(<Reminders/>); expect(screen.getByText(task.title)).toBeOnTheScreen(); expect(screen.getByText(/Showing saved information. Connect/)).toBeOnTheScreen();
  expect(screen.getByText(/not a delivery history/)).toBeOnTheScreen(); expect(screen.queryByText('No saved reminders yet.')).toBeNull();
});
it('moves a passed time out of Upcoming while the screen remains foreground', () => {
  const previous = AppState.currentState; AppState.currentState = 'active';
  try {
    jest.mocked(queries.useReminders).mockReturnValue(query([{ ...reminder, fireAt: '2025-03-08T18:00:30Z' }]) as unknown as ReturnType<typeof queries.useReminders>);
    render(<Reminders/>); expect(screen.getByText(task.title)).toBeOnTheScreen();
    act(() => jest.advanceTimersByTime(60_000)); expect(screen.queryByText(task.title)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Reminder view: earlier' })); expect(screen.getByText('Time passed')).toBeOnTheScreen();
  } finally { AppState.currentState = previous; }
});
it('distinguishes unavailable reminders, missing subjects and confirmed empty reads', () => {
  jest.mocked(queries.useReminders).mockReturnValue(query(undefined) as unknown as ReturnType<typeof queries.useReminders>);
  const view = render(<Reminders/>); expect(screen.getByText('Reminders are unavailable.')).toBeOnTheScreen(); expect(screen.queryByText('No saved reminders yet.')).toBeNull();
  jest.mocked(queries.useReminders).mockReturnValue(query([reminder]) as unknown as ReturnType<typeof queries.useReminders>);
  jest.mocked(queries.useTasks).mockReturnValue(query(undefined) as unknown as ReturnType<typeof queries.useTasks>); mockParams = { reminderId: reminder.id };
  view.rerender(<Reminders/>); expect(screen.getByText(/does not confirm deletion/)).toBeOnTheScreen(); expect(screen.queryByRole('button', { name: 'Edit this reminder' })).toBeNull();
  jest.mocked(queries.useReminders).mockReturnValue(query([]) as unknown as ReturnType<typeof queries.useReminders>); mockParams = {};
  view.rerender(<Reminders/>); expect(screen.getByText('No saved reminders yet.')).toBeOnTheScreen();
});
it.each([{ reminderId: 'invalid' }, { reminderId: [reminder.id, reminder.id] }, { reminderId: reminder.id, accountId: 'other-account' }])('rejects invalid, repeated or different-owner links %j', params => {
  mockParams = params; render(<Reminders/>); expect(screen.getByText('This reminder link is unavailable.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Edit this reminder' })).toBeNull();
});
it('explains a stale selected identity without inventing a target', () => {
  mockParams = { reminderId: '70000000-0000-4000-8000-000000000099' }; render(<Reminders/>);
  expect(screen.getByText('This reminder is not in your saved information.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Focus on this task' })).toBeNull(); fireEvent.press(screen.getByRole('button', { name: 'Browse saved reminders' }));
  expect(mockRouter.setParams).toHaveBeenCalledWith({ reminderId: undefined, accountId: undefined });
});
it('unmounts private editor state on account switch and on sign-out', () => {
  mockParams = { reminderId: reminder.id, accountId }; render(<Reminders/>); fireEvent.press(screen.getByRole('button', { name: 'Edit this reminder' }));
  act(() => useSessionStore.setState({ session: { ...session, accessToken: 'new-token', user: { ...session.user, id: '10000000-0000-4000-8000-000000000002' } } }));
  expect(screen.queryByText('Task reminder')).toBeNull(); expect(screen.queryByRole('button', { name: 'Edit this reminder' })).toBeNull();
  act(() => useSessionStore.setState({ session: null })); expect(screen.queryByText(task.title)).toBeNull();
});
it('closes an existing local-time editor when the same account adopts a different timezone', () => {
  mockParams = { reminderId: reminder.id, accountId }; render(<Reminders/>); fireEvent.press(screen.getByRole('button', { name: 'Edit this reminder' }));
  expect(screen.getByText('Task reminder')).toBeOnTheScreen();
  act(() => useSessionStore.setState({ session: { ...session, user: { ...session.user, timeZone: 'Pacific/Honolulu' } } }));
  expect(screen.queryByText('Task reminder')).toBeNull(); expect(screen.getByText(/2025-03-08 09:00 · Pacific\/Honolulu/)).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled();
});
it('derives quiet-hour times across DST and never invents enabled preferences or unsaved event ownership', () => {
  const quiet = reminderRows([{ ...reminder, fireAt: '2025-03-09T05:30:00Z' }], { tasks: [task] }, zone, { ...preferences, quietHoursStart: '22:00', quietHoursEnd: '07:00' })[0];
  expect(new Date(quiet.fireAt).toISOString()).toBe('2025-03-09T13:00:00.000Z'); expect(quiet.delayed).toBe(true);
  expect(reminderRows([reminder], { tasks: [task] }, zone)[0].categoryEnabled).toBeUndefined();
  expect(reminderRows([{ ...reminder, targetKind: 'savedEvent', targetId: event.id }], { events: [{ ...event, saved: false }] }, zone, preferences)[0].subject).toBeUndefined();
  expect(reminderRows([reminder], {}, zone, { ...preferences, personalEnabled: false })[0].categoryEnabled).toBe(false);
});
