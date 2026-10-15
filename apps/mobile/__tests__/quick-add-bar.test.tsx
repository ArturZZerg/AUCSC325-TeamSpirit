import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QuickAddBar } from '../src/features/quick-add-bar';
import { useAction } from '../src/features/queries';

jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
const save = jest.fn(), open = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});
const show = () => render(<QuickAddBar today="2026-10-14" planDate="2026-10-15" timeZone="America/Edmonton" onOpenEditor={open}/>);
const type = (text: string) => fireEvent.changeText(screen.getByLabelText('Quick add a task'), text);

it('previews recognised details and creates the task in the account zone', async () => {
  show(); expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  type('Essay due fri 5pm #uni !high');
  expect(screen.getByText(/^Due Fri, Oct 16 · 5:00\sPM$/)).toBeOnTheScreen(); expect(screen.getByText('University')).toBeOnTheScreen();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add' })); });
  expect(save).toHaveBeenCalledWith({ path: '/tasks', method: 'POST', body: expect.objectContaining({
    title: 'Essay', category: 'university', priority: 'high', due: { kind: 'instant', at: '2026-10-16T23:00:00Z' } }) });
  expect(save.mock.calls[0][0].body).not.toHaveProperty('scheduled');
  expect(screen.getByLabelText('Quick add a task')).toHaveDisplayValue(''); expect(screen.getByRole('alert')).toHaveTextContent('Added “Essay”.');
});
it('plans undated text for the displayed day and submits from the keyboard', async () => {
  show(); type('Buy milk'); expect(screen.getByText(/Planned for this day/)).toBeOnTheScreen();
  await act(async () => { fireEvent(screen.getByLabelText('Quick add a task'), 'submitEditing'); });
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ title: 'Buy milk', scheduled: { kind: 'date', date: '2026-10-15' } }) }));
});
it('keeps the text and explains validation or network failures', async () => {
  show(); type('#uni !high');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add' })); });
  expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('Enter a title.');
  save.mockRejectedValueOnce(new TypeError('Network request failed')); type('Read');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add' })); });
  expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t confirm the save/); expect(screen.getByLabelText('Quick add a task')).toHaveDisplayValue('Read');
});
it('hands the parsed draft to the full editor', () => {
  show(); type('Gym tomorrow 7am 1h');
  fireEvent.press(screen.getByRole('button', { name: 'Open quick add in the full editor' }));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ title: 'Gym', scheduledMode: 'instant', scheduledDate: '2026-10-15', scheduledTime: '07:00', estimatedMinutes: '60' }));
  expect(save).not.toHaveBeenCalled();
});
it('does not submit a retained keyboard action after capture becomes unavailable', async () => {
  const view = show(); type('Read chapter 4');
  view.rerender(<QuickAddBar today="2026-10-14" planDate="2026-10-15" timeZone="America/Edmonton" onOpenEditor={open} disabled/>);
  await act(async () => fireEvent(screen.getByLabelText('Quick add a task'), 'submitEditing'));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Quick add a task')).toHaveDisplayValue('Read chapter 4');
});
