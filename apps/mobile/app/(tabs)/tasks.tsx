import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { taskOccursOn } from '@campusflow/domain';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAcademic, useAction, useTasks } from '@/features/queries';
import { TaskEditor } from '@/features/task-editor';
import { taskTimingLabel } from '@/features/task-form';
import { filterPersonalTasks, useTaskFilters } from '@/features/task-filters';
import { TaskFilterControls } from '@/features/task-filter-controls';
import { TaskReminderEditor } from '@/features/task-reminder-editor';
import type { PersonalTask } from '@/lib/types';
import { useTodayClock } from '@/features/today-clock';
import { useSessionStore } from '@/store/session';

export default function Tasks() {
  const tasks = useTasks();
  const academic = useAcademic();
  const action = useAction();
  const session = useSessionStore(state => state.session);
  const timeZone = session?.user.timeZone ?? 'UTC';
  const { date: today } = useTodayClock(timeZone);
  const { filters, update: updateFilters, reset: resetFilters } = useTaskFilters(session?.user.id);
  const visibleTasks = tasks.data ? filterPersonalTasks(tasks.data, filters) : undefined;
  const busy = useRef(false);
  const [pending, setPending] = useState<string>();
  const disabled = !!pending || action.isPending;
  const [editing, setEditing] = useState<PersonalTask | null>();
  const [reminding, setReminding] = useState<PersonalTask>();
  const [deleting, setDeleting] = useState<PersonalTask>();
  const [message, setMessage] = useState<string>();
  const run = async (request: Parameters<typeof action.mutateAsync>[0]) => {
    if (busy.current || action.isPending) return false;
    busy.current = true;
    setPending(request.path);
    setMessage(undefined);
    try { await action.mutateAsync(request); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the change. Please try again.'); return false; }
    finally { busy.current = false; setPending(undefined); }
  };
  const mainGoal = (kind: 'personalTask' | 'academic', id: string, selected: boolean) => {
    void run({ path: kind === 'personalTask' ? `/tasks/${id}/main-goal` : `/academic-items/${id}/main-goal`,
      ...(kind === 'academic' ? { method: 'PATCH' } : {}), body: { date: selected ? null : today } });
  };
  const canSelectTask = (task: PersonalTask) => !!session && !task.completedAt && (!task.recurrence || taskOccursOn({
    recurrence: task.recurrence, due: task.due ?? undefined, scheduled: task.scheduled ?? undefined,
  }, today, timeZone));

  return <Screen>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.top}><Text style={styles.title}>Tasks</Text><Button title="Add task" disabled={disabled} onPress={() => setEditing(null)}/></View>
      {message && !deleting && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
      <Text style={styles.section}>My tasks</Text>
      <TaskFilterControls filters={filters} onChange={updateFilters} onReset={resetFilters}/>
      {visibleTasks && <Text style={styles.meta}>{visibleTasks.length} personal {visibleTasks.length === 1 ? 'task' : 'tasks'}</Text>}
      <State loading={tasks.isLoading} error={tasks.error}/>
      {visibleTasks?.length === 0 && <Text style={styles.meta}>{tasks.data?.length === 0 ? 'No personal tasks yet.' : 'No personal tasks match your filters.'}</Text>}
      {visibleTasks?.map(task => <Card key={task.id}>
        {task.mainGoalDate === today && <Text style={styles.mainGoal}>★ MAIN GOAL TODAY</Text>}
        <Text style={[styles.item, task.completedAt && styles.done]}>{task.title}</Text>
        <Text style={styles.meta}>{task.category} · {task.priority} · {taskTimingLabel(task.due, timeZone)}</Text>
        {task.scheduled && <Text style={styles.meta}>Scheduled: {taskTimingLabel(task.scheduled, timeZone)}</Text>}
        {task.recurrence && <Text style={styles.meta}>Every {task.recurrence.interval} {task.recurrence.frequency === 'daily' ? (task.recurrence.interval === 1 ? 'day' : 'days') : `${task.recurrence.interval === 1 ? 'week' : 'weeks'} · ${task.recurrence.weekdays.map(day => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1]).join(', ')}`}</Text>}
        {task.description && <Text style={styles.meta}>{task.description}</Text>}
        {task.estimatedMinutes !== null && <Text style={styles.meta}>Estimated duration: {task.estimatedMinutes} min</Text>}
        {task.reminder && <Text style={styles.meta}>Reminder: {taskTimingLabel(task.reminder, timeZone)}{task.reminder.kind === 'date' ? ' · Delivery time needed' : ''}</Text>}
        <View style={styles.actions}>
          {!task.completedAt && !task.recurrence && <Button title="Focus" tone="plain" disabled={disabled}
            onPress={() => router.push({ pathname: '/focus', params: { taskId: task.id } })}/>}
          {task.recurrence ? <Text style={styles.meta}>Complete recurring occurrences from Today.</Text> :
            <Button title={task.completedAt ? 'Undo completion' : 'Complete'} tone="plain" disabled={disabled}
              onPress={() => { void run({ path: `/tasks/${task.id}/complete`, body: { completed: !task.completedAt } }); }}/>}
          {(task.mainGoalDate === today || canSelectTask(task)) && <Button
            title={pending === `/tasks/${task.id}/main-goal` ? 'Saving…' : task.mainGoalDate === today ? 'Remove Main Goal' : 'Make Main Goal today'}
            tone="plain" disabled={disabled} onPress={() => mainGoal('personalTask', task.id, task.mainGoalDate === today)}/>}
          <Button title="Edit" tone="plain" disabled={disabled} onPress={() => setEditing(task)}/>
          <Button title={task.reminder ? 'Edit reminder' : 'Set reminder'} tone="plain" disabled={disabled} onPress={() => setReminding(task)}/>
          <Button title="Delete" tone="danger" disabled={disabled} onPress={() => { setMessage(undefined); setDeleting(task); }}/>
        </View>
      </Card>)}
      <Text style={styles.section}>University</Text>
      <Button title="Browse coursework" tone="plain" onPress={() => router.push('/academics')}/>
      <State loading={academic.isLoading} error={academic.error} empty={academic.data?.length === 0 ? 'Canvas work appears here after a successful sync.' : undefined}/>
      {academic.data?.map(item => <Card key={item.id}>
        {item.mainGoalDate === today && <Text style={styles.mainGoal}>★ MAIN GOAL TODAY</Text>}
        <Text style={styles.item}>{item.title}</Text><Text style={styles.meta}>{item.kind} · {item.submissionState ?? 'unsubmitted'} · {taskTimingLabel(item.due, timeZone)}</Text>
        {(item.mainGoalDate === today || (!!session && item.submissionState !== 'submitted' && item.submissionState !== 'graded')) && <Button
          title={pending === `/academic-items/${item.id}/main-goal` ? 'Saving…' : item.mainGoalDate === today ? 'Remove Main Goal' : 'Make Main Goal today'}
          tone="plain" disabled={disabled} onPress={() => mainGoal('academic', item.id, item.mainGoalDate === today)}/>}
      </Card>)}
    </ScrollView>
    {editing !== undefined && <TaskEditor key={editing?.id ?? 'new'} task={editing} timeZone={timeZone} onClose={() => setEditing(undefined)}/>}
    {reminding && <TaskReminderEditor key={reminding.id} task={reminding} timeZone={timeZone} onClose={() => setReminding(undefined)}/>}
    {deleting && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!disabled) setDeleting(undefined); }}>
      <SafeAreaView style={styles.confirm}><Card>
        <Text style={styles.section}>Delete task?</Text><Text style={styles.meta}>Delete “{deleting.title}” and its reminder?</Text>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={disabled ? 'Deleting…' : 'Delete task'} tone="danger" disabled={disabled} onPress={() => {
          void run({ path: `/tasks/${deleting.id}`, method: 'DELETE' }).then(saved => { if (saved) setDeleting(undefined); });
        }}/>
        <Button title="Keep task" tone="plain" disabled={disabled} onPress={() => setDeleting(undefined)}/>
      </Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

const styles = StyleSheet.create({ content: { padding: 16, gap: 12 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { fontSize: 28, color: colors.ink, fontWeight: '800' }, section: { fontSize: 19, fontWeight: '800', color: colors.ink }, actions: { gap: 7 }, mainGoal: { color: colors.moss, fontWeight: '800' }, item: { fontSize: 16, fontWeight: '700', color: colors.ink }, done: { textDecorationLine: 'line-through', color: colors.muted }, meta: { color: colors.muted }, error: { color: colors.coral }, confirm: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' } });
