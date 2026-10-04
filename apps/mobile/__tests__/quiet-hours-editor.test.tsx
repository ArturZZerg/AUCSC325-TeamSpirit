import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QuietHoursEditor } from '../src/features/quiet-hours-editor';
import { useAction } from '../src/features/queries';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const preferences = { academicEnabled: true, personalEnabled: false, goalEnabled: true, eventEnabled: false, dailyOverviewEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
const save = jest.fn(); const close = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});
const show = () => render(<QuietHoursEditor preferences={preferences} timeZone="America/Edmonton" onClose={close}/>);
it('loads current times in the account zone and saves only the quiet-hour fields', async () => {
  show(); expect(screen.getByText(/America\/Edmonton/)).toBeOnTheScreen(); expect(screen.getByLabelText('Quiet hours start')).toHaveDisplayValue('22:00');
  fireEvent.changeText(screen.getByLabelText('Quiet hours end'), '08:00'); fireEvent.press(screen.getByText('Save quiet hours'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith({ path: '/notification-preferences', method: 'PATCH', body: { quietHoursStart: '22:00', quietHoursEnd: '08:00' } });
});
it('rejects malformed times and incomplete intervals before sending', async () => {
  show(); fireEvent.changeText(screen.getByLabelText('Quiet hours start'), '25:00'); fireEvent.press(screen.getByText('Save quiet hours')); await screen.findByText(/Enter a time as/);
  fireEvent.changeText(screen.getByLabelText('Quiet hours start'), ''); fireEvent.press(screen.getByText('Save quiet hours')); await screen.findByText(/Enter both times/);
  expect(save).not.toHaveBeenCalled();
});
it('rejects equal bounds and supports clearing them to disable', async () => {
  show(); fireEvent.changeText(screen.getByLabelText('Quiet hours end'), '22:00'); fireEvent.press(screen.getByText('Save quiet hours')); await screen.findByText(/Choose different/);
  fireEvent.press(screen.getByText('Disable quiet hours')); expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Save quiet hours')); await waitFor(() => expect(close).toHaveBeenCalled());
  expect(save).toHaveBeenCalledWith({ path: '/notification-preferences', method: 'PATCH', body: { quietHoursStart: null, quietHoursEnd: null } });
});
it('preserves a failed draft and retries without claiming it was saved', async () => {
  save.mockRejectedValueOnce(new Error('Offline')); show(); fireEvent.changeText(screen.getByLabelText('Quiet hours start'), '23:00'); fireEvent.press(screen.getByText('Save quiet hours'));
  await screen.findByText('Offline'); expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Quiet hours start')).toHaveDisplayValue('23:00');
  fireEvent.press(screen.getByText('Save quiet hours')); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(save).toHaveBeenCalledTimes(2);
});
it('prevents repeated saves and dismissal while pending', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); show();
  act(() => { const button = screen.getByText('Save quiet hours'); fireEvent.press(button); fireEvent.press(button); }); await screen.findByText('Saving…');
  expect(screen.getByLabelText('Quiet hours start')).toHaveProp('editable', false); fireEvent.press(screen.getByText('Cancel')); fireEvent.press(screen.getByText('Disable quiet hours'));
  expect(save).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled(); await act(async () => { resolve(); }); expect(close).toHaveBeenCalledTimes(1);
});
it('can discard changes without writing preferences', () => {
  show(); fireEvent.changeText(screen.getByLabelText('Quiet hours start'), '23:00'); fireEvent.press(screen.getByText('Cancel'));
  expect(save).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
});
