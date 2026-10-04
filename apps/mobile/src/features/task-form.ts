import { categorySchema, createPersonalTaskSchema, dateSchema, prioritySchema, updatePersonalTaskSchema } from '@campusflow/contracts';
import { z } from 'zod';
import type { PersonalTask } from '@/lib/types';

export function taskFormSchema(task: PersonalTask | null) {
  return z.object({
    title: z.string().trim().min(1, 'Enter a title.').max(240, 'Keep the title within 240 characters.'),
    description: z.string().max(10_000),
    dueMode: z.enum(['none', 'date', 'existing']),
    dueDate: z.string(),
    category: categorySchema,
    priority: prioritySchema,
  }).superRefine((values, context) => {
    if (values.dueMode === 'date') {
      const date = dateSchema.safeParse(values.dueDate);
      if (!date.success) context.addIssue({ code: 'custom', path: ['dueDate'], message: 'Enter a valid date as YYYY-MM-DD.' });
    }
    if (values.dueMode === 'existing' && !task?.due) {
      context.addIssue({ code: 'custom', path: ['dueDate'], message: 'Choose a deadline.' });
    }
    if (task?.recurrence && !task.scheduled && values.dueMode === 'none') {
      context.addIssue({ code: 'custom', path: ['dueDate'], message: 'This recurring task needs a deadline or scheduled date.' });
    }
  });
}

export type TaskFormValues = z.infer<ReturnType<typeof taskFormSchema>>;

export function taskFormDefaults(task: PersonalTask | null): TaskFormValues {
  return {
    title: task?.title ?? '', description: task?.description ?? '',
    dueMode: task?.due?.kind === 'instant' ? 'existing' : task?.due?.kind === 'date' ? 'date' : 'none',
    dueDate: task?.due?.kind === 'date' ? task.due.date : '',
    category: task?.category ?? 'personal', priority: task?.priority ?? 'medium',
  };
}

export function taskFormRequest(values: TaskFormValues, task: PersonalTask | null) {
  const valid = taskFormSchema(task).parse(values);
  const body = {
    title: valid.title, description: valid.description || null, category: valid.category, priority: valid.priority,
    due: valid.dueMode === 'existing' ? task?.due : valid.dueMode === 'date' ? { kind: 'date' as const, date: valid.dueDate } : null,
  };
  return { path: task ? `/tasks/${task.id}` : '/tasks', method: task ? 'PATCH' : 'POST',
    body: (task ? updatePersonalTaskSchema : createPersonalTaskSchema).parse(body) };
}
