import { useAction } from '@/features/queries';
import { taskReminderRequest } from '@/features/task-reminder-form';
import { TimedReminderEditor } from '@/features/timed-reminder-editor';
import type { PersonalTask } from '@/lib/types';
export function TaskReminderEditor({ task, timeZone, onClose }: { task: PersonalTask; timeZone: string; onClose(): void }) {
  const action = useAction();
  return <TimedReminderEditor title="Task reminder" subjectTitle={task.title} reminder={task.reminder} timeZone={timeZone}
    inactiveHint={task.completedAt ? 'Undo completion to reactivate a future reminder.' : undefined}
    onSave={values => action.mutateAsync(taskReminderRequest(values, task, timeZone))} onClose={onClose}/>;
}
