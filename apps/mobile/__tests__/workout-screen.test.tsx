import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { findGymProgram } from '@campusflow/domain';
import Workout from '../app/workout';
import { useAction, useGym } from '../src/features/queries';
import { createDraft } from '../src/features/gym';
import { useGymWorkout } from '../src/store/gym-workout';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useGym: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2026-10-23', resumeCount: 0 }) }));
jest.mock('../src/services/cache', () => ({ readCache: jest.fn().mockResolvedValue(undefined), writeCache: jest.fn().mockResolvedValue(undefined), deleteCache: jest.fn().mockResolvedValue(undefined) }));
const session = { accessToken: 'token', user: { id: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton' } };
jest.mock('../src/store/session', () => {
  const state = () => ({ session });
  return { useSessionStore: Object.assign((select: (value: unknown) => unknown) => select(state()), { getState: state }) };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const owner = JSON.stringify([session.user.id, 'token']), program = findGymProgram('dorm-room-starter')!;
const save = jest.fn();
beforeEach(() => {
  // The saved workout's end time must fall in the mocked today's week.
  jest.useFakeTimers({ advanceTimers: true }); jest.setSystemTime(new Date('2026-10-23T18:00:00Z'));
  jest.clearAllMocks();
  useGymWorkout.setState({ draft: createDraft(owner, program, program.days[0], 'kg', [], '2026-10-23', 'America/Edmonton', new Date(Date.now() - 30 * 60_000)), restored: owner });
  jest.mocked(useGym).mockReturnValue({ data: { enrollment: { weeklyTarget: 3 }, workouts: [] } } as unknown as ReturnType<typeof useGym>);
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});

it('starts a rest timer when a set is ticked and saves only completed sets', async () => {
  render(<Workout/>);
  expect(screen.getByText('Workout A')).toBeOnTheScreen();
  expect(screen.getAllByText(/Your first session sets the baseline/).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 of Bodyweight squat done' }));
  expect(screen.getByText('Rest')).toBeOnTheScreen(); expect(screen.getByText('1:00')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Skip rest' })); expect(screen.queryByText('Rest')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Bodyweight squat set 1 reps'), '15');
  save.mockImplementation(async ({ body }) => ({ ...body, id: '10000000-0000-4000-8000-0000000000b1', createdAt: body.endedAt }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' })); });
  expect(save).toHaveBeenCalledWith({ path: '/gym/workouts', body: expect.objectContaining({ programId: 'dorm-room-starter', dayId: 'a',
    exercises: [{ exerciseId: 'bodyweight-squat', sets: [{ weight: null, reps: 15 }] }] }) });
  expect(screen.getByText('Workout saved!')).toBeOnTheScreen(); expect(screen.getByText(/1 of 3 workouts this week/)).toBeOnTheScreen();
  expect(useGymWorkout.getState().draft).toBeNull();
});
it('keeps the draft and its save key when saving fails', async () => {
  render(<Workout/>);
  const key = useGymWorkout.getState().draft!.requestKey;
  fireEvent.press(screen.getByRole('checkbox', { name: 'Set 1 of Bodyweight squat done' }));
  save.mockRejectedValue(new Error('Network unavailable.'));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' })); });
  expect(screen.getByText('Network unavailable. Your sets are kept on this device.')).toBeOnTheScreen();
  expect(useGymWorkout.getState().draft?.requestKey).toBe(key);
});
