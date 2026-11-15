import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TaskTemplateList } from '../src/features/task-template-list';
import { useAction, useTaskTemplates } from '../src/features/queries';

jest.mock('../src/features/queries', () => ({ useTaskTemplates: jest.fn(), useAction: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const refetch = jest.fn();
const save = jest.fn();
const template = { id: '10000000-0000-4000-8000-000000000001', title: 'Prepare for lab',
  description: 'Bring notes', estimatedMinutes: 30, checklist: ['Read instructions', 'Pack equipment'],
  createdAt: '2026-11-14T12:00:00Z', updatedAt: '2026-11-14T12:00:00Z' };
function show(state: Partial<ReturnType<typeof useTaskTemplates>>) {
  jest.mocked(useTaskTemplates).mockReturnValue({ data: undefined, error: null, isLoading: false, isFetching: false, refetch,
    ...state } as ReturnType<typeof useTaskTemplates>);
}
beforeEach(() => { jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});
it('displays template details and ordered checklist steps and closes', () => {
  show({ data: [template, { ...template, id: '10000000-0000-4000-8000-000000000002', title: 'Simple task',
    description: null, estimatedMinutes: null, checklist: [] }] });
  const close = jest.fn(); render(<TaskTemplateList onClose={close}/>);
  expect(screen.getByText('Prepare for lab')).toBeOnTheScreen();
  expect(screen.getByText('Bring notes')).toBeOnTheScreen();
  expect(screen.getByText('30 min')).toBeOnTheScreen();
  expect(screen.getByText('1. Read instructions')).toBeOnTheScreen();
  expect(screen.getByText('2. Pack equipment')).toBeOnTheScreen();
  expect(screen.getByText('Simple task')).toBeOnTheScreen();
  expect(screen.getAllByText('Checklist')).toHaveLength(1);
  fireEvent.press(screen.getByText('Close templates')); expect(close).toHaveBeenCalledTimes(1);
});
it('distinguishes loading from an empty collection', () => {
  show({ isLoading: true }); const view = render(<TaskTemplateList onClose={jest.fn()}/>);
  expect(screen.getByText('Loading templates…')).toBeOnTheScreen();
  expect(screen.queryByText('No templates yet.')).toBeNull();
  show({ data: [] }); view.rerender(<TaskTemplateList onClose={jest.fn()}/>);
  expect(screen.getByText('No templates yet.')).toBeOnTheScreen();
});
it('shows an error with retry and keeps saved templates visible', () => {
  show({ error: new Error('Offline'), data: [template] });
  render(<TaskTemplateList onClose={jest.fn()}/>);
  expect(screen.getByRole('alert')).toHaveTextContent(/Could not refresh templates\./);
  expect(screen.getByText('Prepare for lab')).toBeOnTheScreen();
  expect(screen.queryByText('No templates yet.')).toBeNull();
  fireEvent.press(screen.getByText('Retry')); expect(refetch).toHaveBeenCalledTimes(1);
});

it('opens the prefilled editor and saves edits without mutating the displayed template object', async () => {
  show({ data: [template] }); render(<TaskTemplateList onClose={jest.fn()}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Edit template' }));
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('Prepare for lab');
  expect(screen.getByLabelText('Description')).toHaveDisplayValue('Bring notes');
  expect(screen.getByLabelText('Estimated minutes (optional)')).toHaveDisplayValue('30');
  expect(screen.getByLabelText('Checklist step 1')).toHaveDisplayValue('Read instructions');
  fireEvent.changeText(screen.getByLabelText('Title'), 'Prepare for chemistry lab');
  fireEvent.changeText(screen.getByLabelText('Description'), '');
  fireEvent.changeText(screen.getByLabelText('Estimated minutes (optional)'), '');
  fireEvent.press(screen.getByText('Remove step 2'));
  fireEvent.changeText(screen.getByLabelText('Checklist step 1'), 'Read safety notes');
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Task templates');
  expect(save).toHaveBeenCalledWith({ path: '/task-templates/' + template.id, method: 'PATCH',
    body: { title: 'Prepare for chemistry lab', description: null, estimatedMinutes: null, checklist: ['Read safety notes'] } });
  expect(template.title).toBe('Prepare for lab');
  expect(template.checklist).toEqual(['Read instructions', 'Pack equipment']);
});
it('keeps invalid edits and failed saves in the editor, and cancels without another write', async () => {
  show({ data: [template] }); render(<TaskTemplateList onClose={jest.fn()}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Edit template' }));
  fireEvent.changeText(screen.getByLabelText('Title'), '');
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Enter a title.');
  expect(save).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Title'), 'Retry this draft');
  save.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Offline');
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('Retry this draft');
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.getByText('Task templates')).toBeOnTheScreen();
  expect(save).toHaveBeenCalledTimes(1);
});

it('prefills the existing task editor, lets the user adjust copied values and saves fresh checklist steps', async () => {
  const close = jest.fn();
  show({ data: [template] }); render(<TaskTemplateList onClose={close}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Use template' }));
  expect(screen.getByText('New task')).toBeOnTheScreen();
  expect(screen.getByLabelText('Title')).toHaveDisplayValue(template.title);
  expect(screen.getByLabelText('Description')).toHaveDisplayValue(template.description);
  expect(screen.getByLabelText('Estimated minutes (optional)')).toHaveDisplayValue('30');
  expect(screen.getByLabelText('Checklist step 1')).toHaveDisplayValue('Read instructions');
  expect(save).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Title'), 'Prepare for chemistry');
  fireEvent.changeText(screen.getByLabelText('Checklist step 1'), 'Read safety instructions');
  fireEvent.press(screen.getByText('Save task'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Task templates')).toBeNull();
  expect(save).toHaveBeenCalledWith({ path: '/tasks', method: 'POST', body: expect.objectContaining({
    title: 'Prepare for chemistry', description: 'Bring notes', estimatedMinutes: 30,
    requestKey: expect.any(String),
    checklist: [
      { id: expect.any(String), title: 'Read safety instructions' },
      { id: expect.any(String), title: 'Pack equipment' },
    ],
  }) });
  const body = save.mock.calls[0][0].body;
  expect(new Set(body.checklist.map((step: { id: string }) => step.id)).size).toBe(2);
  expect(body).not.toHaveProperty('templateId');
  expect(template.title).toBe('Prepare for lab');
  expect(template.checklist[0]).toBe('Read instructions');
});
it('cancels a template-based task without creating anything', () => {
  show({ data: [{ ...template, description: null, estimatedMinutes: null, checklist: [] }] });
  const close = jest.fn(); render(<TaskTemplateList onClose={close}/>);
  fireEvent.press(screen.getByText('Use template'));
  expect(screen.getByLabelText('Description')).toHaveDisplayValue('');
  expect(screen.getByLabelText('Estimated minutes (optional)')).toHaveDisplayValue('');
  fireEvent.press(screen.getByText('Cancel'));
  expect(close).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Task templates')).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
it('keeps a failed task draft and reuses its creation and checklist identities on retry', async () => {
  const close = jest.fn();
  show({ data: [template] }); render(<TaskTemplateList onClose={close}/>);
  fireEvent.press(screen.getByText('Use template'));
  save.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.press(screen.getByText('Save task'));
  await screen.findByText('Offline');
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveDisplayValue(template.title);
  const first = save.mock.calls[0][0];
  fireEvent.press(screen.getByText('Save task'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Task templates')).toBeNull();
  expect(save.mock.calls[1][0]).toEqual(first);
});

it('requires confirmation to delete a template and returns to the refreshed list', async () => {
  show({ data: [template] }); render(<TaskTemplateList onClose={jest.fn()}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Delete template' }));
  expect(screen.getByText('Delete template?')).toBeOnTheScreen();
  expect(screen.getByText(/Tasks already created from it will stay unchanged/)).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Keep template'));
  expect(screen.getByText('Task templates')).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Delete template' }));
  save.mockImplementationOnce(async () => { show({ data: [] }); return { deleted: true }; });
  fireEvent.press(screen.getByRole('button', { name: 'Delete template' }));
  await screen.findByText('No templates yet.');
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith({ path: '/task-templates/' + template.id, method: 'DELETE' });
  expect(screen.queryByText('Delete template?')).toBeNull();
});
it('keeps the confirmation and template available when deletion fails, with a working retry', async () => {
  show({ data: [template] }); render(<TaskTemplateList onClose={jest.fn()}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Delete template' }));
  save.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.press(screen.getByRole('button', { name: 'Delete template' }));
  await screen.findByText('Offline');
  expect(screen.getByText('Delete template?')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Keep template' })).toBeEnabled();
  save.mockImplementationOnce(async () => { show({ data: [] }); return { deleted: true }; });
  fireEvent.press(screen.getByRole('button', { name: 'Delete template' }));
  await screen.findByText('No templates yet.');
  expect(save).toHaveBeenCalledTimes(2);
});

it('duplicates copied values through creation without changing the source template', async () => {
  show({ data: [template] }); render(<TaskTemplateList onClose={jest.fn()}/>);
  fireEvent.press(screen.getByText('Duplicate template'));
  expect(screen.getByText('New template')).toBeOnTheScreen();
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('Copy of Prepare for lab');
  expect(screen.getByLabelText('Description')).toHaveDisplayValue('Bring notes');
  expect(screen.getByLabelText('Estimated minutes (optional)')).toHaveDisplayValue('30');
  expect(screen.getByLabelText('Checklist step 1')).toHaveDisplayValue('Read instructions');
  expect(save).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Checklist step 1'), 'Review safety instructions');
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Task templates');
  expect(save).toHaveBeenCalledWith({ path: '/task-templates', method: 'POST', body: {
    title: 'Copy of Prepare for lab', description: 'Bring notes', estimatedMinutes: 30,
    checklist: ['Review safety instructions', 'Pack equipment'],
  } });
  expect(template.title).toBe('Prepare for lab');
  expect(template.checklist).toEqual(['Read instructions', 'Pack equipment']);
  expect(save.mock.calls[0][0].body).not.toHaveProperty('id');
});
it('bounds a duplicated title to the existing limit and cancels without saving', () => {
  const title = 'x'.repeat(240);
  show({ data: [{ ...template, title, description: null, estimatedMinutes: null, checklist: [] }] });
  render(<TaskTemplateList onClose={jest.fn()}/>);
  fireEvent.press(screen.getByText('Duplicate template'));
  expect(screen.getByLabelText('Title')).toHaveDisplayValue(('Copy of ' + title).slice(0, 240));
  expect(screen.getByLabelText('Description')).toHaveDisplayValue('');
  expect(screen.getByLabelText('Estimated minutes (optional)')).toHaveDisplayValue('');
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.getByText('Task templates')).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled();
});

it('retains a failed duplicate draft and retries creation without editing the source', async () => {
  show({ data: [template] }); render(<TaskTemplateList onClose={jest.fn()}/>);
  fireEvent.press(screen.getByText('Duplicate template'));
  save.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Offline');
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('Copy of Prepare for lab');
  expect(screen.getByLabelText('Checklist step 1')).toHaveDisplayValue('Read instructions');
  expect(template.checklist).toEqual(['Read instructions', 'Pack equipment']);
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Task templates');
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
  expect(save.mock.calls[1][0]).toMatchObject({ path: '/task-templates', method: 'POST' });
});
