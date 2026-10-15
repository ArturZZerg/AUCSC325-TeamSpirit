import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ZodError } from 'zod';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAction, useGoals, useGoalHistory, useWellnessJournal } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { GoalEditor } from '@/features/goal-editor';
import { GoalReminderEditor } from '@/features/goal-reminder-editor';
import { BreathingPause } from '@/features/breathing-pause';
import { HabitCard } from '@/features/habit-card';
import { Chip } from '@/features/task-row';
import { ratingLabel } from '@/features/wellness-journal';
import { useSessionStore } from '@/store/session';
import type { Goal } from '@/lib/types';

const moodIcons = ['sad-outline', 'cloudy-outline', 'partly-sunny-outline', 'sunny-outline', 'happy-outline'] as const;

export default function WellnessScreen() {
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date: today } = useTodayClock(timeZone);
  const goals = useGoals(); const entries = useWellnessJournal(today, today); const action = useAction();
  const guard = useRef(false); const [pending, setPending] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [editing, setEditing] = useState<Goal | null>(); const [deleting, setDeleting] = useState<Goal>();
  const [history, setHistory] = useState<Goal>();
  const [reminding, setReminding] = useState<Goal>();
  const [expanded, setExpanded] = useState<string>();
  const checkIn = entries.data?.entries.find(entry => entry.date === today);
  const disabled = !!pending || action.isPending;
  const run = async (key: string, operation: () => Promise<unknown>) => {
    if (guard.current || action.isPending) return false;
    guard.current = true; setPending(key); setMessage(undefined);
    try { await operation(); return true; }
    catch (error) { setMessage(error instanceof ZodError ? error.issues[0].message : error instanceof Error ? error.message : 'Could not save the change. Please try again.'); return false; }
    finally { guard.current = false; setPending(undefined); }
  };
  const active = goals.data?.filter(goal => !goal.pausedAt) ?? [], paused = goals.data?.filter(goal => goal.pausedAt) ?? [];
  const card = (goal: Goal) => <HabitCard key={goal.id} goal={goal} disabled={disabled} pending={pending === goal.id} expanded={expanded === goal.id}
    onToggleExpanded={() => setExpanded(current => current === goal.id ? undefined : goal.id)}
    onAction={request => { void run(goal.id, () => action.mutateAsync(request)); }}
    onEdit={() => setEditing(goal)} onReminder={() => setReminding(goal)} onHistory={() => setHistory(goal)} onDelete={() => { setMessage(undefined); setDeleting(goal); }}/>;

  return <Screen safeArea edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Wellness</Text><Text style={styles.sub}>Small routines that support your week.</Text>
    {message && !deleting && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <View style={styles.checkIn}>
      <View style={styles.checkInIcon}><Ionicons name={checkIn?.mood ? moodIcons[checkIn.mood - 1] : 'leaf-outline'} size={28} color={colors.moss}/></View>
      <View style={styles.checkInBody}>
        <Text style={styles.section}>Today’s check-in</Text>
        <State loading={entries.isLoading} error={entries.error}/>
        <Text style={styles.meta}>{checkIn ? `Mood: ${ratingLabel('mood', checkIn.mood)} · Energy: ${ratingLabel('energy', checkIn.energy)} · Stress: ${ratingLabel('stress', checkIn.stress)}` : entries.data ? 'A small moment to record how your day feels.' : 'Connect to review saved check-ins.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Open check-in journal" disabled={disabled} onPress={() => router.push('/journal')}
          style={({ pressed }) => [styles.journal, pressed && styles.pressed, disabled && styles.dim]}>
          <Text style={styles.journalText}>{checkIn ? 'Update check-in' : 'Check in now'}</Text><Ionicons name="arrow-forward" size={16} color="#fff"/>
        </Pressable>
      </View>
    </View>
    <View style={styles.top}><Text accessibilityRole="header" style={styles.section}>Your routines</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add goal" accessibilityState={{ disabled }} disabled={disabled} onPress={() => setEditing(null)}
        style={({ pressed }) => [styles.add, pressed && styles.pressed, disabled && styles.dim]}><Ionicons name="add" size={22} color="#fff"/></Pressable></View>
    <View style={styles.links}><Chip icon="bulb-outline" label="Browse routine ideas" disabled={disabled} onPress={() => router.push('/routines')}/></View>
    <State loading={goals.isLoading} error={goals.error}/>
    {goals.data?.length === 0 && <View style={styles.empty}><Ionicons name="flame-outline" size={30} color={colors.plum}/>
      <Text style={styles.item}>Start a gentle routine.</Text><Text style={styles.meta}>Create a daily or weekly goal to begin a gentle routine.</Text></View>}
    {active.map(card)}
    {paused.length > 0 && <Text style={styles.subsection}>Paused</Text>}
    {paused.map(card)}
    <BreathingPause/>
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

function GoalHistory({ goal, onClose }: { goal: Goal; onClose(): void }) {
  const query = useGoalHistory(goal.id);
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}><Text style={styles.section}>{goal.title} — completion history</Text>
      <Text style={styles.meta}>Occurrence dates follow {goal.timeZone}.</Text>
      <State loading={query.isLoading} error={query.error} empty={query.data?.length === 0 ? 'No completion history yet.' : undefined}/>
      {query.data?.map(row => <View key={row.id} style={styles.historyRow}>
        <Ionicons name={row.state === 'completed' ? 'checkmark-circle' : 'play-skip-forward-circle-outline'} size={22} color={row.state === 'completed' ? colors.plum : colors.muted}/>
        <Text style={styles.item}>{new Date(`${row.occurrenceKey}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
        <Text style={styles.meta}>{row.state}</Text>
      </View>)}
      <Button title="Refresh history" disabled={query.isFetching} onPress={() => { void query.refetch(); }}/><Button title="Close history" tone="plain" onPress={onClose}/>
    </ScrollView>
  </SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink }, sub: { color: colors.muted, fontSize: 15, marginTop: -8 },
  section: { fontSize: 18, fontWeight: '800', color: colors.ink }, subsection: { fontSize: 15, fontWeight: '800', color: colors.muted, marginTop: 6 },
  item: { color: colors.ink, fontSize: 16, fontWeight: '700' }, meta: { color: colors.muted },
  checkIn: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 20, backgroundColor: colors.sage },
  checkInIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }, checkInBody: { flex: 1, gap: 6 },
  journal: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.moss, borderRadius: 18, paddingHorizontal: 14, minHeight: 38, marginTop: 2 },
  journalText: { color: '#fff', fontWeight: '700' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 6 },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { alignItems: 'center', gap: 6, padding: 24, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  error: { color: colors.coral }, pressed: { opacity: 0.75 }, dim: { opacity: 0.5 },
  safe: { flex: 1, backgroundColor: colors.canvas }, confirm: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
});
