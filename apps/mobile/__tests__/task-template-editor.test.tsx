import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { checklistLimit } from '@campusflow/contracts';
import Tasks from '../app/(tabs)/tasks';
import { useSessionStore } from '../src/store/session';
import { TaskTemplateEditor } from '../src/features/task-template-editor';
import { useAction } from '../src/features/queries';

jest.mock('../src/features/queries', () => ({ useTaskTemplates: () => ({ data: [], isLoading: false }), useAction: jest.fn(), useTasks: () => ({ data: [], isLoading: false }), useAcademic: () => ({ data: [], isLoading: false }), useCourses: () => ({ data: [] }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const save = jest.fn();
beforeEach(() => {
  useSessionStore.setState({ session: null });
  jest.clearAllMocks(); save.mockReset().mockResolvedValue({});
  jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>);
});
it('creates a template with optional details and ordered checklist steps', async () => {
  const close = jest.fn(); render(<TaskTemplateEditor onClose={close}/>);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Prepare for lab');
  fireEvent.changeText(screen.getByLabelText('Description'), 'Bring notes');
  fireEvent.changeText(screen.getByLabelText('Estimated minutes (optional)'), '30');
  fireEvent.press(screen.getByText('Add step'));
  fireEvent.changeText(screen.getByLabelText('Checklist step 1'), 'Read instructions');
  fireEvent.press(screen.getByText('Save template'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith({ path: '/task-templates', method: 'POST', body: {
    title: 'Prepare for lab', description: 'Bring notes', estimatedMinutes: 30, checklist: ['Read instructions'],
  } });
});
it('validates input using task messages before sending', async () => {
  render(<TaskTemplateEditor onClose={jest.fn()}/>);
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Enter a title.');
  fireEvent.changeText(screen.getByLabelText('Title'), 'Lab');
  fireEvent.changeText(screen.getByLabelText('Estimated minutes (optional)'), '0');
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Enter whole minutes from 1 to 1440, or leave blank.');
  expect(save).not.toHaveBeenCalled();
});
it('retains a failed draft for retry and cancels without saving', async () => {
  const close = jest.fn(); save.mockRejectedValueOnce(new Error('Offline'));
  render(<TaskTemplateEditor onClose={close}/>);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Lab');
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Offline');
  expect(screen.getByLabelText('Title')).toHaveDisplayValue('Lab');
  expect(close).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Save template'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  save.mockClear();
  fireEvent.press(screen.getByText('Cancel'));
  expect(save).not.toHaveBeenCalled();
});
it('opens template creation from Tasks beside the existing add task action', () => {
  useSessionStore.setState({ session: { accessToken: 'test-session', expiresAt: '2099-01-01T00:00:00Z', user: { id: '10000000-0000-4000-8000-000000000001', email: 'student@example.test', displayName: 'Student', timeZone: 'UTC', createdAt: '2026-11-14T12:00:00Z' } } });
  render(<Tasks/>);
  expect(screen.getByRole('button', { name: 'Add task' })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Add template' }));
  expect(screen.getByText('New template')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByText('New template')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'View templates' }));
  expect(screen.getByText('Task templates')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Close templates'));
  expect(screen.queryByText('Task templates')).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it('saves a title-only template with no optional details', async () => {
  const close = jest.fn(); render(<TaskTemplateEditor onClose={close}/>);
  fireEvent.changeText(screen.getByLabelText('Title'), '  Prepare for lab  ');
  fireEvent.press(screen.getByText('Save template'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith({ path: '/task-templates', method: 'POST',
    body: { title: 'Prepare for lab', description: null, estimatedMinutes: null, checklist: [] } });
});
it('enforces the checklist limit and requires nonblank steps before saving', async () => {
  const close = jest.fn();
  render(<TaskTemplateEditor initialValues={{ title: 'Lab', checklist: Array(checklistLimit).fill('Read notes') }} onClose={close}/>);
  expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled();
  fireEvent.press(screen.getByText('Remove step 30'));
  expect(screen.getByRole('button', { name: 'Add step' })).toBeEnabled();
  fireEvent.changeText(screen.getByLabelText('Checklist step 1'), '   ');
  fireEvent.press(screen.getByText('Save template'));
  await screen.findByText('Enter a step.');
  expect(save).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
it('prevents repeated saves and cancellation while creation is pending', async () => {
  let finish!: () => void;
  save.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  const close = jest.fn(); render(<TaskTemplateEditor onClose={close}/>);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Lab');
  act(() => { fireEvent.press(screen.getByText('Save template')); fireEvent.press(screen.getByText('Save template')); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(close).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  expect(close).toHaveBeenCalledTimes(1);
});
