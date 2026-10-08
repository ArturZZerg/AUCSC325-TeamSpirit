import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addCalendarDays } from '@campusflow/domain';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { usePlanningSnapshot } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { calendarLabel, weekStart } from '@/features/weekly-planner';
import { buildWeeklyReview } from '@/features/weekly-review';
import { routineScheduleLabel } from '@/features/routine-library';
import { useSessionStore } from '@/store/session';

export default function ReviewScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <ReviewContent key={JSON.stringify([session.user.id, session.accessToken])} accountId={session.user.id} timeZone={session.user.timeZone}/> : null;
}
function ReviewContent({ accountId, timeZone }: { accountId: string; timeZone: string }) {
  const router = useRouter(); const { date: today } = useTodayClock(timeZone);
  const currentWeek = weekStart(today); const [selected, setSelected] = useState<string>();
  const start = selected ?? currentWeek; const [expandedWeek, setExpandedWeek] = useState<string>();
  const query = usePlanningSnapshot(start);
  const review = buildWeeklyReview(query.data, accountId, timeZone, start, new Date().toISOString());
  const hasData = !!review?.coveredDays;
  const max = Math.max(1, ...review?.days.map(day => day.tasks + day.routines) ?? []);
  const finished = expandedWeek === start ? review?.taskCompletions : review?.taskCompletions.slice(0, 6);
  return <Screen><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}/>}>
    <View style={styles.heading}><Button title="Back to Today" tone="plain" onPress={() => router.replace('/today')}/><Text style={styles.kicker}>WEEKLY REVIEW</Text></View>
    <Text style={styles.title}>{'A little progress\nadds up.'}</Text>
    <Text style={styles.copy}>See the work you’ve recorded, then choose a small step for the week ahead.</Text>
    <View style={styles.navigation}>
      <Button title="Previous week" tone="plain" onPress={() => setSelected(addCalendarDays(start, -7))}/>
      <Button title="This week" tone="plain" onPress={() => setSelected(undefined)}/>
      <Button title="Next week" tone="plain" disabled={start >= currentWeek} onPress={() => setSelected(addCalendarDays(start, 7))}/>
    </View>
    <Text style={styles.section}>{calendarLabel(start, { month: 'short', day: 'numeric' })} – {calendarLabel(addCalendarDays(start, 6), { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
    <State loading={query.isLoading} error={query.error}/>
    {review && <Text style={styles.meta}>Saved information as of {new Date(review.capturedAt).toLocaleString(undefined, { timeZone })} · {timeZone}</Text>}
    {review && review.sourceStatus.availability !== 'available' && <Text style={styles.notice}>{review.sourceStatus.availability === 'notConnected'
      ? 'Your own coursework is included. Connect Canvas in Settings to include imported work.' : 'Imported coursework may be out of date. The review uses your saved records.'}</Text>}
    {review?.hasDemoCoursework && <Text style={styles.meta}>Demo coursework is excluded from this review.</Text>}
    {!query.isLoading && (!review || review.coveredDays < review.elapsedDays) && <Card><Text style={styles.section}>Some days haven’t loaded.</Text>
      <Text style={styles.copy}>{review ? `Information available for ${review.coveredDays} of ${review.elapsedDays} elapsed days. Totals include available days only.` : 'Connect and refresh to load saved records for this week.'}</Text>
      <Button title="Refresh this review" onPress={() => { void query.refetch(); }}/></Card>}
    {hasData && review && <>
      <View style={styles.metrics}><Metric value={review.taskCompletions.length} label="Personal tasks finished"/><Metric value={review.routineCompletions} label="Routine check-ins"/></View>
      <Text style={styles.meta}>Counted when completed, in your account timezone. Skipped routines are excluded.</Text>
      <Text style={styles.section}>Recorded progress</Text>
      <Text style={styles.copy}>Every completed task and routine check-in is one small step.</Text>
      <View style={styles.chart}>{review.days.map(day => <Pressable key={day.date} accessibilityRole="button" disabled={day.status !== 'available'}
        accessibilityLabel={`${calendarLabel(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${day.status === 'available' ? `${day.tasks} ${day.tasks === 1 ? 'task' : 'tasks'} finished, ${day.routines} routine ${day.routines === 1 ? 'check-in' : 'check-ins'}` : day.status === 'future' ? 'still ahead' : 'not available'}`}
        onPress={() => router.push({ pathname: '/today', params: { date: day.date } })} style={styles.chartRow}>
        <Text style={styles.day}>{calendarLabel(day.date, { weekday: 'short' })}</Text><View style={styles.track}>
          {day.status === 'available' && day.tasks + day.routines > 0 && <View style={[styles.bar, { width: `${100 * (day.tasks + day.routines) / max}%` }]}/>}</View>
        <Text style={styles.dayCount}>{day.status === 'available' ? day.tasks + day.routines : day.status === 'future' ? 'Ahead' : '—'}</Text>
      </Pressable>)}</View>
      <View style={styles.heading}><Text style={styles.section}>Personal tasks finished</Text><Button title="Open Tasks" tone="plain" onPress={() => router.push('/tasks')}/></View>
      {!review.taskCompletions.length && <Card><Text style={styles.copy}>No personal task completions recorded for the available days. Start with one task that matters to you.</Text></Card>}
      {finished?.map(row => <Card key={row.key}><Text style={styles.item}>{row.title}</Text><Text style={styles.meta}>Finished {calendarLabel(row.date, { weekday: 'short', month: 'short', day: 'numeric' })}{row.occurrenceKey ? ` · Repeating task for ${row.occurrenceKey}` : ''}</Text></Card>)}
      {expandedWeek !== start && review.taskCompletions.length > 6 && <Button title={`Show all ${review.taskCompletions.length} task completions`} tone="plain" onPress={() => setExpandedWeek(start)}/>}
      <View style={styles.heading}><Text style={styles.section}>Routine activity</Text><Button title="Open Wellness" tone="plain" onPress={() => router.push('/wellness')}/></View>
      {!review.routines.length && <Card><Text style={styles.copy}>No completed routine check-ins recorded for the available days. Choose a pace that works for you.</Text><Button title="Find a routine idea" tone="plain" onPress={() => router.push('/routines')}/></Card>}
      {review.routines.map(({ goal, completed }) => <Card key={goal.id}><View style={styles.heading}><Text style={styles.item}>{goal.title}</Text><Text style={styles.count}>{completed} {completed === 1 ? 'check-in' : 'check-ins'}</Text></View>
        <Text style={styles.meta}>Current schedule: {routineScheduleLabel(goal.schedule)}{goal.pausedAt ? ' · Paused' : ''}</Text></Card>)}
      <Text style={styles.meta}>This is recorded activity. Your current routine schedule is shown for reference.</Text>
      <View style={styles.heading}><Text style={styles.section}>Coursework due this week</Text><Button title="Open Coursework" tone="plain" onPress={() => router.push('/academics')}/></View>
      <Card><Text style={styles.section}>{review.settledCoursework} of {review.coursework.length} done, submitted or graded</Text><Text style={styles.copy}>Coursework is grouped by deadlines on available elapsed days. Status reflects your latest saved information.</Text></Card>
      {review.coursework.map(({ item, date, state }) => <Card key={item.id}><View style={styles.heading}><Text style={styles.item}>{item.title}</Text><Text style={styles.count}>{state}</Text></View><Text style={styles.meta}>Due {calendarLabel(date, { weekday: 'short', month: 'short', day: 'numeric' })}</Text></Card>)}
      <Card><Text style={styles.section}>What would make next week easier?</Text><Text style={styles.copy}>Make room for one important task, adjust a routine, or get a head start on coursework.</Text><Button title="Plan my week" onPress={() => router.push('/planner')}/></Card>
      <Text style={styles.meta}>Totals reflect saved records. Deleted records and undone completions are no longer included.</Text>
    </>}
  </ScrollView></Screen>;
}
function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  kicker: { color: colors.moss, fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800', lineHeight: 39, marginTop: 10 },
  section: { color: colors.ink, fontSize: 18, fontWeight: '800', lineHeight: 24 }, copy: { color: colors.muted, lineHeight: 22, fontSize: 15 },
  meta: { color: colors.muted, lineHeight: 19, fontSize: 12 }, item: { color: colors.ink, fontSize: 16, fontWeight: '700', flexShrink: 1 }, count: { color: colors.moss, fontWeight: '700' },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { backgroundColor: colors.sage, color: colors.ink, padding: 14, borderRadius: 13, lineHeight: 21 },
  metrics: { flexDirection: 'row', gap: 12 }, metric: { flex: 1, backgroundColor: colors.sage, borderRadius: 16, padding: 16, gap: 8 },
  metricValue: { color: colors.moss, fontSize: 34, fontWeight: '800' }, metricLabel: { color: colors.ink, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  chart: { backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 4 },
  chartRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 44 }, day: { width: 32, color: colors.muted, fontSize: 12 },
  track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.canvas, overflow: 'hidden' }, bar: { height: 12, backgroundColor: colors.moss, borderRadius: 6 }, dayCount: { width: 38, textAlign: 'right', fontSize: 12, color: colors.muted },
});
