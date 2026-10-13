import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { StudyPlanEditor } from '../src/features/study-plan-editor';
import { useAction } from '../src/features/queries';
import { essay } from './academic-fixture';
import { ApiError } from '../src/lib/api';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09' }) }));
const save = jest.fn();
const close = jest.fn(); const saved = jest.fn();
function show() { return render(<StudyPlanEditor item={essay} course="AUCSC 325" timeZone="America/Edmonton" onClose={close} onSaved={saved}/>); }
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save } as unknown as ReturnType<typeof useAction>);
});
it('plans a template step for tomorrow with an editable goal and duration', async () => {
  show(); fireEvent.press(screen.getByRole('radio', { name: 'Read & outline' }));
  expect(screen.getByLabelText('Study task')).toHaveDisplayValue('Outline: Testing report');
  fireEvent.press(screen.getByRole('radio', { name: 'Tomorrow' }));
  fireEvent.press(screen.getByRole('radio', { name: '50 min' }));
  fireEvent.changeText(screen.getByLabelText('Study task'), 'Outline section one');
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ path: '/tasks', method: 'POST', body: expect.objectContaining({ title: 'Outline section one', scheduled: { kind: 'date', date: '2025-03-10' }, estimatedMinutes: 50 }) }));
  expect(saved).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
});
it('preserves custom notes and titles when choosing another suggested step', () => {
  show(); fireEvent.changeText(screen.getByLabelText('Study task'), 'My own plan'); fireEvent.changeText(screen.getByLabelText('What will you work on?'), 'Keep my notes');
  fireEvent.press(screen.getByRole('radio', { name: 'Review & practise' }));
  expect(screen.getByLabelText('Study task')).toHaveDisplayValue('My own plan');
  expect(screen.getByLabelText('What will you work on?')).toHaveDisplayValue('Keep my notes');
});
it('keeps the draft after a network failure and permits retry', async () => {
  save.mockRejectedValueOnce(new Error('Offline write')); show();
  fireEvent.changeText(screen.getByLabelText('Study task'), 'Keep this plan');
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(screen.getByRole('alert')).toHaveTextContent('Offline write');
  expect(screen.getByLabelText('Study task')).toHaveDisplayValue('Keep this plan'); expect(saved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Study task')).toHaveProp('editable', false);
  expect(screen.getByRole('radio', { name: 'Tomorrow' })).toBeDisabled();
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(save).toHaveBeenCalledTimes(2); expect(saved).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(save.mock.calls[0][0].body.requestKey).toMatch(/^task-[A-Za-z0-9-]+$/);
});
it('keeps the exact attempted notes and key when coursework props change after response loss', async () => {
  save.mockRejectedValueOnce(new Error('Response lost')); const ui = show();
  fireEvent.changeText(screen.getByLabelText('What will you work on?'), 'My preparation notes');
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  const attempted = save.mock.calls[0][0];
  ui.rerender(<StudyPlanEditor item={{ ...essay, title: 'Changed coursework', due: null }} course="Changed course" timeZone="UTC" onClose={close} onSaved={saved}/>);
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(save.mock.calls[1][0]).toEqual(attempted);
  expect(attempted.body.description).toContain('Course: AUCSC 325');
  expect(attempted.body.description).toContain('My preparation notes');
});
it('uses a new key for a newly opened creation and unlocks only definite initial validation rejection', async () => {
  save.mockRejectedValueOnce(new ApiError(400, 'Invalid task')); const ui = show();
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(screen.getByLabelText('Study task')).toHaveProp('editable', true);
  const rejectedKey = save.mock.calls[0][0].body.requestKey;
  fireEvent.changeText(screen.getByLabelText('Study task'), 'Corrected task');
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(save.mock.calls[1][0].body.requestKey).not.toBe(rejectedKey);
  ui.unmount(); show();
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(save.mock.calls[2][0].body.requestKey).not.toBe(save.mock.calls[1][0].body.requestKey);
});
it('retains identity after a conflict or a rejection following an uncertain attempt', async () => {
  save.mockRejectedValueOnce(new Error('Response lost')).mockRejectedValueOnce(new ApiError(400, 'Later rejection'))
    .mockRejectedValueOnce(new ApiError(409, 'Task was deleted')); show();
  for (let index = 0; index < 3; index++) await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(save.mock.calls[2][0]).toEqual(save.mock.calls[0][0]);
  expect(screen.getByLabelText('Study task')).toHaveProp('editable', false);
  expect(screen.getByText(/close and check Tasks/)).toBeOnTheScreen();
});
it('blocks duplicate taps, editing and modal dismissal while saving', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); show();
  act(() => { const button = screen.getByText('Add to my plan'); fireEvent.press(button); fireEvent.press(button); });
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByLabelText('Study task')).toHaveProp('editable', false);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose'); expect(close).not.toHaveBeenCalled();
  await act(async () => resolve()); expect(saved).toHaveBeenCalledTimes(1);
});
it('rejects a DST gap before saving and lets a corrected time through', async () => {
  show(); fireEvent.changeText(screen.getByLabelText('Start time (optional)'), '02:30');
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(screen.getByRole('alert')).toHaveTextContent(/missing or occurs twice/); expect(save).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Start time (optional)'), '03:30');
  await act(async () => fireEvent.press(screen.getByText('Add to my plan')));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ scheduled: { kind: 'instant', at: '2025-03-09T09:30:00Z' } }) }));
});
it('warns for a day after the deadline and cancels without a write', () => {
  show(); fireEvent.press(screen.getByRole('radio', { name: 'Tomorrow' })); expect(screen.getByText(/This day is after the coursework deadline/)).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Cancel')); expect(close).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
});
