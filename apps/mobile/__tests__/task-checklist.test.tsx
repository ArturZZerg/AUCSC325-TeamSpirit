import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { TaskChecklist, checklistProgress, newStepId } from '../src/features/task-checklist';
import { useAction } from '../src/features/queries';
import type { PersonalTask } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
const save = jest.fn();
const step = (id: string, title: string, done = false) => ({ id: `30000000-0000-4000-8000-00000000000${id}`, title, done });
const task: PersonalTask = { ...snapshotFixture().personalTasks[0], recurrence: null, checklist: [step('1', 'Outline', true), step('2', 'Draft')] };
beforeEach(() => {
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});

it('generates version-4 IDs and counts progress, treating older tasks as having no steps', () => {
  expect(newStepId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(checklistProgress(task)).toEqual({ done: 1, total: 2 }); expect(checklistProgress({ checklist: undefined })).toEqual({ done: 0, total: 0 });
});
it('toggles and removes a step through its own endpoint', async () => {
  render(<TaskChecklist task={task}/>);
  expect(screen.getByText('Steps · 1/2')).toBeOnTheScreen(); expect(screen.getByRole('checkbox', { name: 'Outline' })).toBeChecked();
  await act(async () => { fireEvent.press(screen.getByRole('checkbox', { name: 'Draft' })); });
  expect(save).toHaveBeenCalledWith({ path: `/tasks/${task.id}/checklist/${step('2', '').id}`, method: 'PATCH', body: { done: true } });
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Remove step Outline' })); });
  expect(save).toHaveBeenLastCalledWith({ path: `/tasks/${task.id}/checklist/${step('1', '').id}`, method: 'DELETE' });
});
it('adds a trimmed step and retries a failed add with the same ID', async () => {
  save.mockRejectedValueOnce(new TypeError('Network request failed'));
  render(<TaskChecklist task={task}/>);
  fireEvent.changeText(screen.getByLabelText(`Add a step to ${task.title}`), '  Cite sources ');
  await act(async () => { fireEvent(screen.getByLabelText(`Add a step to ${task.title}`), 'submitEditing'); });
  expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t confirm the change/);
  const first = save.mock.calls[0][0];
  expect(first).toMatchObject({ path: `/tasks/${task.id}/checklist`, method: 'POST', body: { title: 'Cite sources' } });
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add step' })); });
  expect(save.mock.calls[1][0].body.id).toBe(first.body.id); expect(screen.getByLabelText(`Add a step to ${task.title}`)).toHaveDisplayValue('');
  fireEvent.changeText(screen.getByLabelText(`Add a step to ${task.title}`), 'Proofread');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add step' })); });
  expect(save.mock.calls[2][0].body.id).not.toBe(first.body.id);
});
it('rejects a blank step without a request and is hidden for repeating tasks', async () => {
  const view = render(<TaskChecklist task={task}/>);
  fireEvent.changeText(screen.getByLabelText(`Add a step to ${task.title}`), '   ');
  await act(async () => { fireEvent(screen.getByLabelText(`Add a step to ${task.title}`), 'submitEditing'); });
  expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('Enter a step.');
  view.rerender(<TaskChecklist task={{ ...task, recurrence: { frequency: 'daily', interval: 1 } }}/>);
  expect(screen.queryByText(/^Steps/)).toBeNull();
});
it('blocks other step changes while one is saving', async () => {
  let release!: () => void; save.mockReturnValueOnce(new Promise<void>(done => { release = done; }));
  render(<TaskChecklist task={task}/>);
  act(() => { fireEvent.press(screen.getByRole('checkbox', { name: 'Draft' })); fireEvent.press(screen.getByRole('checkbox', { name: 'Outline' })); });
  expect(save).toHaveBeenCalledTimes(1); expect(screen.getByRole('checkbox', { name: 'Outline' })).toBeDisabled();
  await act(async () => { release(); }); expect(screen.getByRole('checkbox', { name: 'Outline' })).toBeEnabled();
});
