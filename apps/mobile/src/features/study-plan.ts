import { createPersonalTaskSchema, dateSchema, localTimeSchema } from '@campusflow/contracts';
import { instantAtLocalTime, localDateAt } from '@campusflow/domain';
import { z } from 'zod';
import { taskTimingLabel } from './task-form';
import type { AcademicItem } from '@/lib/types';

export const studySteps = [
  { id: 'outline', label: 'Read & outline', prefix: 'Outline', detail: 'Read the requirements and make a short plan.' },
  { id: 'work', label: 'Make progress', prefix: 'Work on', detail: 'Choose one section or problem to finish.' },
  { id: 'review', label: 'Review & practise', prefix: 'Review', detail: 'Check your work or practise without your notes.' },
] as const;

export function studyPlanSchema(timeZone: string) {
  return z.object({
    title: z.string().trim().min(1, 'Give your study task a title.').max(240, 'Keep the title within 240 characters.'),
    notes: z.string().max(8000, 'Keep your notes within 8000 characters.'),
    date: z.string().refine(value => dateSchema.safeParse(value).success, 'Enter a valid date as YYYY-MM-DD.'),
    time: z.string().trim(),
    minutes: z.enum(['25', '50', '90']),
  }).superRefine((value, context) => {
    if (!value.time) return;
    if (!localTimeSchema.safeParse(value.time).success) {
      context.addIssue({ code: 'custom', path: ['time'], message: 'Enter a time as HH:MM, such as 14:30.' });
      return;
    }
    try { instantAtLocalTime(value.date, value.time, timeZone); }
    catch { context.addIssue({ code: 'custom', path: ['time'], message: 'That time is missing or occurs twice in your time zone. Choose another time.' }); }
  });
}
export type StudyPlanValues = z.infer<ReturnType<typeof studyPlanSchema>>;

export function studyTaskTitle(item: AcademicItem, step: typeof studySteps[number]): string {
  return `${step.prefix}: ${item.title}`.slice(0, 240);
}

export function studyPlanRequest(item: AcademicItem, course: string | undefined, values: StudyPlanValues, timeZone: string) {
  const valid = studyPlanSchema(timeZone).parse(values);
  // Context is a note captured when planning, not a live link or Canvas submission.
  const description = [
    `Coursework: ${item.title.slice(0, 1000)}`,
    course ? `Course: ${course.slice(0, 240)}` : undefined,
    `Deadline when planned: ${taskTimingLabel(item.due, timeZone)}`,
    '', valid.notes,
  ].filter(line => line !== undefined).join('\n');
  return { path: '/tasks', method: 'POST', body: createPersonalTaskSchema.parse({
    title: valid.title, description, category: 'university', priority: 'medium',
    due: null, scheduled: valid.time ? { kind: 'instant', at: instantAtLocalTime(valid.date, valid.time, timeZone) }
      : { kind: 'date', date: valid.date }, estimatedMinutes: Number(valid.minutes),
  }) };
}

export function studyAfterDeadline(item: AcademicItem, date: string, timeZone: string): boolean {
  const dueDate = item.due?.kind === 'date' ? item.due.date
    : item.due?.kind === 'instant' ? localDateAt(item.due.at, timeZone) : undefined;
  return !!dueDate && date > dueDate;
}
