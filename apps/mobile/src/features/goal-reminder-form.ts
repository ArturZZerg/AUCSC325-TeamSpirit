import { updateGoalSchema } from '@campusflow/contracts';
import type { Goal } from '@/lib/types';
import { timedReminderDefaults, timedReminderValue, type TimedReminderForm } from '@/features/timed-reminder-form';
export const goalReminderDefaults = (goal: Goal) => timedReminderDefaults(goal.reminder, goal.timeZone);
export function goalReminderRequest(values: TimedReminderForm, goal: Goal) {
  return { path: `/goals/${goal.id}`, method: 'PATCH', body: updateGoalSchema.parse({ reminder: timedReminderValue(values, goal.reminder, goal.timeZone, 'goal') }) };
}
