import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { localDateAt } from '@campusflow/domain';
import Wellness from '../app/(tabs)/wellness';
import { useAction, useGoals, useGoalHistory, useWellness } from '../src/features/queries';
import { composeOfflineToday } from '../src/features/offline-today';
import { accountId, snapshotFixture } from './snapshot-fixture';

jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useGoals: jest.fn(), useGoalHistory: jest.fn(), useWellness: jest.fn() }));
let mockAccountZone = 'America/Edmonton';
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: mockAccountZone } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const save = jest.fn();
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-04T18:00:00Z')); jest.clearAllMocks(); save.mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useWellness).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useWellness>);
});
afterEach(() => { jest.useRealTimers(); });
it.each([
  ['America/Edmonton', 'Asia/Tokyo', '2026-10-05'],
  ['Asia/Tokyo', 'America/Edmonton', '2026-10-04'],
])('Wellness in %s addresses the same %s goal occurrence as cached Today', async (accountZone, goalZone, expected) => {
  mockAccountZone = accountZone;
  const snapshot = snapshotFixture(); const now = new Date().toISOString(); const date = localDateAt(now, accountZone);
  snapshot.timeZone = accountZone; snapshot.personalTasks = []; snapshot.goalCompletions = [];
  snapshot.coverage = { ...snapshot.coverage, from: date, through: date }; snapshot.goals[0].timeZone = goalZone;
  jest.mocked(useGoals).mockReturnValue({ data: snapshot.goals, isLoading: false } as ReturnType<typeof useGoals>);
  jest.mocked(useGoalHistory).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useGoalHistory>);
  const view = render(<Wellness/>);
  const today = composeOfflineToday(snapshot, accountId, accountZone, date, now)!;
  expect(today.items[0].occurrenceKey).toBe(expected);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Complete today' })); });
  expect(save).toHaveBeenCalledWith({ path: `/goals/${snapshot.goals[0].id}/complete`, body: { occurrenceKey: today.items[0].occurrenceKey, state: 'completed' } });
  snapshot.goalCompletions = [{ id: '40000000-0000-4000-8000-000000000001', goalId: snapshot.goals[0].id,
    occurrenceKey: expected, state: 'completed', completedAt: now, createdAt: now }];
  jest.mocked(useGoalHistory).mockReturnValue({ data: snapshot.goalCompletions, isLoading: false } as ReturnType<typeof useGoalHistory>);
  view.rerender(<Wellness/>); expect(screen.getByText('Completed today')).toBeOnTheScreen();
  expect(composeOfflineToday(snapshot, accountId, accountZone, date, now)!.items[0].state).toBe('completed');
});
