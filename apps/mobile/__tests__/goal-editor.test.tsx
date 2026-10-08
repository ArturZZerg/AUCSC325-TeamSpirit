import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GoalEditor } from '../src/features/goal-editor';
import { useAction } from '../src/features/queries';
import { snapshotFixture } from './snapshot-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const save = jest.fn(); const goal = snapshotFixture().goals[0];
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});
it('validates title and weekday selection before submitting', async () => {
  render(<GoalEditor goal={null} timeZone="America/Edmonton" onClose={jest.fn()}/>);
  fireEvent.press(screen.getByText('Save goal')); await screen.findByText('Enter a title.');
  fireEvent.changeText(screen.getByLabelText('Goal title'), 'Read'); fireEvent.press(screen.getByRole('radio', { name: 'Choose days' }));
  fireEvent.press(screen.getByText('Save goal')); await screen.findByText('Choose at least one day.');
  expect(save).not.toHaveBeenCalled();
});
it('creates a selected-day goal and closes only after saving', async () => {
  const close = jest.fn(); render(<GoalEditor goal={null} timeZone="America/Edmonton" onClose={close}/>);
  fireEvent.changeText(screen.getByLabelText('Goal title'), 'Read'); fireEvent.press(screen.getByRole('radio', { name: 'Choose days' }));
  fireEvent.press(screen.getByRole('checkbox', { name: 'Monday' })); fireEvent.press(screen.getByRole('checkbox', { name: 'Friday' }));
  fireEvent.press(screen.getByText('Save goal')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith({ path: '/goals', method: 'POST', body: { title: 'Read', category: 'health', timeZone: 'America/Edmonton', schedule: { kind: 'weekly', weekdays: [1, 5] } } });
});
it('preserves goal timezone and edits a weekly target', async () => {
  const close = jest.fn(); render(<GoalEditor goal={goal} timeZone="UTC" onClose={close}/>);
  expect(screen.getByLabelText('Goal time zone')).toHaveDisplayValue(goal.timeZone);
  fireEvent.press(screen.getByRole('radio', { name: 'Weekly target' })); fireEvent.changeText(screen.getByLabelText('Times per week (1–7)'), '4');
  fireEvent.press(screen.getByText('Save goal')); await waitFor(() => expect(close).toHaveBeenCalled());
  expect(save).toHaveBeenCalledWith({ path: `/goals/${goal.id}`, method: 'PATCH', body: { title: goal.title, category: goal.category, timeZone: goal.timeZone, schedule: { kind: 'weeklyTarget', target: 4 } } });
});
it('ignores starter defaults when editing an existing goal', () => {
  render(<GoalEditor goal={goal} timeZone="UTC" initialValues={{ title: 'Starter', timeZone: 'UTC', frequency: 'weeklyTarget', target: '7' }} onClose={jest.fn()}/>);
  expect(screen.getByLabelText('Goal title')).toHaveDisplayValue(goal.title);
  expect(screen.getByLabelText('Goal time zone')).toHaveDisplayValue(goal.timeZone);
});
it('keeps a failed draft and supports retry', async () => {
  save.mockRejectedValueOnce(new Error('Offline')); const close = jest.fn(); render(<GoalEditor goal={goal} timeZone="UTC" onClose={close}/>);
  fireEvent.changeText(screen.getByLabelText('Goal title'), 'My draft'); fireEvent.press(screen.getByText('Save goal')); await screen.findByText('Offline');
  expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Goal title')).toHaveDisplayValue('My draft');
  fireEvent.press(screen.getByText('Save goal')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).toHaveBeenCalledTimes(2);
});
it('blocks repeat submission and cancellation during a save', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); const close = jest.fn();
  render(<GoalEditor goal={goal} timeZone="UTC" onClose={close}/>);
  act(() => { const button = screen.getByText('Save goal'); fireEvent.press(button); fireEvent.press(button); }); await screen.findByText('Saving…');
  fireEvent.press(screen.getByText('Saving…')); fireEvent.press(screen.getByText('Cancel')); expect(save).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Goal title')).toHaveProp('editable', false);
  await act(async () => { resolve(); }); expect(close).toHaveBeenCalledTimes(1);
});
