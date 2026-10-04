import { categorySchema, createPersonalTaskSchema, dateSchema, localTimeSchema, personalTaskSchema, prioritySchema, updatePersonalTaskSchema } from '@campusflow/contracts';
import { instantAtLocalTime, localClockAt } from '@campusflow/domain';
import { z } from 'zod';
import type { PersonalTask } from '@/lib/types';

const timingMode = z.enum(['none', 'date', 'instant', 'existing']);
export function taskFormSchema(task: PersonalTask | null, timeZone = 'UTC') {
  return z.object({
    title: z.string().trim().min(1, 'Enter a title.').max(240, 'Keep the title within 240 characters.'),
    description: z.string().max(10_000),
    estimatedMinutes: z.string().trim().refine(value => value === '' || (/^\d+$/.test(value) && personalTaskSchema.shape.estimatedMinutes.safeParse(Number(value)).success), 'Enter whole minutes from 1 to 1440, or leave blank.'),
    dueMode: timingMode, dueDate: z.string(), dueTime: z.string(),
    scheduledMode: timingMode, scheduledDate: z.string(), scheduledTime: z.string(),
    recurrenceMode: z.enum(['none', 'daily', 'weekly']), interval: z.string(), weekdays: z.array(z.number().int().min(1).max(7)),
    category: categorySchema,
    priority: prioritySchema,
  }).superRefine((values, context) => {
    if (task?.completedAt && !task.recurrence && values.recurrenceMode !== 'none') context.addIssue({ code: 'custom', path: ['recurrenceMode'], message: 'Undo completion before making this task repeat.' });
    const inputs = [
      { mode: values.dueMode, date: values.dueDate, time: values.dueTime, prefix: 'due', existing: task?.due },
      { mode: values.scheduledMode, date: values.scheduledDate, time: values.scheduledTime, prefix: 'scheduled', existing: task?.scheduled },
    ];
    for (const input of inputs) {
      if (input.mode === 'existing' && !input.existing) context.addIssue({ code: 'custom', path: [`${input.prefix}Date`], message: 'Choose a date or time.' });
      if (input.mode !== 'date' && input.mode !== 'instant') continue;
      const validDate = dateSchema.safeParse(input.date).success;
      if (!validDate) context.addIssue({ code: 'custom', path: [`${input.prefix}Date`], message: 'Enter a valid date as YYYY-MM-DD.' });
      if (input.mode === 'instant') {
        const validTime = localTimeSchema.safeParse(input.time).success;
        if (!validTime) context.addIssue({ code: 'custom', path: [`${input.prefix}Time`], message: 'Enter a time as HH:MM, such as 17:00.' });
        if (validDate && validTime) {
          try { instantAtLocalTime(input.date, input.time, timeZone); }
          catch { context.addIssue({ code: 'custom', path: [`${input.prefix}Time`], message: 'This time is missing or occurs twice in your account time zone. Choose another time.' }); }
        }
      }
    }
    if (values.recurrenceMode !== 'none') {
      const interval = Number(values.interval); const max = values.recurrenceMode === 'weekly' ? 52 : 365;
      if (!Number.isInteger(interval) || interval < 1 || interval > max) context.addIssue({ code: 'custom', path: ['interval'], message: `Choose a repeat interval from 1 to ${max}.` });
      if (values.recurrenceMode === 'weekly' && !values.weekdays.length) context.addIssue({ code: 'custom', path: ['weekdays'], message: 'Choose at least one weekday.' });
      if (values.dueMode === 'none' && values.scheduledMode === 'none') context.addIssue({ code: 'custom', path: ['scheduledDate'], message: 'This recurring task needs a deadline or scheduled date.' });
    }
  });
}

export type TaskFormValues = z.infer<ReturnType<typeof taskFormSchema>>;

export function taskTimingLabel(value: PersonalTask['due'], timeZone: string): string {
  if (!value) return 'No deadline';
  if (value.kind === 'date') return value.date;
  const local = localClockAt(value.at, timeZone);
  return `${local.date} ${local.time} · ${timeZone}`;
}

export function taskFormDefaults(task: PersonalTask | null, timeZone = 'UTC'): TaskFormValues {
  const fields = (value: PersonalTask['due']) => value?.kind === 'instant' ? { mode: 'existing' as const, ...localClockAt(value.at, timeZone) }
    : { mode: value?.kind === 'date' ? 'date' as const : 'none' as const, date: value?.kind === 'date' ? value.date : '', time: '' };
  const due = fields(task?.due ?? null); const scheduled = fields(task?.scheduled ?? null);
  return {
    title: task?.title ?? '', description: task?.description ?? '',
    estimatedMinutes: task?.estimatedMinutes == null ? '' : String(task.estimatedMinutes),
    dueMode: due.mode, dueDate: due.date, dueTime: due.time,
    scheduledMode: scheduled.mode, scheduledDate: scheduled.date, scheduledTime: scheduled.time,
    recurrenceMode: task?.recurrence?.frequency ?? 'none', interval: String(task?.recurrence?.interval ?? 1), weekdays: task?.recurrence?.frequency === 'weekly' ? task.recurrence.weekdays : [],
    category: task?.category ?? 'personal', priority: task?.priority ?? 'medium',
  };
}

export function taskFormRequest(values: TaskFormValues, task: PersonalTask | null, timeZone = 'UTC') {
  const valid = taskFormSchema(task, timeZone).parse(values);
  const timing = (mode: TaskFormValues['dueMode'], date: string, time: string, existing: PersonalTask['due']) => mode === 'existing' ? existing
    : mode === 'date' ? { kind: 'date' as const, date } : mode === 'instant' ? { kind: 'instant' as const, at: instantAtLocalTime(date, time, timeZone) } : null;
  const scheduled = timing(valid.scheduledMode, valid.scheduledDate, valid.scheduledTime, task?.scheduled ?? null);
  const estimatedMinutes = valid.estimatedMinutes === '' ? null : Number(valid.estimatedMinutes);
  const recurrence = valid.recurrenceMode === 'none' ? null : valid.recurrenceMode === 'daily' ? { frequency: 'daily' as const, interval: Number(valid.interval) }
    : { frequency: 'weekly' as const, interval: Number(valid.interval), weekdays: [...new Set(valid.weekdays)].sort() };
  const changed = (value: unknown, previous: unknown) => JSON.stringify(value) !== JSON.stringify(previous ?? null);
  const sameRecurrence = recurrence === null ? !task?.recurrence
    : recurrence.frequency === task?.recurrence?.frequency && recurrence.interval === task.recurrence.interval
      && (recurrence.frequency !== 'weekly' || (task.recurrence.frequency === 'weekly'
        && recurrence.weekdays.join(',') === [...new Set(task.recurrence.weekdays)].sort().join(',')));
  const body = {
    title: valid.title, description: valid.description || null, category: valid.category, priority: valid.priority,
    due: timing(valid.dueMode, valid.dueDate, valid.dueTime, task?.due ?? null),
    ...(estimatedMinutes !== (task?.estimatedMinutes ?? null) ? { estimatedMinutes } : {}),
    ...(changed(scheduled, task?.scheduled) ? { scheduled } : {}),
    ...(!sameRecurrence ? { recurrence } : {}),
  };
  return { path: task ? `/tasks/${task.id}` : '/tasks', method: task ? 'PATCH' : 'POST',
    body: (task ? updatePersonalTaskSchema : createPersonalTaskSchema).parse(body) };
}
