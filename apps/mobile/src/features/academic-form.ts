import { academicItemSchema, createManualAcademicItemSchema, dateSchema, localTimeSchema, updateManualAcademicItemSchema } from '@campusflow/contracts';
import { instantAtLocalTime, localClockAt } from '@campusflow/domain';
import { z } from 'zod';
import type { AcademicItem } from '@/lib/types';

export function academicFormSchema(item: AcademicItem | null, timeZone: string) {
  return z.object({
    title: z.string().trim().min(1, 'Give your coursework a title.').max(240, 'Keep the title within 240 characters.'),
    kind: academicItemSchema.shape.kind, courseId: z.string(),
    dueMode: z.enum(['none', 'date', 'instant', 'existing']), dueDate: z.string(), dueTime: z.string(),
  }).superRefine((value, context) => {
    if (value.dueMode === 'existing' && !item?.due) context.addIssue({ code: 'custom', message: 'Choose a deadline.', path: ['dueMode'] });
    if (value.dueMode !== 'date' && value.dueMode !== 'instant') return;
    const validDate = dateSchema.safeParse(value.dueDate).success;
    if (!validDate) context.addIssue({ code: 'custom', message: 'Enter a valid date as YYYY-MM-DD.', path: ['dueDate'] });
    if (value.dueMode === 'instant') {
      const validTime = localTimeSchema.safeParse(value.dueTime).success;
      if (!validTime) context.addIssue({ code: 'custom', message: 'Enter a time as HH:MM, such as 17:00.', path: ['dueTime'] });
      if (validDate && validTime) try { instantAtLocalTime(value.dueDate, value.dueTime, timeZone); }
      catch { context.addIssue({ code: 'custom', message: 'That time is missing or occurs twice in your time zone. Choose another time.', path: ['dueTime'] }); }
    }
  });
}
export type AcademicFormValues = z.infer<ReturnType<typeof academicFormSchema>>;
export function academicFormDefaults(item: AcademicItem | null, timeZone: string, today: string): AcademicFormValues {
  const timing = item?.due?.kind === 'instant' ? { dueMode: 'existing' as const, ...localClockAt(item.due.at, timeZone) }
    : { dueMode: item && !item.due ? 'none' as const : 'date' as const, date: item?.due?.kind === 'date' ? item.due.date : today, time: '' };
  return { title: item?.title ?? '', kind: item?.kind ?? 'assignment', courseId: item?.courseId ?? '', dueMode: timing.dueMode, dueDate: timing.date, dueTime: timing.time };
}
export function academicFormRequest(values: AcademicFormValues, item: AcademicItem | null, timeZone: string) {
  const valid = academicFormSchema(item, timeZone).parse(values);
  const due = valid.dueMode === 'existing' ? item?.due ?? null : valid.dueMode === 'none' ? null
    : valid.dueMode === 'date' ? { kind: 'date' as const, date: valid.dueDate }
      : { kind: 'instant' as const, at: instantAtLocalTime(valid.dueDate, valid.dueTime, timeZone) };
  return { path: item ? `/academic-items/${item.id}` : '/academic-items', method: item ? 'PATCH' : 'POST',
    body: (item ? updateManualAcademicItemSchema : createManualAcademicItemSchema).parse({ title: valid.title, kind: valid.kind, courseId: valid.courseId || null, due }) };
}
