import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TodayScreen from '../app/(tabs)/today';
import { useAction, useClasses, usePlanningSnapshot, useToday } from '../src/features/queries';
import { classFixture } from './class-fixture';
import { snapshotFixture } from './snapshot-fixture';
const save = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { push: jest.fn() } }));
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useClasses: jest.fn(), usePlanningSnapshot: jest.fn(), useToday: jest.fn() }));
jest.mock('../src/features/use-agenda-clock', () => ({ useAgendaClock: () => '2025-03-10T14:00:00Z' }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { id: '10000000-0000-4000-8000-000000000001' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useClasses).mockReturnValue({ data: [classFixture()], refetch: jest.fn() } as unknown as ReturnType<typeof useClasses>);
  jest.mocked(usePlanningSnapshot).mockReturnValue({ data: { ...snapshotFixture(), personalTasks: [] }, refetch: jest.fn() } as unknown as ReturnType<typeof usePlanningSnapshot>);
  jest.mocked(useToday).mockReturnValue({ date: '2025-03-10', timeZone: 'America/Edmonton', isLoading: false, isRefetching: false, refetch: jest.fn() } as unknown as ReturnType<typeof useToday>);
});
it('books a suggested window only after review/save through the existing task API', async () => {
  render(<TodayScreen/>); fireEvent.press(screen.getByText('Find study time')); fireEvent.press(screen.getByText('Plan 30 min at 8:00 AM'));
  expect(save).not.toHaveBeenCalled(); expect(screen.getByLabelText('Title')).toHaveDisplayValue('Study block');
  expect(screen.getByLabelText('Estimated minutes (optional)')).toHaveDisplayValue('30');
  fireEvent.changeText(screen.getByLabelText('Title'), 'Review biology notes'); fireEvent.press(screen.getByText('Save task'));
  await waitFor(() => expect(screen.queryByText('Save task')).toBeNull());
  expect(save).toHaveBeenCalledWith({ path: '/tasks', method: 'POST', body: expect.objectContaining({
    title: 'Review biology notes', category: 'university', scheduled: { kind: 'instant', at: '2025-03-10T14:00:00Z' }, estimatedMinutes: 30,
  }) });
});
it('does not create a task on cancellation and retains offline booking drafts', async () => {
  render(<TodayScreen/>); fireEvent.press(screen.getByText('Find study time')); fireEvent.press(screen.getByText('Plan 30 min at 8:00 AM'));
  fireEvent.press(screen.getByText('Cancel')); expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Plan 30 min at 8:00 AM')); save.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.press(screen.getByText('Save task')); await screen.findByText('Offline'); expect(screen.getByLabelText('Title')).toHaveDisplayValue('Study block');
});
