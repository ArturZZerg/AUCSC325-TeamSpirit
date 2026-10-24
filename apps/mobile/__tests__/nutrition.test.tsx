import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Nutrition from '../app/nutrition';
import { useAction, useDiningMenu, useFoodSearch, useNutritionDay } from '../src/features/queries';
import { diningEntry, diningPortion, foodEntry, rescaleEntry } from '../src/features/nutrition';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useNutritionDay: jest.fn(), useDiningMenu: jest.fn(), useFoodSearch: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2026-10-23', resumeCount: 0 }) }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const rice = { id: 'usda:168878', name: 'Rice, white, long-grain, regular, enriched, cooked', source: 'usda' as const,
  per100: { kcal: 130, protein: 2.69, fat: 0.28, carbs: 28.17, fiber: 0.4 }, portions: [{ label: '1 cup', grams: 158 }] };
const dish = { key: 'chicken burrito', name: 'Chicken Burrito', siteKcal: 500, kind: 'mixed' as const, estimated: true,
  serving: { grams: 260, nutrients: { kcal: 500, protein: 30, fat: 15, carbs: 60, fiber: 6 } },
  meat: { grams: 100, nutrients: { kcal: 180, protein: 24, fat: 8, carbs: 0, fiber: 0 } }, rest: { grams: 160, nutrients: { kcal: 320, protein: 6, fat: 7, carbs: 60, fiber: 6 } } };
const entry = { id: '10000000-0000-4000-8000-0000000000f1', date: '2026-10-23', meal: 'breakfast' as const, name: 'Oats', grams: 50, source: 'usda' as const, sourceRef: 'usda:1',
  nutrients: { kcal: 190, protein: 6.5, fat: 3.3, carbs: 33, fiber: 5 }, createdAt: '2026-10-23T14:00:00.000Z' };
const day = (change: object = {}) => ({ data: { accountId: '10000000-0000-4000-8000-000000000001', timeZone: 'America/Edmonton', date: '2026-10-23', capturedAt: '2026-10-23T15:00:00.000Z',
  profile: { sex: 'male', birthYear: 2004, heightCm: 180, activity: 'moderate', goal: 'maintain', overrides: null, diningHall: 'auto' }, latestWeightKg: 80,
  diningAvailable: true, entries: [entry], recent: [rice], ...change }, isLoading: false, refetch: jest.fn() });
const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useNutritionDay).mockImplementation(date => (date === '2026-10-23' ? day() : day({ date, entries: [{ ...entry, date, meal: 'lunch', id: '10000000-0000-4000-8000-0000000000f2' }] })) as unknown as ReturnType<typeof useNutritionDay>);
  jest.mocked(useFoodSearch).mockReturnValue({ data: undefined, isFetching: false } as unknown as ReturnType<typeof useFoodSearch>);
  jest.mocked(useDiningMenu).mockReturnValue({ data: { date: '2026-10-23', published: true, fetchedAt: '2026-10-23T12:00:00.000Z', error: null,
    meals: [{ meal: 'lunch', label: 'Lunch', start: 690, end: 855, stations: [{ label: 'Featured', dishes: [dish] }] }] } } as unknown as ReturnType<typeof useDiningMenu>);
});

describe('nutrition helpers', () => {
  it('snapshots a food portion and rescales a saved line', () => {
    expect(foodEntry(rice, 158, 'lunch', '2026-10-23')).toMatchObject({ grams: 158, nutrients: { kcal: 205, carbs: 44.5 }, source: 'usda', sourceRef: 'usda:168878' });
    expect(rescaleEntry(entry, 100)).toEqual({ grams: 100, nutrients: { kcal: 380, protein: 13, fat: 6.6, carbs: 66, fiber: 10 } });
  });
  it('doubles only the meat for extra protein and scales servings', () => {
    expect(diningPortion(dish, 1, false)).toEqual({ grams: 260, nutrients: { kcal: 500, protein: 30, fat: 15, carbs: 60, fiber: 6 } });
    expect(diningPortion(dish, 1, true)).toEqual({ grams: 360, nutrients: { kcal: 680, protein: 54, fat: 23, carbs: 60, fiber: 6 } });
    expect(diningEntry(dish, 1.5, false, 'lunch', '2026-10-23')).toMatchObject({ name: 'Chicken Burrito ×1.5', grams: 390, source: 'dining', sourceRef: 'dining:chicken burrito' });
  });
});

it('shows the day on a plate with goals, meals and the dining hall', () => {
  render(<Nutrition/>);
  expect(screen.getByText('Today')).toBeOnTheScreen();
  expect(screen.getByText('of 2,820 kcal')).toBeOnTheScreen();
  expect(screen.getByText('2,630 left')).toBeOnTheScreen();
  expect(screen.getByText('Oats')).toBeOnTheScreen();
  expect(screen.getByText('Dining hall')).toBeOnTheScreen();
  expect(screen.getByText('Chicken Burrito')).toBeOnTheScreen();
});
it('repeats yesterday\'s meal and logs a recent food in two taps', async () => {
  render(<Nutrition/>);
  await act(async () => { fireEvent.press(screen.getByText('Repeat yesterday (190 kcal)')); });
  expect(save).toHaveBeenCalledWith({ path: '/nutrition/entries/copy', body: { fromDate: '2026-10-22', fromMeal: 'lunch', toDate: '2026-10-23', toMeal: 'lunch' } });
  fireEvent.press(screen.getByRole('button', { name: 'Add food to dinner' }));
  fireEvent.press(screen.getByRole('button', { name: `Choose ${rice.name}` }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add 205 kcal' })); });
  expect(save).toHaveBeenLastCalledWith({ path: '/nutrition/entries', body: expect.objectContaining({ meal: 'dinner', grams: 158, sourceRef: 'usda:168878' }) });
});
it('hides the dining hall when it is not available to the student', () => {
  jest.mocked(useNutritionDay).mockReturnValue(day({ diningAvailable: false }) as unknown as ReturnType<typeof useNutritionDay>);
  render(<Nutrition/>);
  expect(screen.queryByText('Dining hall')).toBeNull();
});
