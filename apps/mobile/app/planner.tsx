import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addCalendarDays } from '@campusflow/domain';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { usePlanningSnapshot } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { buildPlannerWeek, calendarLabel, isFinished, weekStart } from '@/features/weekly-planner';
import { taskTimingLabel } from '@/features/task-form';
import { useSessionStore } from '@/store/session';

export default function PlannerScreen() {
  const session = useSessionStore(state => state.session);
  // Account switches also discard a private date selection outside the tab tree.
  return <PlannerContent key={JSON.stringify([session?.user.id, session?.accessToken])}/>;
}

function PlannerContent() {
  const router = useRouter();
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date: today } = useTodayClock(timeZone);
  const [selected, setSelected] = useState<string>();
  const date = selected ?? today;
  const start = weekStart(date);
  const query = usePlanningSnapshot(start);
  const week = buildPlannerWeek(query.data, query.accountId ?? '', timeZone, start, new Date().toISOString());
  const day = week.days.find(value => value.date === date)!;
  const items = day.plan?.items ?? [];
  const maxOpen = Math.max(1, ...week.days.map(value => value.open ?? 0));

  return <Screen><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}/> }>
    <View style={styles.top}><Button title="Back to Today" tone="plain" onPress={() => router.replace('/today')}/>
      <Text style={styles.kicker}>PLAN AHEAD</Text></View>
    <Text style={styles.title}>Your week, in view.</Text>
    <Text style={styles.muted}>See busy days before they sneak up.</Text>
    <Button title="Review your week" tone="plain" onPress={() => router.push('/review')}/>
    <Button title="Class timetable" tone="plain" onPress={() => router.push('/timetable')}/>
    <View style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous week" style={styles.arrow} onPress={() => setSelected(addCalendarDays(date, -7))}><Text style={styles.arrowText}>‹</Text></Pressable>
      <Button title="This week" tone="plain" onPress={() => setSelected(undefined)}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Next week" style={styles.arrow} onPress={() => setSelected(addCalendarDays(date, 7))}><Text style={styles.arrowText}>›</Text></Pressable>
    </View>
    <Text style={styles.section}>{calendarLabel(start, { month: 'short', day: 'numeric' })} – {calendarLabel(addCalendarDays(start, 6), { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
    <State loading={query.isLoading} error={query.error}/>
    {query.data && <Text style={styles.muted}>Updated {new Date(query.data.capturedAt).toLocaleString(undefined, { timeZone })}</Text>}
    {query.data?.sourceStatus.availability !== 'available' && query.data && <Text style={styles.notice}>
      {query.data.sourceStatus.availability === 'notConnected' ? 'Connect Canvas in Settings to include your coursework.' : 'Canvas information may be out of date. Your saved plans are still available.'}
    </Text>}
    {week.coveredDays > 0 && <View style={styles.summary}>
      <Metric value={week.planned} label="planned items"/>
      <Metric value={week.deadlines} label="open deadlines"/>
      <Metric value={week.finished} label="done / skipped"/>
    </View>}
    {week.coveredDays < 7 && !query.isLoading && <Text style={styles.notice}>Information available for {week.coveredDays} of 7 days. Refresh to load the rest; counts include available days.</Text>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekScroll}><View style={styles.week}>
      {week.days.map(value => <Pressable key={value.date} accessibilityRole="button"
        accessibilityLabel={`${calendarLabel(value.date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${value.open === undefined ? 'not available' : `${value.open} open items`}`}
        accessibilityState={{ selected: date === value.date }} onPress={() => setSelected(value.date)}
        style={[styles.day, date === value.date && styles.selected]}>
        <Text style={[styles.weekday, date === value.date && styles.selectedText]}>{calendarLabel(value.date, { weekday: 'short' })}</Text>
        <Text style={[styles.number, date === value.date && styles.selectedText]}>{calendarLabel(value.date, { day: 'numeric' })}</Text>
        <View style={styles.barTrack}><View style={[styles.bar, { height: value.open === undefined ? 0 : Math.max(3, 28 * value.open / maxOpen) }, date === value.date && styles.selectedBar]}/></View>
        <Text style={[styles.weekday, date === value.date && styles.selectedText]}>{value.open ?? '—'}</Text>
        {value.date === today && <View style={[styles.dot, date === value.date && styles.selectedBar]}/>}
      </Pressable>)}
    </View></ScrollView>
    <View style={styles.heading}><Text style={styles.section}>{calendarLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
      <Text style={styles.muted}>{day.open === undefined ? 'Unavailable' : `${day.open} open`}</Text></View>
    {day.plan ? <>
      <Button title="Open this day’s plan" onPress={() => router.push({ pathname: '/today', params: { date } })}/>
      {!items.length && <Card><Text style={styles.item}>A little breathing room.</Text><Text style={styles.muted}>No saved commitments for this day. Add a personal task to plan something.</Text><Button title="Go to Tasks" tone="plain" onPress={() => router.push('/tasks')}/></Card>}
      {items.map(item => <Card key={item.key}>
        <View style={styles.heading}><Text style={styles.kind}>{item.isMainGoal ? '★ MAIN GOAL' : { academic: 'COURSEWORK', personalTask: 'PERSONAL', goal: 'ROUTINE', event: 'EVENT' }[item.kind]}</Text>
          <Text style={[styles.badge, item.state === 'overdue' && styles.overdue]}>{item.state}</Text></View>
        <Text style={[styles.item, isFinished(item) && styles.finished]}>{item.title}</Text>
        {item.due && <Text style={styles.muted}>Due: {taskTimingLabel(item.due, timeZone)}</Text>}
        {item.schedule && <Text style={styles.muted}>{item.kind === 'event' ? 'Starts' : 'Scheduled'}: {taskTimingLabel(item.schedule, timeZone)}</Text>}
      </Card>)}
    </> : !query.isLoading && <Card><Text style={styles.item}>This day hasn’t been loaded.</Text><Text style={styles.muted}>Connect and refresh to see your plan for this date.</Text><Button title="Retry" onPress={() => { void query.refetch(); }}/></Card>}
  </ScrollView></Screen>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '800', lineHeight: 36 },
  muted: { color: colors.muted, lineHeight: 21 }, navigation: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  arrow: { minWidth: 46, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sage, borderRadius: 13 }, arrowText: { color: colors.ink, fontSize: 28 },
  section: { color: colors.ink, fontWeight: '800', fontSize: 19 },
  notice: { color: colors.ink, backgroundColor: colors.sage, padding: 12, borderRadius: 12, lineHeight: 20 },
  summary: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, backgroundColor: colors.sage, borderRadius: 16, padding: 12, gap: 6 },
  metricValue: { fontSize: 28, color: colors.ink, fontWeight: '800' }, metricLabel: { color: colors.muted, fontSize: 12 },
  weekScroll: { flexGrow: 1 }, week: { flexDirection: 'row', gap: 4, flex: 1, minWidth: 332 }, day: { flex: 1, minWidth: 44, minHeight: 116, alignItems: 'center', paddingVertical: 10, gap: 7, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, selectedText: { color: '#fff' },
  weekday: { color: colors.muted, fontSize: 11, fontWeight: '600' }, number: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  barTrack: { height: 28, width: 16, justifyContent: 'flex-end' }, bar: { backgroundColor: colors.sage, borderRadius: 4 }, selectedBar: { backgroundColor: '#fff' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.moss },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  kind: { color: colors.moss, fontSize: 11, letterSpacing: .5, fontWeight: '800' },
  badge: { color: colors.muted, fontSize: 12 }, overdue: { color: colors.coral },
  item: { color: colors.ink, fontWeight: '700', fontSize: 17 }, finished: { color: colors.muted, textDecorationLine: 'line-through' },
});
