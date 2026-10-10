import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ClassEditor } from '../src/features/class-editor';
import { useAction } from '../src/features/queries';
import { classFixture } from './class-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const save = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});
it('validates class name, weekdays and ordered times before saving', async () => {
  render(<ClassEditor item={null} date="2025-03-03" timeZone="America/Edmonton" onClose={jest.fn()}/>);
  fireEvent.press(screen.getByText('Save class')); await screen.findByText('Enter a class name.');
  fireEvent.changeText(screen.getByLabelText('Class name'), 'Biology');
  for (const day of ['Monday', 'Wednesday', 'Friday']) fireEvent.press(screen.getByRole('checkbox', { name: day }));
  fireEvent.press(screen.getByText('Save class')); await screen.findByText('Choose at least one day.');
  fireEvent.press(screen.getByRole('checkbox', { name: 'Tuesday' })); fireEvent.changeText(screen.getByLabelText('Ends (24h)'), '08:00');
  fireEvent.press(screen.getByText('Save class')); await screen.findByText('End time must be after start time on the same day.');
  expect(save).not.toHaveBeenCalled();
});
it('creates a weekly schedule and closes after persistence', async () => {
  const close = jest.fn(); render(<ClassEditor item={null} date="2025-03-03" timeZone="America/Edmonton" onClose={close}/>);
  fireEvent.changeText(screen.getByLabelText('Class name'), ' Biology '); fireEvent.changeText(screen.getByLabelText('Room / location'), 'Library 204');
  fireEvent.press(screen.getByText('Save class')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith({ path: '/classes', method: 'POST', body: expect.objectContaining({
    title: 'Biology', weekdays: [1, 3, 5], location: 'Library 204', instructor: null, notes: null, timeZone: 'America/Edmonton',
  }) });
});
it('edits the complete pattern, keeps its class zone and explicitly clears details', async () => {
  const close = jest.fn(); const item = classFixture(); render(<ClassEditor item={item} date="2025-03-03" timeZone="UTC" onClose={close}/>);
  expect(screen.getByLabelText('Class time zone')).toHaveDisplayValue('America/Edmonton');
  fireEvent.changeText(screen.getByLabelText('Room / location'), ''); fireEvent.press(screen.getByText('Save class'));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(save).toHaveBeenCalledWith({ path: `/classes/${item.id}`, method: 'PUT', body: expect.objectContaining({ location: null, timeZone: item.timeZone }) });
});
it('retains a failed draft for retry without closing', async () => {
  save.mockRejectedValueOnce(new Error('Offline')); const close = jest.fn();
  render(<ClassEditor item={classFixture()} date="2025-03-03" timeZone="UTC" onClose={close}/>);
  fireEvent.changeText(screen.getByLabelText('Class name'), 'My lab draft'); fireEvent.press(screen.getByText('Save class')); await screen.findByText('Offline');
  expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Class name')).toHaveDisplayValue('My lab draft');
  fireEvent.press(screen.getByText('Save class')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
it('blocks repeat saves and dismissal while the server is saving', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); const close = jest.fn();
  render(<ClassEditor item={classFixture()} date="2025-03-03" timeZone="UTC" onClose={close}/>);
  act(() => { const button = screen.getByText('Save class'); fireEvent.press(button); fireEvent.press(button); });
  await screen.findByText('Saving…'); fireEvent.press(screen.getByText('Cancel'));
  expect(save).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Class name')).toHaveProp('editable', false);
  await act(async () => { resolve(); }); expect(close).toHaveBeenCalledTimes(1);
});
