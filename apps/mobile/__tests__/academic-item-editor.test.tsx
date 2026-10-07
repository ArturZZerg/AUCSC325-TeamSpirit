import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { AcademicItemEditor } from '../src/features/academic-item-editor';
import { useAction } from '../src/features/queries';
import { courses, essay } from './academic-fixture';
jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('../src/features/today-clock', () => ({ useTodayClock: () => ({ date: '2025-03-09' }) }));
const save = jest.fn(); const close = jest.fn(); const saved = jest.fn();
const show = (item = null as typeof essay | null) => render(<AcademicItemEditor item={item} courses={courses} timeZone="America/Edmonton" onClose={close} onSaved={saved}/>);
beforeEach(() => { jest.clearAllMocks(); save.mockReset().mockResolvedValue({}); jest.mocked(useAction).mockReturnValue({ mutateAsync: save } as unknown as ReturnType<typeof useAction>); });
it('adds a quiz with an optional course and date-only deadline', async () => {
  show(); fireEvent.changeText(screen.getByLabelText('Coursework title'), 'Graph quiz');
  fireEvent.press(screen.getByRole('radio', { name: 'Quiz' })); fireEvent.press(screen.getByRole('radio', { name: 'AUCSC 325' }));
  fireEvent.press(screen.getByRole('radio', { name: 'Tomorrow' }));
  await act(async () => fireEvent.press(screen.getByText('Add coursework')));
  expect(save).toHaveBeenCalledWith({ path: '/academic-items', method: 'POST', body: { title: 'Graph quiz', kind: 'quiz', courseId: courses[0].id, due: { kind: 'date', date: '2025-03-10' } } });
  expect(saved).toHaveBeenCalledTimes(1);
});
it('validates missing title and a nonexistent local time before saving', async () => {
  show(); await act(async () => fireEvent.press(screen.getByText('Add coursework'))); expect(save).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Coursework title'), 'Essay'); fireEvent.press(screen.getByRole('radio', { name: 'Date & time' }));
  fireEvent.changeText(screen.getByLabelText('Deadline time'), '02:30');
  await act(async () => fireEvent.press(screen.getByText('Add coursework')));
  expect(screen.getByRole('alert')).toHaveTextContent(/missing or occurs twice/); expect(save).not.toHaveBeenCalled();
});
it('retains edits on failure and acknowledges success only after retry', async () => {
  save.mockRejectedValueOnce(new Error('Offline write')); show({ ...essay, source: 'manual' });
  fireEvent.changeText(screen.getByLabelText('Coursework title'), 'Keep my draft');
  await act(async () => fireEvent.press(screen.getByText('Save coursework')));
  expect(screen.getByLabelText('Coursework title')).toHaveDisplayValue('Keep my draft'); expect(saved).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Offline write');
  await act(async () => fireEvent.press(screen.getByText('Save coursework'))); expect(saved).toHaveBeenCalledTimes(1);
});
it('guards repeated taps, editing and dismissal during a save', async () => {
  let resolve!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { resolve = done; })); show();
  fireEvent.changeText(screen.getByLabelText('Coursework title'), 'Essay');
  act(() => { const button = screen.getByText('Add coursework'); fireEvent.press(button); fireEvent.press(button); });
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByLabelText('Coursework title')).toHaveProp('editable', false);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled(); fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose'); expect(close).not.toHaveBeenCalled();
  await act(async () => resolve()); expect(saved).toHaveBeenCalledTimes(1);
});
it('preserves a course assignment while metadata is unavailable', async () => {
  render(<AcademicItemEditor item={essay} courses={[]} timeZone="America/Edmonton" onClose={close} onSaved={saved}/>);
  expect(screen.getByRole('radio', { name: 'Saved course', checked: true })).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByText('Save coursework'))); expect(save.mock.calls[0][0].body.courseId).toBe(essay.courseId);
});
it('cancels without creating a record', () => { show(); fireEvent.press(screen.getByText('Cancel')); expect(close).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled(); });
