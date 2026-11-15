import { act, fireEvent, render, screen } from '@testing-library/react-native';
import GymStats from '../app/gym-stats';
import { useAction, useGym } from '../src/features/queries';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useGym: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2026-10-23', resumeCount: 0 }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));

const workout = (id: string, endedAt: string, weight: number) => ({ id, programId: 'upper-lower', dayId: 'upper-a', title: 'Upper A', unit: 'kg', note: null,
  startedAt: endedAt, endedAt, createdAt: endedAt, exercises: [{ exerciseId: 'bench-press', sets: [{ weight, reps: 8 }, { weight, reps: 7 }] }] });
const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useGym).mockReturnValue({ isLoading: false, data: { enrollment: { programId: 'upper-lower', unit: 'kg', weeklyTarget: 2, trackRir: false },
    exercises: [], programs: [], workouts: [workout('10000000-0000-4000-8000-0000000000d1', '2026-10-15T18:00:00.000Z', 60), workout('10000000-0000-4000-8000-0000000000d2', '2026-10-21T18:00:00.000Z', 62.5)],
    bodyWeights: [{ date: '2026-10-20', weight: 80, unit: 'kg' }, { date: '2026-10-22', weight: 79, unit: 'kg' }] } } as unknown as ReturnType<typeof useGym>);
});

it('shows records, muscle volume and body weight from saved data', () => {
  render(<GymStats/>);
  expect(screen.getByText('Latest 79 kg')).toBeOnTheScreen();
  expect(screen.getByText(/Best set: 62.5 kg × 8/)).toBeOnTheScreen();
  expect(screen.getByLabelText('Chest: 2 sets')).toBeOnTheScreen();
  expect(screen.getByText('Estimated one-rep max from your best set each session.')).toBeOnTheScreen();
});
it('logs today\'s body weight in the program unit and validates the value', async () => {
  render(<GymStats/>);
  fireEvent.changeText(screen.getByLabelText('Today\'s weight in kg'), '5');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })); });
  expect(screen.getByText('Enter your weight, for example 72.4.')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('Today\'s weight in kg'), '78,64');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })); });
  expect(save).toHaveBeenCalledWith({ path: '/gym/body-weight/2026-10-23', method: 'PUT', body: { weight: 78.6, unit: 'kg' } });
});

// Regression: persisted weigh-ins retain their original unit when the program's
// display unit changes. The input placeholder must convert just like Latest.
// Expected values follow the existing nearest-half-unit conversion convention.
it.each([
  { savedUnit: 'kg', savedWeight: 70, displayUnit: 'lb', expected: '154.5' },
  { savedUnit: 'lb', savedWeight: 154, displayUnit: 'kg', expected: '70' },
] as const)('converts today\'s saved $savedUnit weight when the display changes to $displayUnit',
    ({ savedUnit, savedWeight, displayUnit, expected }) => {
      const bodyWeights = [{ date: '2026-10-23', weight: savedWeight, unit: savedUnit }];
      const data = { enrollment: { programId: 'upper-lower', unit: savedUnit, weeklyTarget: 2, trackRir: false },
        exercises: [], programs: [], workouts: [], bodyWeights };
      jest.mocked(useGym).mockReturnValue({ isLoading: false, data } as unknown as ReturnType<typeof useGym>);
      const { rerender } = render(<GymStats/>);
      expect(screen.getByLabelText(`Today's weight in ${savedUnit}`)).toHaveProp('placeholder', String(savedWeight));

      // Simulate the refreshed enrollment after changing units in program settings.
      // Saved weight data must keep its original value and unit.
      jest.mocked(useGym).mockReturnValue({ isLoading: false,
        data: { ...data, enrollment: { ...data.enrollment, unit: displayUnit } },
      } as unknown as ReturnType<typeof useGym>);
      rerender(<GymStats/>);

      expect(screen.getByText(`Latest ${expected} ${displayUnit}`)).toBeOnTheScreen();
      expect(screen.getByLabelText(`Today's weight in ${displayUnit}`)).toHaveProp('placeholder', expected);
      expect(save).not.toHaveBeenCalled();
    });

