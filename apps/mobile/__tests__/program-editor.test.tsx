import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ProgramEditor from '../app/program-editor';
import { useAction, useGym } from '../src/features/queries';

const mockReplace = jest.fn(); let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }), useLocalSearchParams: () => mockParams }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useGym: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const save = jest.fn();
const saved = (body: { name: string; days: unknown[] }) => ({ id: '10000000-0000-4000-8000-0000000000c1', ...body, createdAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z' });
beforeEach(() => {
  jest.clearAllMocks(); mockParams = {};
  save.mockReset().mockImplementation(async ({ body }) => saved(body));
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useGym).mockReturnValue({ data: { exercises: [], programs: [], workouts: [], bodyWeights: [], enrollment: null }, isLoading: false } as unknown as ReturnType<typeof useGym>);
});

it('copies a built-in program into an editable own program and saves it', async () => {
  mockParams = { from: 'upper-lower' };
  render(<ProgramEditor/>);
  expect(screen.getByDisplayValue('My Upper / Lower Split')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Edit Barbell bench press' }));
  fireEvent.press(screen.getByRole('button', { name: 'Increase Sets' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save program' })); });
  const body = save.mock.calls[0][0];
  expect(body).toMatchObject({ path: '/gym/programs', method: 'POST', body: { name: 'My Upper / Lower Split' } });
  expect(body.body.days).toHaveLength(4);
  expect(body.body.days[0].exercises[0]).toMatchObject({ exerciseId: 'bench-press', sets: 4 });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/gym-program', params: { id: '10000000-0000-4000-8000-0000000000c1' } });
});
it('validates before saving and never leaves a program without an active day', async () => {
  render(<ProgramEditor/>);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save program' })); });
  expect(screen.getByText('Name the program.')).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Archive Day 1' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Delete Day 1' })).toBeDisabled();
});
it('edits an existing own program in place', async () => {
  const program = saved({ name: 'Mine', days: [{ id: 'a', name: 'A', focus: '', exercises: [{ exerciseId: 'Barbell_Full_Squat', sets: 3, repMin: 5, repMax: 8, restSeconds: 180 }] }] });
  jest.mocked(useGym).mockReturnValue({ data: { exercises: [], programs: [program], workouts: [], bodyWeights: [], enrollment: null }, isLoading: false } as unknown as ReturnType<typeof useGym>);
  mockParams = { id: program.id };
  render(<ProgramEditor/>);
  fireEvent.press(screen.getByRole('button', { name: 'Add a day' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save program' })); });
  expect(save.mock.calls[0][0]).toMatchObject({ path: `/gym/programs/${program.id}`, method: 'PUT' });
  expect(save.mock.calls[0][0].body.days).toHaveLength(2);
});
