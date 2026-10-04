import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { taskOccursOn } from '@campusflow/domain';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAcademic, useAction, useTasks } from '@/features/queries';
import { TaskEditor } from '@/features/task-editor';
import type { PersonalTask } from '@/lib/types';
import { useTodayClock } from '@/features/today-clock';
import { useSessionStore } from '@/store/session';

const dateLabel = (due: PersonalTask['due']) => due?.kind === 'instant'
  ? new Date(due.at).toLocaleString() : due?.kind === 'date' ? due.date : 'No deadline';

export default function Tasks() {
  const tasks = useTasks();
  const academic = useAcademic();
  const action = useAction();
  const session = useSessionStore(state => state.session);
  const timeZone = session?.user.timeZone ?? 'UTC';
  const { date: today } = useTodayClock(timeZone);
  const busy = useRef(false);
  const [pending, setPending] = useState<string>();
  const disabled = !!pending || action.isPending;
  const [editing, setEditing] = useState<PersonalTask | null>();
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
      <State loading={tasks.isLoading} error={tasks.error} empty={tasks.data?.length === 0 ? 'No personal tasks yet.' : undefined}/>
      {tasks.data?.map(task => <Card key={task.id}>
        {task.mainGoalDate === today && <Text style={styles.mainGoal}>★ MAIN GOAL TODAY</Text>}
        <Text style={[styles.item, task.completedAt && styles.done]}>{task.title}</Text>
        <Text style={styles.meta}>{task.category} · {task.priority} · {dateLabel(task.due)}</Text>
        {task.description && <Text style={styles.meta}>{task.description}</Text>}
        <View style={styles.actions}>
          {task.recurrence ? <Text style={styles.meta}>Complete recurring occurrences from Today.</Text> :
            <Button title={task.completedAt ? 'Undo completion' : 'Complete'} tone="plain" disabled={disabled}
              onPress={() => { void run({ path: `/tasks/${task.id}/complete`, body: { completed: !task.completedAt } }); }}/>}
          {(task.mainGoalDate === today || canSelectTask(task)) && <Button
            title={pending === `/tasks/${task.id}/main-goal` ? 'Saving…' : task.mainGoalDate === today ? 'Remove Main Goal' : 'Make Main Goal today'}
            tone="plain" disabled={disabled} onPress={() => mainGoal('personalTask', task.id, task.mainGoalDate === today)}/>}
          <Button title="Edit" tone="plain" disabled={disabled} onPress={() => setEditing(task)}/>
          <Button title="Delete" tone="danger" disabled={disabled} onPress={() => { setMessage(undefined); setDeleting(task); }}/>
        </View>
      </Card>)}
      <Text style={styles.section}>University</Text>
      <State loading={academic.isLoading} error={academic.error} empty={academic.data?.length === 0 ? 'Canvas work appears here after a successful sync.' : undefined}/>
      {academic.data?.map(item => <Card key={item.id}>
        {item.mainGoalDate === today && <Text style={styles.mainGoal}>★ MAIN GOAL TODAY</Text>}
        <Text style={styles.item}>{item.title}</Text><Text style={styles.meta}>{item.kind} · {item.submissionState ?? 'unsubmitted'} · {dateLabel(item.due)}</Text>
        {(item.mainGoalDate === today || (!!session && item.submissionState !== 'submitted' && item.submissionState !== 'graded')) && <Button
          title={pending === `/academic-items/${item.id}/main-goal` ? 'Saving…' : item.mainGoalDate === today ? 'Remove Main Goal' : 'Make Main Goal today'}
          tone="plain" disabled={disabled} onPress={() => mainGoal('academic', item.id, item.mainGoalDate === today)}/>}
      </Card>)}
    </ScrollView>
    {editing !== undefined && <TaskEditor key={editing?.id ?? 'new'} task={editing} onClose={() => setEditing(undefined)}/>}
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
