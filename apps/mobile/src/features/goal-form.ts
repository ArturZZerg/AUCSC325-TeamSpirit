import { categorySchema, createGoalSchema, timeZoneSchema, updateGoalSchema } from '@campusflow/contracts';
import { z } from 'zod';
import type { Goal } from '@/lib/types';

export const goalFormSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(240, 'Keep the title within 240 characters.'),
  category: categorySchema, timeZone: z.string().trim(),
  frequency: z.enum(['daily', 'weekly', 'weeklyTarget']),
  weekdays: z.array(z.number().int().min(1).max(7)), target: z.string(),
}).superRefine((value, context) => {
  if (!timeZoneSchema.safeParse(value.timeZone).success) context.addIssue({ code: 'custom', path: ['timeZone'], message: 'Enter a valid time zone, such as America/Edmonton.' });
  if (value.frequency === 'weekly' && !value.weekdays.length) context.addIssue({ code: 'custom', path: ['weekdays'], message: 'Choose at least one day.' });
  const target = Number(value.target);
  if (value.frequency === 'weeklyTarget' && (!Number.isInteger(target) || target < 1 || target > 7)) context.addIssue({ code: 'custom', path: ['target'], message: 'Choose a weekly target from 1 to 7.' });
});
export type GoalFormValues = z.infer<typeof goalFormSchema>;
export function goalFormDefaults(goal: Goal | null, timeZone: string): GoalFormValues {
  return { title: goal?.title ?? '', category: goal?.category ?? 'health', timeZone: goal?.timeZone ?? timeZone,
    frequency: goal?.schedule.kind ?? 'daily', weekdays: goal?.schedule.kind === 'weekly' ? goal.schedule.weekdays : [],
    target: goal?.schedule.kind === 'weeklyTarget' ? String(goal.schedule.target) : '3' };
}
export function goalFormRequest(values: GoalFormValues, goal: Goal | null) {
  const valid = goalFormSchema.parse(values);
  const schedule = valid.frequency === 'daily' ? { kind: 'daily' as const }
    : valid.frequency === 'weekly' ? { kind: 'weekly' as const, weekdays: [...new Set(valid.weekdays)].sort() }
      : { kind: 'weeklyTarget' as const, target: Number(valid.target) };
  const body = { title: valid.title, category: valid.category, timeZone: valid.timeZone, schedule };
  return { path: goal ? `/goals/${goal.id}` : '/goals', method: goal ? 'PATCH' : 'POST',
    body: (goal ? updateGoalSchema : createGoalSchema).parse(body) };
}
