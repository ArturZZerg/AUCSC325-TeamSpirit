import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { idSchema } from '@campusflow/contracts';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAction, useTasks } from '@/features/queries';
import { focusClockLabel } from '@/features/focus-timer';
import { useFocusTimer } from '@/features/use-focus-timer';
import { focusOwner } from '@/store/focus';
import { useSessionStore } from '@/store/session';
import type { PersonalTask } from '@/lib/types';

export default function FocusScreen() {
  const session = useSessionStore(state => state.session);
  return <FocusContent key={focusOwner(session)}/>;
}
function FocusContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string }>();
  const tasks = useTasks(); const action = useAction(); const focus = useFocusTimer();
  const [search, setSearch] = useState(''); const [confirmEnd, setConfirmEnd] = useState(false);
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string>();
  const savingRef = useRef(false); const applied = useRef<string | undefined>(undefined);
  const owner = focus.owner;
  const { timer, target } = focus;
  const eligible = (task: PersonalTask) => !task.completedAt && !task.recurrence;
  const targetTask = tasks.data?.find(task => task.id === target?.id);
  const available = tasks.data?.filter(eligible) ?? [];
  const visible = available.filter(task => task.title.toLowerCase().includes(search.trim().toLowerCase()));
  const active = timer.status === 'running' || timer.status === 'paused';
  const finished = timer.status === 'finished';
  const phase = timer.phase === 'focus' ? 'Focus' : 'Break';
  const progress = Math.round((1 - focus.remainingMs / timer.durationMs) * 100);
  const selectTask = (task: PersonalTask | null) => {
    if (!owner || active || saving) return;
    focus.configure(owner, task?.estimatedMinutes ? Math.min(90, task.estimatedMinutes) : 25, task ? { id: task.id, title: task.title } : null);
    setError(undefined);
  };
  useEffect(() => {
    if (owner && focus.storedOwner !== owner) focus.configure(owner, 25, null);
  }, [owner, focus.storedOwner, focus.configure]);
  useEffect(() => {
    if (!owner || !tasks.data || !params.taskId || applied.current === params.taskId) return;
    applied.current = params.taskId;
    if (active) return; // Reopening never replaces work already in progress.
    const id = idSchema.safeParse(params.taskId);
    const task = id.success ? tasks.data.find(value => value.id === id.data && eligible(value)) : undefined;
    if (task) focus.configure(owner, task.estimatedMinutes ? Math.min(90, task.estimatedMinutes) : 25, { id: task.id, title: task.title });
    else setError('That task is unavailable for a focus block. Choose another task or study freely.');
  }, [params.taskId, tasks.data, owner, active, focus.configure]);
  const complete = async () => {
    if (!owner || savingRef.current || !finished || timer.phase !== 'focus' || !targetTask || !eligible(targetTask) || focus.taskCompleted) return;
    savingRef.current = true; setSaving(true); setError(undefined);
    try {
      await action.mutateAsync({ path: `/tasks/${targetTask.id}/complete`, body: { completed: true } });
      focus.completeTarget(owner, targetTask.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not complete the task. Try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <Screen><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.heading}><Button title="Back to Today" tone="plain" disabled={saving} onPress={() => router.replace('/today')}/><Text style={styles.kicker}>FOCUS SPACE</Text></View>
    <Text style={styles.title}>One thing at a time.</Text>
    <Text style={styles.meta}>Give yourself a little space to make progress.</Text>
    <View style={styles.timerCard}>
      <Text style={styles.kicker}>{timer.phase === 'focus' ? 'YOUR FOCUS BLOCK' : 'TIME TO RECHARGE'}</Text>
      <Text style={styles.target}>{target?.title ?? 'A little uninterrupted study'}</Text>
      <Text accessibilityLabel={`${focusClockLabel(focus.remainingMs)} remaining`} style={styles.clock}>{focusClockLabel(focus.remainingMs)}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>{finished ? (timer.phase === 'focus' ? 'Block finished. Nice work.' : 'Break finished. Ready for another block?')
        : timer.status === 'paused' ? 'Paused · take your time' : timer.status === 'running' ? `${phase} in progress` : 'Ready when you are'}</Text>
      <View accessibilityRole="progressbar" accessibilityLabel="Session progress" accessibilityValue={{ min: 0, max: 100, now: progress }}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]}/></View>
      {timer.status === 'ready' && <Button title="Start focus" disabled={!owner || saving}
        onPress={() => { if (owner) focus.start(owner); }}/>}
      {timer.status === 'running' && <Button title="Pause" disabled={saving}
        onPress={() => { if (owner) focus.pause(owner); }}/>}
      {timer.status === 'paused' && <Button title="Resume" disabled={saving}
        onPress={() => { if (owner) focus.start(owner); }}/>}
      {finished && timer.phase === 'focus' && <Button title="Take a 5 min break" disabled={saving}
        onPress={() => { if (owner) focus.takeBreak(owner); }}/>}
      {finished && <Button title="Another focus block" tone="plain" disabled={saving}
        onPress={() => { if (owner) focus.reset(owner); }}/>}
      {active && <Button title="End session" tone="plain" disabled={saving} onPress={() => setConfirmEnd(true)}/>}
    </View>
    {finished && timer.phase === 'focus' && target && <Card>
      <Text style={styles.section}>{focus.taskCompleted || targetTask?.completedAt ? 'Task completed.' : 'Finished the task too?'}</Text>
      <Text style={styles.meta}>A focus block can be one step toward finishing. Check off the task only when it is done.</Text>
      {targetTask && eligible(targetTask) && !focus.taskCompleted && <Button title={saving ? 'Saving…' : 'Mark task complete'} disabled={saving}
        onPress={() => { void complete(); }}/>}
      {!targetTask && <Text style={styles.meta}>Refresh Tasks to check whether this task is still available.</Text>}
    </Card>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!active && <>
      <Text style={styles.section}>Make it manageable</Text>
      <View style={styles.choices}>{[15, 25, 50].map(minutes => <Choice key={minutes} label={`${minutes} min`} selected={timer.phase === 'focus' && timer.durationMs === minutes * 60_000} disabled={saving}
        onPress={() => { if (owner) focus.configure(owner, minutes); }}/>)}</View>
      <Text style={styles.section}>What are you working on?</Text>
      <Choice label="Study freely" selected={!target} disabled={saving} onPress={() => selectTask(null)}/>
      <Field label="Find a task" value={search} onChangeText={setSearch} placeholder="Search your open tasks" editable={!saving}/>
      <State loading={tasks.isLoading}/>
      {tasks.error && <Text style={styles.meta}>Tasks couldn’t refresh. You can focus on saved tasks or study freely.</Text>}
      {visible.slice(0, 6).map(task => <Choice key={task.id} label={task.title} selected={target?.id === task.id} disabled={saving} onPress={() => selectTask(task)}/>)}
      {visible.length > 6 && <Text style={styles.meta}>Search to find more of your {available.length} open tasks.</Text>}
      {tasks.data && !visible.length && <Text style={styles.meta}>{search.trim() ? 'No tasks match. Try another search.' : 'Add a task or plan study time from Coursework when you need a specific goal.'}</Text>}
    </>}
    <Text style={styles.meta}>The timer keeps counting when you switch screens or apps. Closing the app ends this session. Task completion needs a connection.</Text>
  </ScrollView>{confirmEnd && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!saving) setConfirmEnd(false); }}>
    <SafeAreaView style={styles.confirm}><Card><Text style={styles.section}>End this session?</Text><Text style={styles.meta}>Your timer will reset. Your task stays as it is.</Text>
      <Button title="Keep going" disabled={saving} onPress={() => setConfirmEnd(false)}/>
      <Button title="End and reset" tone="plain" disabled={saving} onPress={() => { if (owner) focus.reset(owner); setConfirmEnd(false); }}/>
    </Card></SafeAreaView>
  </Modal>}</Screen>;
}
function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} aria-checked={selected} aria-disabled={disabled} disabled={disabled} onPress={onPress}
    style={[styles.choice, selected && styles.selected, disabled && styles.disabled]}><Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, title: { color: colors.ink, fontSize: 28, fontWeight: '800', lineHeight: 34 },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .7 }, meta: { color: colors.muted, lineHeight: 21 }, section: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  timerCard: { backgroundColor: colors.sage, borderRadius: 24, padding: 24, gap: 18 }, target: { color: colors.ink, fontSize: 19, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
  clock: { color: colors.ink, fontSize: 64, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] }, status: { color: colors.moss, textAlign: 'center', fontWeight: '600' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.card, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.moss },
  choices: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, choice: { minHeight: 46, borderRadius: 12, backgroundColor: colors.card, padding: 14, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, choiceText: { color: colors.ink, fontWeight: '600' }, selectedText: { color: '#fff' }, disabled: { opacity: .5 }, error: { color: colors.coral },
  confirm: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.25)' },
});
