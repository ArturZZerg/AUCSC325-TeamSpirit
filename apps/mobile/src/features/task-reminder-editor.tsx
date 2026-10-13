import { useAction } from '@/features/queries';
import { taskReminderRequest } from '@/features/task-reminder-form';
import { TimedReminderEditor } from '@/features/timed-reminder-editor';
import type { PersonalTask } from '@/lib/types';
export function TaskReminderEditor({ task, timeZone, onClose }: { task: PersonalTask; timeZone: string; onClose(): void }) {
  // This editor submits a complete reminder value from its cached baseline.
  // Preserve awaited refresh until it has its own authoritative edit gate.
  const action = useAction(undefined, { awaitRefresh: true });
  return <TimedReminderEditor title="Task reminder" subjectTitle={task.title} reminder={task.reminder} timeZone={timeZone}
    inactiveHint={task.completedAt ? 'Undo completion to reactivate a future reminder.' : undefined}
    onSave={values => action.mutateAsync(taskReminderRequest(values, task, timeZone))} onClose={onClose}/>;
}
