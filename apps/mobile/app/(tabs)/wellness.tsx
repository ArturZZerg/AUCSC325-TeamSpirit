import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAction, useGoals, useWellness } from '@/features/queries';

const localToday = (): string => new Date().toLocaleDateString('en-CA');

export default function WellnessScreen() {
  const goals = useGoals();
  const entries = useWellness();
  const action = useAction();
  const [note, setNote] = useState('');
  const [mood, setMood] = useState('3');
  const [seconds, setSeconds] = useState(0);
  const today = localToday();

  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Wellness</Text><Text style={styles.sub}>Small routines that support your week.</Text>
    <Text style={styles.section}>Your goals</Text>
    <State loading={goals.isLoading} error={goals.error} empty={!goals.data?.length ? 'Create a daily or weekly goal to begin a gentle routine.' : undefined} />
    {goals.data?.map(goal => <Card key={goal.id}><Text style={styles.item}>{goal.title}</Text>
      <Text style={styles.meta}>{goal.pausedAt ? 'Paused' : goal.schedule.kind === 'weeklyTarget' ? `${goal.schedule.target} times this week` : goal.schedule.kind}</Text>
      <View style={styles.buttons}><Button title="Complete today" onPress={() => action.mutate({ path: `/goals/${goal.id}/complete`, body: { occurrenceKey: today, state: 'completed' } })} />
        <Button title={goal.pausedAt ? 'Resume' : 'Pause'} tone="plain" onPress={() => action.mutate({ path: `/goals/${goal.id}/pause`, body: { paused: Boolean(goal.pausedAt) } })} />
        <Button title="Skip" tone="plain" onPress={() => action.mutate({ path: `/goals/${goal.id}/complete`, body: { occurrenceKey: today, state: 'skipped' } })} /></View>
    </Card>)}
    <Card><Text style={styles.section}>Today’s check-in</Text><Field label="Mood (1–5)" value={mood} onChangeText={setMood} /><Field label="A short note" value={note} onChangeText={setNote} multiline placeholder="What would help today?" />
      <Button title="Save check-in" onPress={async () => { await action.mutateAsync({ path: '/wellness', body: { date: today, mood: Number(mood), note: note || null } }); setNote(''); }} /></Card>
    <Card><Text style={styles.section}>One minute to breathe</Text><Text style={styles.meta}>{seconds ? `${seconds}s of calm focus` : 'Start a simple, optional breathing pause.'}</Text>
      <Button title={seconds ? 'Reset' : 'Start 60 seconds'} tone="plain" onPress={() => setSeconds(seconds ? 0 : 60)} /></Card>
    <Text style={styles.section}>Check-in history</Text>{entries.data?.map(entry => <Card key={entry.id}><Text style={styles.item}>{entry.date}</Text><Text style={styles.meta}>Mood {entry.mood ?? '—'} · Energy {entry.energy ?? '—'} · Stress {entry.stress ?? '—'}</Text>{entry.note && <Text>{entry.note}</Text>}</Card>)}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: 16, gap: 12 }, title: { fontSize: 29, fontWeight: '800', color: colors.ink }, sub: { color: colors.muted }, section: { fontSize: 18, fontWeight: '800', color: colors.ink }, item: { color: colors.ink, fontSize: 17, fontWeight: '700' }, meta: { color: colors.muted }, buttons: { gap: 8 } });
