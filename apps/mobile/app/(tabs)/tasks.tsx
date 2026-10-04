import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAcademic, useAction, useTasks } from '@/features/queries';
import { TaskEditor } from '@/features/task-editor';
import type { PersonalTask } from '@/lib/types';

const dateLabel = (due: PersonalTask['due']) => due?.kind === 'instant'
  ? new Date(due.at).toLocaleString() : due?.kind === 'date' ? due.date : 'No deadline';

export default function Tasks() {
  const tasks = useTasks();
  const academic = useAcademic();
  const action = useAction();
  const [editing, setEditing] = useState<PersonalTask | null>();
  const [deleting, setDeleting] = useState<PersonalTask>();
  const [message, setMessage] = useState<string>();
  const run = async (request: Parameters<typeof action.mutateAsync>[0]) => {
    setMessage(undefined);
    try { await action.mutateAsync(request); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the change. Please try again.'); return false; }
  };

  return <Screen>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.top}><Text style={styles.title}>Tasks</Text><Button title="Add task" disabled={action.isPending} onPress={() => setEditing(null)}/></View>
      {message && !deleting && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
      <Text style={styles.section}>My tasks</Text>
      <State loading={tasks.isLoading} error={tasks.error} empty={tasks.data?.length === 0 ? 'No personal tasks yet.' : undefined}/>
      {tasks.data?.map(task => <Card key={task.id}>
        <Text style={[styles.item, task.completedAt && styles.done]}>{task.title}</Text>
        <Text style={styles.meta}>{task.category} · {task.priority} · {dateLabel(task.due)}</Text>
        {task.description && <Text style={styles.meta}>{task.description}</Text>}
        <View style={styles.actions}>
          {task.recurrence ? <Text style={styles.meta}>Complete recurring occurrences from Today.</Text> :
            <Button title={task.completedAt ? 'Undo completion' : 'Complete'} tone="plain" disabled={action.isPending}
              onPress={() => { void run({ path: `/tasks/${task.id}/complete`, body: { completed: !task.completedAt } }); }}/>}
          <Button title="Edit" tone="plain" disabled={action.isPending} onPress={() => setEditing(task)}/>
          <Button title="Delete" tone="danger" disabled={action.isPending} onPress={() => { setMessage(undefined); setDeleting(task); }}/>
        </View>
      </Card>)}
      <Text style={styles.section}>University</Text>
      <State loading={academic.isLoading} error={academic.error} empty={academic.data?.length === 0 ? 'Canvas work appears here after a successful sync.' : undefined}/>
      {academic.data?.map(item => <Card key={item.id}><Text style={styles.item}>{item.title}</Text><Text style={styles.meta}>{item.kind} · {item.submissionState ?? 'unsubmitted'} · {dateLabel(item.due)}</Text></Card>)}
    </ScrollView>
    {editing !== undefined && <TaskEditor key={editing?.id ?? 'new'} task={editing} onClose={() => setEditing(undefined)}/>}
    {deleting && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!action.isPending) setDeleting(undefined); }}>
      <SafeAreaView style={styles.confirm}><Card>
        <Text style={styles.section}>Delete task?</Text><Text style={styles.meta}>Delete “{deleting.title}” and its reminder?</Text>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={action.isPending ? 'Deleting…' : 'Delete task'} tone="danger" disabled={action.isPending} onPress={() => {
          void run({ path: `/tasks/${deleting.id}`, method: 'DELETE' }).then(saved => { if (saved) setDeleting(undefined); });
        }}/>
        <Button title="Keep task" tone="plain" disabled={action.isPending} onPress={() => setDeleting(undefined)}/>
      </Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

const styles = StyleSheet.create({ content: { padding: 16, gap: 12 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { fontSize: 28, color: colors.ink, fontWeight: '800' }, section: { fontSize: 19, fontWeight: '800', color: colors.ink }, actions: { gap: 7 }, item: { fontSize: 16, fontWeight: '700', color: colors.ink }, done: { textDecorationLine: 'line-through', color: colors.muted }, meta: { color: colors.muted }, error: { color: colors.coral }, confirm: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' } });
