import { taskFormDefaults, taskFormRequest, taskFormSchema } from '../src/features/task-form';
import type { PersonalTask } from '../src/lib/types';

const task: PersonalTask = {
  id: '10000000-0000-4000-8000-000000000001', title: 'Buy groceries', description: 'Milk', priority: 'high', category: 'personal',
  due: { kind: 'date', date: '2026-10-03' }, scheduled: null, recurrence: null, reminder: null, estimatedMinutes: 30,
  completedAt: null, snoozedUntil: null, mainGoalDate: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};

describe('personal task editor boundary (ToR 7)', () => {
  it('creates an undated task without a course and trims its title', () => {
    expect(taskFormRequest({ ...taskFormDefaults(null), title: '  Buy groceries  ' }, null)).toEqual({
      path: '/tasks', method: 'POST', body: { title: 'Buy groceries', description: null, category: 'personal', priority: 'medium', due: null },
    });
  });

  it.each(['', '2026-02-29', '2026-04-31', 'tomorrow'])('rejects invalid date %s before a request', dueDate => {
    expect(taskFormSchema(null).safeParse({ ...taskFormDefaults(null), title: 'Task', dueMode: 'date', dueDate }).success).toBe(false);
  });

  it('validates title length and controlled category/priority options', () => {
    for (const values of [{ title: ' ' }, { title: 'x'.repeat(241) }, { category: 'invalid' }, { priority: 'urgent' }]) {
      expect(taskFormSchema(task).safeParse({ ...taskFormDefaults(task), ...values }).success).toBe(false);
    }
  });

  it('sends explicit nulls when clearing description and deadline', () => {
    const request = taskFormRequest({ ...taskFormDefaults(task), description: '', dueMode: 'none' }, task);
    expect(request.body).toMatchObject({ description: null, due: null });
    expect(request).toMatchObject({ path: `/tasks/${task.id}`, method: 'PATCH' });
    expect(request.body).not.toHaveProperty('scheduled');
    expect(request.body).not.toHaveProperty('reminder');
    expect(request.body).not.toHaveProperty('estimatedMinutes');
  });

  it('preserves an existing timed deadline exactly on a title edit', () => {
    const timed = { ...task, due: { kind: 'instant' as const, at: '2026-11-01T08:30:12.345Z' } };
    const request = taskFormRequest({ ...taskFormDefaults(timed), title: 'Updated' }, timed);
    expect(request.body.due).toEqual(timed.due);
  });

  it('keeps date-only deadlines as calendar dates including leap days', () => {
    expect(taskFormRequest({ ...taskFormDefaults(task), dueDate: '2028-02-29' }, task).body.due).toEqual({ kind: 'date', date: '2028-02-29' });
  });

  it('prevents removing a recurring task’s only schedule anchor', () => {
    const recurring = { ...task, recurrence: { frequency: 'daily' as const, interval: 1 } };
    expect(taskFormSchema(recurring).safeParse({ ...taskFormDefaults(recurring), dueMode: 'none' }).success).toBe(false);
    const scheduled = { ...recurring, scheduled: { kind: 'date' as const, date: '2026-10-03' } };
    expect(taskFormSchema(scheduled).safeParse({ ...taskFormDefaults(scheduled), dueMode: 'none' }).success).toBe(true);
  });
});
