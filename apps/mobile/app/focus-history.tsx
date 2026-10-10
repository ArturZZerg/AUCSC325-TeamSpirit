import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addCalendarDays } from '@campusflow/domain';
import { Button, Card, Screen, colors } from '@/components/ui';
import { useFocusHistory } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { weekStart } from '@/features/weekly-planner';
import { useSessionStore } from '@/store/session';
import { focusOwner } from '@/store/focus';

export default function FocusHistoryScreen() {
  const session = useSessionStore(state => state.session);
  return <HistoryContent key={focusOwner(session)} timeZone={session?.user.timeZone ?? 'UTC'}/>;
}
function HistoryContent({ timeZone }: { timeZone: string }) {
  const router = useRouter(), { date: today } = useTodayClock(timeZone);
  const [offset, setOffset] = useState(0);
  const from = addCalendarDays(weekStart(today), offset * 7), through = addCalendarDays(from, 6);
  const history = useFocusHistory(from, through);
  const rows = history.data?.sessions;
  const format = (instant: string) => new Intl.DateTimeFormat(undefined, { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(instant));
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Button title="Back to focus" tone="plain" onPress={() => router.replace('/focus')}/>
    <Text style={styles.kicker}>YOUR STUDY TIME</Text><Text style={styles.title}>My focus history</Text>
    <Text style={styles.meta}>A record of the time you chose to save. Task completion stays separate.</Text>
    <Button title="Weekly study report" tone="plain" onPress={() => router.push('/study-report')}/>
    <View style={styles.navigation}><Button title="Previous week" tone="plain" onPress={() => setOffset(value => value - 1)}/>
      <Button title="Next week" tone="plain" disabled={offset >= 0} onPress={() => setOffset(value => value + 1)}/></View>
    <Text style={styles.section}>{from} – {through}</Text>
    {history.isLoading && <Text style={styles.meta}>Loading your focus history…</Text>}
    {history.error && <Text accessibilityRole="alert" style={styles.meta}>{rows ? 'Couldn’t refresh. Showing saved history.' : 'Focus history is unavailable. Connect and try again.'}</Text>}
    {history.data && <Text style={styles.meta}>{history.isCached || history.error ? 'Saved' : 'Updated'} {format(history.data.capturedAt)} · {timeZone}</Text>}
    <Button title={history.isFetching ? 'Refreshing…' : 'Refresh history'} tone="plain" disabled={history.isFetching} onPress={() => { void history.refetch(); }}/>
    {rows?.length === 0 && <Card><Text style={styles.section}>Your next block starts here.</Text><Text style={styles.meta}>Save a finished block or the time from an early finish to see it here.</Text>
      <Button title="Start a focus block" onPress={() => router.replace('/focus')}/></Card>}
    {rows?.map(row => <Card key={row.id}><View style={styles.row}><Text style={styles.recordTitle}>{row.title}</Text><Text style={styles.duration}>{Math.floor(row.focusedSeconds / 60)}m {row.focusedSeconds % 60}s</Text></View>
      <Text style={styles.meta}>{format(row.endedAt)} · {row.outcome === 'completed' ? 'Finished block' : 'Ended early'}</Text>
      <Text style={styles.meta}>{row.plannedMinutes} min planned{row.taskId ? ' · Linked task' : ' · Free study or removed task'}</Text>
    </Card>)}
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .7 }, title: { color: colors.ink, fontSize: 28, fontWeight: '800' },
  meta: { color: colors.muted, lineHeight: 21 }, section: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  recordTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', flexShrink: 1 }, duration: { color: colors.moss, fontWeight: '800' },
});
