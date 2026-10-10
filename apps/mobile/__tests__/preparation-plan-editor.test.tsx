import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { PreparationPlanEditor } from '../src/features/preparation-plan-editor';
import { useAction } from '../src/features/queries';
import { quiz } from './academic-fixture';
import { ApiError } from '../src/lib/api';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09' }) }));
const save = jest.fn(), close = jest.fn(), saved = jest.fn();
const show = () => render(<PreparationPlanEditor item={quiz} timeZone="America/Edmonton" onClose={close} onSaved={saved}/>);
const preview = () => fireEvent.press(screen.getByText('Preview my sessions'));
beforeEach(() => { jest.clearAllMocks(); save.mockReset().mockResolvedValue({}); jest.mocked(useAction).mockReturnValue({ mutateAsync: save } as unknown as ReturnType<typeof useAction>); });
it('previews editable revision sessions and saves them together only on confirmation', async () => {
  show(); expect(screen.getByRole('radio', { name: 'Exam revision', checked: true })).toBeOnTheScreen(); preview();
  expect(save).not.toHaveBeenCalled(); expect(screen.getByLabelText('Session 2 date')).toHaveDisplayValue('2025-03-10');
  fireEvent.changeText(screen.getByLabelText('Session 2 title'), 'Practise graph traversal');
  fireEvent.changeText(screen.getByLabelText('Session 2 time'), '14:00');
  await act(async () => fireEvent.press(screen.getByText('Save study plan')));
  expect(save).toHaveBeenCalledTimes(1); expect(save.mock.calls[0][0]).toMatchObject({ path: '/study-plans', method: 'POST', body: {
    academicItemId: quiz.id, sessions: [expect.anything(), { title: 'Practise graph traversal', scheduled: { kind: 'instant', at: '2025-03-10T20:00:00Z' }, estimatedMinutes: 50 }, expect.anything()],
  } }); expect(saved).toHaveBeenCalledTimes(1);
});
it('changes pace, weekdays and template then cancels without writing', () => {
  show(); fireEvent.press(screen.getByRole('radio', { name: '5 sessions' })); fireEvent.press(screen.getByRole('radio', { name: '25 min each' }));
  fireEvent.press(screen.getByRole('radio', { name: 'Assignment steps' })); fireEvent.press(screen.getByRole('checkbox', { name: 'Mon' })); preview();
  expect(screen.getByLabelText('Session 5 title')).toHaveDisplayValue('Review & final checks: Graph quiz');
  expect(screen.queryAllByDisplayValue('2025-03-10')).toHaveLength(0);
  fireEvent.press(screen.getByText('Cancel')); expect(close).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
});
it('retains an uncertain request unchanged for a safe retry', async () => {
  save.mockRejectedValueOnce(new Error('Network request failed')); show(); preview();
  await act(async () => fireEvent.press(screen.getByText('Save study plan')));
  const attempted = save.mock.calls[0][0]; expect(screen.getByRole('alert')).toHaveTextContent('Network request failed');
  expect(screen.getByLabelText('Session 1 title')).toHaveProp('editable', false); expect(screen.getByRole('button', { name: 'Back to setup' })).toBeDisabled();
  await act(async () => fireEvent.press(screen.getByText('Retry saving plan')));
  expect(save.mock.calls[1][0]).toEqual(attempted); expect(saved).toHaveBeenCalledTimes(1);
});
it('permits correction after a definite validation rejection', async () => {
  save.mockRejectedValueOnce(new ApiError(400, 'Check coursework')); show(); preview();
  await act(async () => fireEvent.press(screen.getByText('Save study plan')));
  expect(screen.getByLabelText('Session 1 title')).toHaveProp('editable', true);
  fireEvent.changeText(screen.getByLabelText('Session 1 title'), 'Corrected');
  await act(async () => fireEvent.press(screen.getByText('Save study plan')));
  expect(save.mock.calls[1][0].body.requestKey).not.toBe(save.mock.calls[0][0].body.requestKey);
});
it('blocks double save and dismissal during the transaction', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); show(); preview();
  act(() => { const button = screen.getByText('Save study plan'); fireEvent.press(button); fireEvent.press(button); });
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose'); expect(close).not.toHaveBeenCalled(); await act(async () => resolve());
});
it('rejects empty names, impossible dates and DST times without locking the draft', async () => {
  show(); fireEvent.changeText(screen.getByLabelText('Finish by'), '2025-03-08'); preview(); expect(screen.getByRole('alert')).toHaveTextContent(/finish date/);
  fireEvent.changeText(screen.getByLabelText('Finish by'), '2025-03-11'); preview();
  fireEvent.changeText(screen.getByLabelText('Session 1 time'), '02:30');
  await act(async () => fireEvent.press(screen.getByText('Save study plan')));
  expect(screen.getByRole('alert')).toHaveTextContent(/occurs twice/); expect(save).not.toHaveBeenCalled(); expect(screen.getByLabelText('Session 1 time')).toHaveProp('editable', true);
});
