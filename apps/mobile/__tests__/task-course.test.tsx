import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { TaskEditorForm } from '../src/features/task-editor';
import { taskFormDefaults, taskFormRequest } from '../src/features/task-form';
import { parseQuickAdd } from '../src/features/quick-add';
import { TaskRow } from '../src/features/task-row';
import { useAction } from '../src/features/queries';
import type { Course, PersonalTask } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

jest.mock('../src/features/queries', () => ({ useAction: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
const psy: Course = { id: '60000000-0000-4000-8000-000000000001', externalId: 'a', name: 'Cognitive Psychology', code: 'PSY 223', active: true, source: 'manual', color: 'plum' };
const stats: Course = { id: '60000000-0000-4000-8000-000000000002', externalId: 'b', name: 'Statistics', code: 'STAT 151', active: true, source: 'manual', color: 'teal' };
const old: Course = { id: '60000000-0000-4000-8000-000000000003', externalId: 'c', name: 'Old', code: 'PSY 100', active: false, source: 'manual', color: null };
const task: PersonalTask = { ...snapshotFixture().personalTasks[0], recurrence: null, courseId: null, category: 'personal' };
const save = jest.fn();
beforeEach(() => { save.mockReset().mockResolvedValue({}); jest.mocked(useAction).mockReturnValue({ mutateAsync: save, isPending: false } as unknown as ReturnType<typeof useAction>); });

describe('task course in requests', () => {
  it('sends a chosen course on create and only changed courses on edit', () => {
    expect(taskFormRequest({ ...taskFormDefaults(null), title: 'Read', courseId: psy.id }, null).body).toMatchObject({ courseId: psy.id });
    expect(taskFormRequest({ ...taskFormDefaults(null), title: 'Read' }, null).body).not.toHaveProperty('courseId');
    const linked = { ...task, courseId: psy.id };
    expect(taskFormRequest(taskFormDefaults(linked), linked).body).not.toHaveProperty('courseId');
    expect(taskFormRequest({ ...taskFormDefaults(linked), courseId: '' }, linked).body).toMatchObject({ courseId: null });
    expect(taskFormRequest({ ...taskFormDefaults(linked), courseId: stats.id }, linked).body).toMatchObject({ courseId: stats.id });
  });
});

describe('task editor course picker', () => {
  it('offers active courses, keeps a saved inactive one, and makes course work university by default', async () => {
    render(<TaskEditorForm task={null} courses={[psy, stats, old]} onClose={jest.fn()}/>);
    expect(screen.queryByRole('radio', { name: 'PSY 100' })).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4 notes');
    fireEvent.press(screen.getByRole('radio', { name: 'PSY 223' }));
    expect(screen.getByRole('radio', { name: 'University' })).toBeChecked();
    await act(async () => { fireEvent.press(screen.getByText('Save task')); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ courseId: psy.id, category: 'university' }) }));
  });
  it('hides the picker without courses and shows a saved archived course', () => {
    const view = render(<TaskEditorForm task={null} onClose={jest.fn()}/>);
    expect(screen.queryByText('Course')).toBeNull();
    view.unmount(); render(<TaskEditorForm task={{ ...task, courseId: old.id }} courses={[psy, old]} onClose={jest.fn()}/>);
    expect(screen.getByRole('radio', { name: 'PSY 100' })).toBeChecked();
  });
  it('keeps an explicit category when a course is chosen later', () => {
    render(<TaskEditorForm task={null} courses={[psy]} onClose={jest.fn()}/>);
    fireEvent.press(screen.getByRole('radio', { name: 'Work' })); fireEvent.press(screen.getByRole('radio', { name: 'PSY 223' }));
    expect(screen.getByRole('radio', { name: 'Work' })).toBeChecked();
  });
});

describe('quick add course tags', () => {
  it('links a unique active course by full code or a 3+ character prefix', () => {
    expect(parseQuickAdd('Read ch 4 #psy223', '2026-10-15', '2026-10-15', [psy, stats, old]).values).toMatchObject({ courseId: psy.id, category: 'university', title: 'Read ch 4' });
    expect(parseQuickAdd('Problem set #stat', '2026-10-15', '2026-10-15', [psy, stats]).details).toEqual(['STAT 151']);
  });
  it('falls back to categories for ambiguous, short or unknown tags', () => {
    const twin = { ...stats, id: '60000000-0000-4000-8000-000000000004', code: 'PSY 101' };
    expect(parseQuickAdd('Read #psy', '2026-10-15', '2026-10-15', [psy, twin]).values.courseId).toBeUndefined();
    expect(parseQuickAdd('Read #ps', '2026-10-15', '2026-10-15', [psy]).values.courseId).toBeUndefined();
    expect(parseQuickAdd('Gym #gym', '2026-10-15', '2026-10-15', [psy]).values).toMatchObject({ category: 'fitness' });
    expect(parseQuickAdd('Read #psy223', '2026-10-15').values.courseId).toBeUndefined();
  });
});

it('shows the course code and colour on a task row', () => {
  render(<TaskRow task={task} today="2026-10-15" timeZone="America/Edmonton" expanded={false} disabled={false} isMainGoal={false} canChangeMainGoal={false}
    onToggleExpanded={jest.fn()} onAction={jest.fn()} course={{ label: 'PSY 223', color: '#765580' }}/>);
  expect(screen.getByText('PSY 223')).toBeOnTheScreen(); expect(screen.queryByText('Personal')).toBeNull();
});
