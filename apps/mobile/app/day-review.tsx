import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { dateSchema } from '@campusflow/contracts';
import { addCalendarDays } from '@campusflow/domain';
import { Button, Card, Screen, colors, BackLink } from '@/components/ui';
import { useFocusHistory, usePlanningSnapshot } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { useAgendaClock } from '@/features/use-agenda-clock';
import { buildDayReview, buildDayStudy } from '@/features/day-review';
import { calendarLabel, weekStart } from '@/features/weekly-planner';
import { studyTimeLabel } from '@/features/study-report';
import { taskTimingLabel } from '@/features/task-form';
import { TaskEditor } from '@/features/task-editor';
import { useSessionStore } from '@/store/session';
import type { PersonalTask } from '@/lib/types';

export default function DayReviewScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <DayReviewContent key={JSON.stringify([session.user.id, session.accessToken, session.user.timeZone])} accountId={session.user.id} timeZone={session.user.timeZone}/> : null;
}
function DayReviewContent({ accountId, timeZone }: { accountId: string; timeZone: string }) {
  const router = useRouter(), params = useLocalSearchParams<{ date?: string | string[] }>();
  const { date: today, resumeCount } = useTodayClock(timeZone);
  const requested = typeof params.date === 'string' && dateSchema.safeParse(params.date).success && params.date <= today ? params.date : undefined;
  const [selected, setSelected] = useState(requested);
  useEffect(() => { setSelected(requested); }, [requested]);
  const date = selected && selected <= today ? selected : today, start = weekStart(date);
  const now = useAgendaClock(date, timeZone), snapshot = usePlanningSnapshot(date);
  // Share the study-report query/cache window; no second persistence model.
  const history = useFocusHistory(addCalendarDays(start, -7), addCalendarDays(start, 6));
  const review = buildDayReview(snapshot.data, accountId, timeZone, date, now), study = buildDayStudy(history.data, accountId, timeZone, date, now);
  const [editing, setEditing] = useState<{ task: PersonalTask; scheduledDate: string }>(), [expandedDate, setExpandedDate] = useState<string>();
  const [message, setMessage] = useState<string>();
  useEffect(() => { setMessage(undefined); }, [date]);
  const lastResume = useRef(resumeCount);
  useEffect(() => { if (lastResume.current !== resumeCount) { lastResume.current = resumeCount; void history.refetch({ cancelRefetch: false }); } }, [resumeCount, history.refetch]);
  const refresh = () => { void snapshot.refetch(); void history.refetch(); }, tomorrow = addCalendarDays(today, 1);
  const tasks = expandedDate === date ? review?.carryover : review?.carryover.slice(0, 3);
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} aria-hidden={!!editing} accessibilityElementsHidden={!!editing} importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={snapshot.isRefetching || history.isRefetching} onRefresh={refresh}/>}>
    <View style={styles.heading}><BackLink to="Today" onPress={() => router.replace('/today')}/><Text style={styles.kicker}>DAY-END REVIEW</Text></View>
    <Text style={styles.title}>Leave the day a little lighter.</Text><Text style={styles.copy}>Notice the work you recorded, then make room for one small next step.</Text>
    <View style={styles.actions}><Button title="Previous day" tone="plain" onPress={() => setSelected(addCalendarDays(date, -1))}/><Button title="Today" tone="plain" onPress={() => setSelected(undefined)}/>
      <Button title="Next day" tone="plain" disabled={date >= today} onPress={() => setSelected(addCalendarDays(date, 1))}/></View>
    <Text accessibilityRole="header" style={styles.section}>{calendarLabel(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
    <Button title={snapshot.isFetching || history.isFetching ? 'Refreshing…' : 'Refresh day'} tone="plain" disabled={snapshot.isFetching || history.isFetching} onPress={refresh}/>
    <Step number="1" title="Notice your progress"/>
    {snapshot.isLoading && <Text style={styles.copy}>Loading recorded progress…</Text>}
    {!review && <Card><Text style={styles.section}>This day hasn’t loaded.</Text><Text style={styles.copy}>Unavailable records don’t mean you completed nothing. Refresh to load your saved progress.</Text></Card>}
    {review && <>
      {(snapshot.isCached || snapshot.error) && <Text accessibilityRole="alert" style={styles.notice}>Showing saved progress. Refresh when you’re connected.</Text>}
      <View style={styles.hero}><Metric value={review.tasks} label="tasks finished"/><Metric value={review.routines} label="routine check-ins"/></View>
      <Text style={styles.meta}>Counted by recorded completion time in {timeZone}. Skipped routines are excluded.</Text>
      {review.completed.slice(0, 3).map(row => <Card key={row.key}><Text style={styles.item}>{row.title}</Text><Text style={styles.meta}>Recorded complete{row.occurrenceKey ? ` · Repeating task for ${row.occurrenceKey}` : ''}</Text></Card>)}
      <Text style={styles.meta}>Progress updated {new Date(review.capturedAt).toLocaleString(undefined, { timeZone })}. Deleted records and undone completions are excluded.</Text>
    </>}
    <Step number="2" title="See your study time"/>
    <Card>{study ? <><Text style={styles.study}>{studyTimeLabel(study.seconds)}</Text><Text style={styles.copy}>{study.blocks} saved {study.blocks === 1 ? 'block' : 'blocks'} · {study.completedBlocks} finished · {study.interruptedBlocks} ended early</Text>
      <Text style={styles.meta}>Pauses and breaks excluded. Overnight blocks belong to the local day they ended.</Text>
      {(history.isCached || history.error) && <Text style={styles.notice}>Showing saved study time.</Text>}
      <Text style={styles.meta}>Study time updated {new Date(study.capturedAt).toLocaleString(undefined, { timeZone })}.</Text></>
      : <><Text style={styles.section}>Study time hasn’t loaded.</Text><Text style={styles.copy}>Study time that hasn’t loaded is different from zero minutes. Refresh to load this day’s saved blocks.</Text></>}
      <Button title="View study history" tone="plain" onPress={() => router.push('/focus-history')}/></Card>
    <Step number="3" title="Choose a next step"/>
    {message && <Text accessibilityRole="alert" style={styles.notice}>{message}</Text>}
    {review && <>
      <Text style={styles.copy}>Still open in this day’s latest saved plan. Connect to review and edit a task before scheduling it for tomorrow. Scheduling does not move its deadline.</Text>
      {!review.carryover.length && <Card><Text style={styles.section}>Room for a fresh start.</Text><Text style={styles.copy}>No unfinished one-off personal tasks in the saved plan. Recurring work stays in Today.</Text></Card>}
      {tasks?.map(task => <Card key={task.id}><Text style={styles.item}>{task.title}</Text>{task.due && <Text style={styles.meta}>Deadline: {taskTimingLabel(task.due, timeZone)}</Text>}
        <Button title="Plan for tomorrow" accessibilityLabel={`Plan ${task.title} for tomorrow`} onPress={() => { setMessage(undefined); setEditing({ task, scheduledDate: tomorrow }); }}/></Card>)}
      {expandedDate !== date && review.carryover.length > 3 && <Button title={`Show all ${review.carryover.length} open tasks`} tone="plain" onPress={() => setExpandedDate(date)}/>}
    </>}
    <Card><Text style={styles.section}>How did the day feel?</Text><Text style={styles.copy}>Your check-in journal is a separate space for a note, energy or mood. Record only what you want.</Text>
      <Button title="Open my check-in journal" tone="plain" onPress={() => router.push('/journal')}/></Card>
    <Button title="Open tomorrow’s plan" onPress={() => router.push({ pathname: '/today', params: { date: tomorrow } })}/>
    <Text style={styles.meta}>Progress and study time can update at different moments. Nothing moves until you review and save.</Text>
  </ScrollView>{editing && <TaskEditor task={editing.task} initialScheduledDate={editing.scheduledDate} timeZone={timeZone}
    onSaved={() => setMessage('Task saved. Its deadline can still keep it in this day’s plan.')} onClose={() => setEditing(undefined)}/>}</Screen>;
}
function Step({ number, title }: { number: string; title: string }) { return <View style={styles.step}><Text style={styles.number}>{number}</Text><Text accessibilityRole="header" style={styles.section}>{title}</Text></View>; }
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.copy}>{label}</Text></View>; }
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }, heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 1 }, title: { color: colors.ink, fontSize: 30, lineHeight: 37, fontWeight: '800' }, section: { color: colors.ink, fontSize: 18, lineHeight: 25, fontWeight: '700', flexShrink: 1 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 19 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, step: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }, number: { color: colors.moss, fontSize: 18, fontWeight: '800' },
  hero: { backgroundColor: colors.sage, borderRadius: 20, padding: 20, gap: 16, flexDirection: 'row', flexWrap: 'wrap' }, metric: { flexGrow: 1, flexBasis: 120, gap: 4 }, metricValue: { color: colors.ink, fontSize: 34, fontWeight: '800' },
  study: { color: colors.ink, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] }, item: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: '700' }, notice: { color: colors.moss, fontSize: 14, lineHeight: 21 },
});
