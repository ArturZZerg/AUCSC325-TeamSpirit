import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addCalendarDays } from '@campusflow/domain';
import { Button, Card, Screen, colors } from '@/components/ui';
import { useFocusHistory, useTasks } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { calendarLabel, weekStart } from '@/features/weekly-planner';
import { buildStudyReport, studyTimeLabel } from '@/features/study-report';
import { useSessionStore } from '@/store/session';

export default function StudyReportScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <ReportContent key={JSON.stringify([session.user.id, session.accessToken])} accountId={session.user.id} timeZone={session.user.timeZone}/> : null;
}
function ReportContent({ accountId, timeZone }: { accountId: string; timeZone: string }) {
  const router = useRouter(), { date: today } = useTodayClock(timeZone), currentWeek = weekStart(today);
  const [selected, setSelected] = useState<string>();
  const from = selected ?? currentWeek, through = addCalendarDays(from, 6);
  const history = useFocusHistory(addCalendarDays(from, -7), through), tasks = useTasks();
  const report = buildStudyReport(history.data, accountId, timeZone, from, new Date().toISOString());
  const max = Math.max(1, ...(report?.days.map(day => day.seconds) ?? []));
  const refresh = () => { void history.refetch(); void tasks.refetch(); };
  return <Screen><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={history.isRefetching || tasks.isRefetching} onRefresh={refresh}/>}>
    <View style={styles.heading}><Button title="Back to Today" tone="plain" onPress={() => router.replace('/today')}/><Text style={styles.kicker}>STUDY REPORT</Text></View>
    <Text style={styles.title}>See where your time goes.</Text>
    <Text style={styles.meta}>Your saved focus blocks, with a clear next step.</Text>
    <View style={styles.navigation}><Button title="Previous week" tone="plain" onPress={() => setSelected(addCalendarDays(from, -7))}/>
      <Button title="This week" tone="plain" onPress={() => setSelected(undefined)}/>
      <Button title="Next week" tone="plain" disabled={from >= currentWeek} onPress={() => setSelected(addCalendarDays(from, 7))}/></View>
    <Text style={styles.section}>{calendarLabel(from, { month: 'short', day: 'numeric' })} – {calendarLabel(through, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
    {history.isLoading && <Text style={styles.meta}>Loading your study time…</Text>}
    {history.error && <Text accessibilityRole="alert" style={styles.notice}>{report ? 'Couldn’t refresh. Showing saved study time.' : 'Study time is unavailable. Connect and refresh.'}</Text>}
    <Button title={history.isFetching ? 'Refreshing…' : 'Refresh report'} tone="plain" disabled={history.isFetching} onPress={refresh}/>
    {!history.isLoading && !report && <Card><Text style={styles.section}>This week hasn’t loaded.</Text><Text style={styles.meta}>A missing read doesn’t mean you studied for zero minutes. Refresh to load this week’s history.</Text></Card>}
    {report && <>
      <View style={styles.hero}><Text style={styles.kicker}>{from === currentWeek ? 'RECORDED THIS WEEK SO FAR' : 'RECORDED THIS WEEK'}</Text>
        <Text style={styles.total}>{studyTimeLabel(report.seconds)}</Text><Text style={styles.meta}>Focus time · pauses and breaks excluded</Text>
        <View style={styles.metrics}><Metric value={report.blocks} label="saved blocks"/><Metric value={report.studyDays} label="study days"/></View>
      </View>
      <Text style={styles.meta}>{report.completedBlocks} finished blocks · {report.blocks - report.completedBlocks} ended early. Both count the time you recorded.</Text>
      {report.previous && <Text style={styles.meta}>Previous full week: {studyTimeLabel(report.previous.seconds)} in {report.previous.blocks} blocks.
        {from === currentWeek ? ' This week is still in progress.' : ''}</Text>}
      <Text style={styles.meta}>{history.isCached || history.error ? 'Saved' : 'Updated'} {new Date(report.capturedAt).toLocaleString(undefined, { timeZone })} · {timeZone}</Text>
      <Text style={styles.section}>Your week at a glance</Text>
      <Card>{report.days.map(day => <View key={day.date} accessible accessibilityLabel={`${calendarLabel(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${day.status === 'future' ? 'still ahead' : `${studyTimeLabel(day.seconds)} recorded, ${day.blocks} ${day.blocks === 1 ? 'block' : 'blocks'}`}`} style={styles.dayRow}>
        <Text style={styles.day}>{calendarLabel(day.date, { weekday: 'short' })}</Text><View style={styles.track}>
          {day.seconds > 0 && <View style={[styles.fill, { width: `${100 * day.seconds / max}%` }]}/>}</View>
        <Text style={styles.dayTime}>{day.status === 'future' ? 'Ahead' : studyTimeLabel(day.seconds)}</Text>
      </View>)}</Card>
      {!report.blocks && <Card><Text style={styles.section}>Start with one manageable block.</Text><Text style={styles.meta}>This week has no saved blocks yet. Choose one thing, focus for a little while, and save your time.</Text>
        <Button title="Start a focus block" onPress={() => router.push('/focus')}/></Card>}
      {!!report.tasks.length && <><Text style={styles.section}>What you worked on</Text>
        <Text style={styles.meta}>Compare this week’s recorded time with a task’s total estimate. Time spent doesn’t tell us whether the task is done.</Text>
        {(tasks.isCached || tasks.error) && tasks.data && <Text style={styles.notice}>Task details are saved information. Refresh to check changes made elsewhere.</Text>}
        {!tasks.data && <Text style={styles.meta}>Task details haven’t loaded. Recorded titles and time remain available.</Text>}
        {report.tasks.map(row => {
          const task = tasks.data?.find(value => value.id === row.taskId), estimate = task?.estimatedMinutes;
          const percent = estimate ? Math.min(100, Math.round(row.seconds / (estimate * 60) * 100)) : 0;
          return <Card key={row.key}><Text style={styles.item}>{task?.title ?? row.title}</Text>
            <Text style={styles.time}>{studyTimeLabel(row.seconds)} · {row.blocks} {row.blocks === 1 ? 'block' : 'blocks'}</Text>
            {!row.taskId && <Text style={styles.meta}>Free study and blocks whose linked task was removed.</Text>}
            {estimate && <><Text style={styles.meta}>Current task estimate: {estimate} min · {studyTimeLabel(row.seconds)} recorded this week</Text>
              <View accessible accessibilityRole="progressbar" accessibilityLabel={`${task.title}: recorded time versus task estimate`} accessibilityValue={{ min: 0, max: 100, now: percent }}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} style={styles.estimateTrack}><View style={[styles.estimateFill, { width: `${percent}%` }]}/></View>
              {!task.completedAt && row.seconds > estimate * 60 && <Text style={styles.meta}>You’ve recorded more time than estimated. Consider reviewing the task size.</Text>}</>}
            {task?.completedAt && <Text style={styles.meta}>Task marked complete. Recorded time is kept.</Text>}
            {task && !task.completedAt && !task.recurrence && <Button title="Focus on this task" tone="plain" onPress={() => router.push({ pathname: '/focus', params: { taskId: task.id } })}/>}
            {task?.recurrence && !task.completedAt && <Text style={styles.meta}>This task now repeats. Manage its occurrences in Today.</Text>}
          </Card>;
        })}</>}
      <View style={styles.navigation}><Button title="My study plans" tone="plain" onPress={() => router.push('/study-plans')}/><Button title="View focus history" tone="plain" onPress={() => router.push('/focus-history')}/></View>
      <Text style={styles.meta}>Only saved blocks count. Overnight blocks belong to the local day they ended. A timer records elapsed time, not attention or academic results.</Text>
    </>}
  </ScrollView></Screen>;
}
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.meta}>{label}</Text></View>; }
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', lineHeight: 35 }, kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .7 },
  meta: { color: colors.muted, lineHeight: 21 }, section: { color: colors.ink, fontSize: 18, fontWeight: '700' }, notice: { color: colors.moss, lineHeight: 21 },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, hero: { backgroundColor: colors.sage, borderRadius: 22, padding: 20, gap: 12 },
  total: { color: colors.ink, fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] }, metrics: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  metric: { gap: 3 }, metricValue: { color: colors.ink, fontSize: 25, fontWeight: '800' },
  dayRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10 }, day: { width: 32, color: colors.muted, fontWeight: '600' },
  dayTime: { width: 82, color: colors.ink, textAlign: 'right', fontSize: 12, fontWeight: '700' }, track: { height: 8, flex: 1, backgroundColor: colors.canvas, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.moss }, item: { color: colors.ink, fontSize: 18, lineHeight: 25, fontWeight: '700' }, time: { color: colors.moss, fontWeight: '700' },
  estimateTrack: { height: 6, backgroundColor: colors.canvas, borderRadius: 3, overflow: 'hidden' }, estimateFill: { height: '100%', backgroundColor: colors.blue },
});
