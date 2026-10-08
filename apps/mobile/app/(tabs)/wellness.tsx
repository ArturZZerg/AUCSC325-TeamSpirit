import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { goalOccursOn, weeklyGoalProgress } from '@campusflow/domain';
import { ZodError } from 'zod';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAction, useGoals, useGoalHistory, useWellness } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { GoalEditor } from '@/features/goal-editor';
import { GoalReminderEditor } from '@/features/goal-reminder-editor';
import { taskTimingLabel } from '@/features/task-form';
import { BreathingPause } from '@/features/breathing-pause';
import { wellnessFormRequest } from '@/features/wellness-form';
import { useSessionStore } from '@/store/session';
import type { Goal } from '@/lib/types';

export default function WellnessScreen() {
  const goals = useGoals(); const entries = useWellness(); const action = useAction();
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date: today } = useTodayClock(timeZone);
  const guard = useRef(false); const [pending, setPending] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [editing, setEditing] = useState<Goal | null>(); const [deleting, setDeleting] = useState<Goal>();
  const [history, setHistory] = useState<Goal>();
  const [reminding, setReminding] = useState<Goal>();
  const [note, setNote] = useState(''); const [mood, setMood] = useState('3');
  const [energy, setEnergy] = useState(''); const [stress, setStress] = useState('');
  const disabled = !!pending || action.isPending;
  const run = async (key: string, operation: () => Promise<unknown>) => {
    if (guard.current || action.isPending) return false;
    guard.current = true; setPending(key); setMessage(undefined);
    try { await operation(); return true; }
    catch (error) { setMessage(error instanceof ZodError ? error.issues[0].message : error instanceof Error ? error.message : 'Could not save the change. Please try again.'); return false; }
    finally { guard.current = false; setPending(undefined); }
  };

  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Wellness</Text><Text style={styles.sub}>Small routines that support your week.</Text>
    {message && !deleting && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <View style={styles.top}><Text style={styles.section}>Your goals</Text><View style={styles.buttons}>
      <Button title="Browse routine ideas" tone="plain" disabled={disabled} onPress={() => router.push('/routines')}/>
      <Button title="Add goal" disabled={disabled} onPress={() => setEditing(null)}/></View></View>
    <State loading={goals.isLoading} error={goals.error} empty={goals.data?.length === 0 ? 'Create a daily or weekly goal to begin a gentle routine.' : undefined}/>
    {goals.data?.map(goal => <GoalCard key={goal.id} goal={goal} disabled={disabled} pending={pending === goal.id}
      onAction={request => { void run(goal.id, () => action.mutateAsync(request)); }}
      onEdit={() => setEditing(goal)} onReminder={() => setReminding(goal)} onHistory={() => setHistory(goal)} onDelete={() => { setMessage(undefined); setDeleting(goal); }}/>) }
    <Card><Text style={styles.section}>Today’s check-in</Text><Text style={styles.meta}>{today}</Text>
      <Field label="Mood (1–5)" value={mood} onChangeText={setMood} keyboardType="number-pad" editable={!disabled}/>
      <Field label="Energy (1–5, optional)" value={energy} onChangeText={setEnergy} keyboardType="number-pad" editable={!disabled}/>
      <Field label="Stress (1–5, optional)" value={stress} onChangeText={setStress} keyboardType="number-pad" editable={!disabled}/>
      <Field label="A short note" value={note} onChangeText={setNote} multiline placeholder="What would help today?" editable={!disabled}/>
      <Button title={pending === 'check-in' ? 'Saving…' : 'Save check-in'} disabled={disabled} onPress={() => {
        void run('check-in', () => action.mutateAsync(wellnessFormRequest(today, { mood, energy, stress, note }))).then(saved => { if (saved) setNote(''); });
      }}/></Card>
    <BreathingPause/>
    <Text style={styles.section}>Check-in history</Text><State loading={entries.isLoading} error={entries.error}/>
    {entries.data?.map(entry => <Card key={entry.id}><Text style={styles.item}>{entry.date}</Text><Text style={styles.meta}>Mood {entry.mood ?? '—'} · Energy {entry.energy ?? '—'} · Stress {entry.stress ?? '—'}</Text>{entry.note && <Text>{entry.note}</Text>}</Card>)}
  </ScrollView>
    {editing !== undefined && <GoalEditor key={editing?.id ?? 'new'} goal={editing} timeZone={timeZone} onClose={() => setEditing(undefined)}/>}
    {reminding && <GoalReminderEditor key={reminding.id} goal={reminding} onClose={() => setReminding(undefined)}/>}
    {history && <GoalHistory goal={history} onClose={() => setHistory(undefined)}/>}
    {deleting && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!disabled) setDeleting(undefined); }}>
      <SafeAreaView style={styles.confirm}><Card><Text style={styles.section}>Delete goal?</Text>
        <Text style={styles.meta}>Delete “{deleting.title}” and its completion history and reminder? Pausing keeps your history.</Text>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={disabled ? 'Deleting…' : 'Delete goal'} tone="danger" disabled={disabled} onPress={() => {
          void run(deleting.id, () => action.mutateAsync({ path: `/goals/${deleting.id}`, method: 'DELETE' })).then(saved => { if (saved) setDeleting(undefined); });
        }}/><Button title="Keep goal" tone="plain" disabled={disabled} onPress={() => setDeleting(undefined)}/>
      </Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

function GoalCard({ goal, disabled, pending, onAction, onEdit, onReminder, onHistory, onDelete }: {
  goal: Goal; disabled: boolean; pending: boolean; onAction(request: { path: string; body: unknown }): void;
  onEdit(): void; onReminder(): void; onHistory(): void; onDelete(): void;
}) {
  const { date } = useTodayClock(goal.timeZone);
  const history = useGoalHistory(goal.id);
  const progress = history.data === undefined ? undefined : weeklyGoalProgress(goal, history.data, date);
  const completion = history.data?.find(row => row.occurrenceKey === date);
  const onDay = goal.schedule.kind === 'weeklyTarget' || goalOccursOn({ id: goal.id, title: goal.title, schedule: goal.schedule, timeZone: goal.timeZone }, date);
  const canComplete = history.data !== undefined && !goal.pausedAt && onDay && !completion;
  return <Card><Text style={styles.item}>{goal.title}</Text>
    <Text style={styles.meta}>{goal.pausedAt ? 'Paused' : goal.schedule.kind === 'weeklyTarget' ? `${goal.schedule.target} times this week` : goal.schedule.kind === 'weekly' ? 'Selected days' : 'Every day'} · {goal.timeZone}</Text>
    {goal.reminder && <Text style={styles.meta}>Reminder: {taskTimingLabel(goal.reminder, goal.timeZone)}{goal.reminder.kind === 'date' ? ' · Delivery time needed' : ''}{goal.pausedAt ? ' · Inactive while paused' : ''}</Text>}
    <State loading={history.isLoading} error={history.error}/>
    {goal.schedule.kind === 'weeklyTarget' && (progress ? <>
      <Text style={styles.meta}>This week: {progress.completed} completed · Target {progress.target}</Text>
      <Text style={styles.meta}>Week of {progress.weekStart} · Monday–Sunday</Text>
      {progress.reached && <Text style={styles.meta}>Weekly target reached</Text>}
    </> : <Text style={styles.meta}>Weekly progress unavailable until history is loaded.</Text>)}
    {completion && <Text style={styles.meta}>{completion.state === 'completed' ? 'Completed today' : 'Skipped today'}</Text>}
    {!onDay && !goal.pausedAt && <Text style={styles.meta}>Not scheduled today</Text>}
    <View style={styles.buttons}>
      {canComplete && <><Button title={pending ? 'Saving…' : 'Complete today'} disabled={disabled} onPress={() => onAction({ path: `/goals/${goal.id}/complete`, body: { occurrenceKey: date, state: 'completed' } })}/>
        <Button title="Skip today" tone="plain" disabled={disabled} onPress={() => onAction({ path: `/goals/${goal.id}/complete`, body: { occurrenceKey: date, state: 'skipped' } })}/></>}
      <Button title={goal.pausedAt ? 'Resume' : 'Pause'} tone="plain" disabled={disabled} onPress={() => onAction({ path: `/goals/${goal.id}/pause`, body: { paused: !goal.pausedAt } })}/>
      <Button title="Edit goal" tone="plain" disabled={disabled} onPress={onEdit}/><Button title="Completion history" tone="plain" disabled={disabled} onPress={onHistory}/>
      <Button title={goal.reminder ? 'Edit reminder' : 'Set reminder'} tone="plain" disabled={disabled} onPress={onReminder}/>
      <Button title="Delete" tone="danger" disabled={disabled} onPress={onDelete}/>
    </View>
  </Card>;
}
function GoalHistory({ goal, onClose }: { goal: Goal; onClose(): void }) {
  const query = useGoalHistory(goal.id);
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}><Text style={styles.section}>{goal.title} — completion history</Text>
      <Text style={styles.meta}>Occurrence dates follow {goal.timeZone}.</Text>
      <State loading={query.isLoading} error={query.error} empty={query.data?.length === 0 ? 'No completion history yet.' : undefined}/>
      {query.data?.map(row => <Card key={row.id}><Text style={styles.item}>{row.occurrenceKey}</Text><Text style={styles.meta}>{row.state}</Text></Card>)}
      <Button title="Refresh history" disabled={query.isFetching} onPress={() => { void query.refetch(); }}/><Button title="Close history" tone="plain" onPress={onClose}/>
    </ScrollView>
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 12 }, title: { fontSize: 29, fontWeight: '800', color: colors.ink }, sub: { color: colors.muted }, section: { fontSize: 18, fontWeight: '800', color: colors.ink }, item: { color: colors.ink, fontSize: 17, fontWeight: '700' }, meta: { color: colors.muted }, buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, top: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, error: { color: colors.coral }, safe: { flex: 1, backgroundColor: colors.canvas }, confirm: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' } });
