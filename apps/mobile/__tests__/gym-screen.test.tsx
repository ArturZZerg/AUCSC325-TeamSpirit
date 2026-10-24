import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import Gym from '../app/(tabs)/gym';
import { useAction, useGym } from '../src/features/queries';
import { useGymWorkout } from '../src/store/gym-workout';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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

const overview = (enrollment: object | null, workouts: object[] = []) => ({ data: { accountId: session.user.id, timeZone: 'America/Edmonton',
  capturedAt: '2026-10-23T18:00:00.000Z', enrollment, workouts }, isLoading: false, refetch: jest.fn() });
const enrollment = { programId: 'upper-lower', unit: 'lb', weeklyTarget: 4, startedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); useGymWorkout.setState({ draft: null, restored: null });
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});

it('helps a new student pick a program with level and audience filters', () => {
  jest.mocked(useGym).mockReturnValue(overview(null) as unknown as ReturnType<typeof useGym>);
  render(<Gym/>);
  expect(screen.getByText('Find a program that fits you')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('radio', { name: 'Advanced' }));
  expect(screen.getByText('Push / Pull / Legs')).toBeOnTheScreen(); expect(screen.queryByText('Dorm-Room Starter')).toBeNull();
  fireEvent.press(screen.getByRole('radio', { name: 'For women' }));
  expect(screen.getByText('Glute Builder')).toBeOnTheScreen(); expect(screen.queryByText('Push / Pull / Legs')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: /^Glute Builder/ }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/gym-program', params: { id: 'glute-builder' } });
});
it('shows the next workout in the rotation, weekly progress and starts a prefilled draft', async () => {
  jest.mocked(useGym).mockReturnValue(overview(enrollment, [{ id: '10000000-0000-4000-8000-0000000000a1', programId: 'upper-lower', dayId: 'upper-a',
    title: 'Upper A', unit: 'lb', note: null, startedAt: '2026-10-21T00:00:00.000Z', endedAt: '2026-10-21T01:00:00.000Z', createdAt: '2026-10-21T01:00:00.000Z',
    exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 135, reps: 8 }] }] }]) as unknown as ReturnType<typeof useGym>);
  render(<Gym/>);
  expect(screen.getByText('Lower A')).toBeOnTheScreen();
  expect(screen.getByText('1 of 4 workouts')).toBeOnTheScreen();
  expect(screen.getByText('3 more to reach your weekly goal.')).toBeOnTheScreen();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Start Lower A' })); });
  expect(useGymWorkout.getState().draft).toMatchObject({ programId: 'upper-lower', dayId: 'lower-a', unit: 'lb', owner: JSON.stringify([session.user.id, 'token']) });
  expect(router.push).toHaveBeenCalledWith('/workout');
});
it('asks before replacing an unfinished workout and offers to resume it', async () => {
  jest.mocked(useGym).mockReturnValue(overview(enrollment) as unknown as ReturnType<typeof useGym>);
  render(<Gym/>);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Start Upper A' })); });
  expect(screen.getByRole('button', { name: 'Resume Upper A' })).toBeOnTheScreen();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Start Upper A' })); });
  expect(screen.getByText('Start a new workout?')).toBeOnTheScreen();
  const key = useGymWorkout.getState().draft?.requestKey;
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Discard and start' })); });
  expect(useGymWorkout.getState().draft?.requestKey).not.toBe(key);
});
