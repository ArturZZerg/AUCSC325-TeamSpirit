import { useAction } from '@/features/queries';
import { goalReminderRequest } from '@/features/goal-reminder-form';
import { TimedReminderEditor } from '@/features/timed-reminder-editor';
import type { Goal } from '@/lib/types';
export function GoalReminderEditor({ goal, onClose }: { goal: Goal; onClose(): void }) {
  const action = useAction();
  return <TimedReminderEditor title="Goal reminder" subjectTitle={goal.title} reminder={goal.reminder} timeZone={goal.timeZone} zoneLabel="goal"
    inactiveHint={goal.pausedAt ? 'Resume this goal to reactivate a future reminder.' : undefined}
    onSave={values => action.mutateAsync(goalReminderRequest(values, goal))} onClose={onClose}/>;
}
