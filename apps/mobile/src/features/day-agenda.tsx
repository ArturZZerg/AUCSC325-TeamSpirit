import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { classConflicts, localDateAt } from '@campusflow/domain';
import { Button, Card, colors } from '@/components/ui';
import { useClasses, usePlanningSnapshot } from '@/features/queries';
import { useSessionStore } from '@/store/session';
import { buildDayCapacity, studyTaskDefaults } from './day-capacity';
import { useAgendaClock } from './use-agenda-clock';
import type { TaskFormValues } from './task-form';

export function DayAgenda({ date, timeZone, onPlan, compact = false }: {
  date: string; timeZone: string; onPlan(values: Partial<TaskFormValues>): void; compact?: boolean;
}) {
  const accountId = useSessionStore(state => state.session?.user.id ?? '');
  const schedules = useClasses(); const snapshot = usePlanningSnapshot(date);
  const now = useAgendaClock(date, timeZone); const [minutes, setMinutes] = useState(30);
  const [showWindows, setShowWindows] = useState(!compact);
  const day = buildDayCapacity(snapshot.data, schedules.data, accountId, timeZone, date, now, minutes);
  const currentDay = localDateAt(now, timeZone) === date;
  const next = currentDay ? day.classes.find(item => Date.parse(item.endsAt) > Date.parse(now)) : undefined;
  const visibleClasses = compact ? (currentDay ? (next ? [next] : []) : day.classes.slice(0, 1)) : day.classes;
  const conflicts = classConflicts(day.classes);
  const loading = schedules.isLoading || snapshot.isLoading;
  const refreshing = schedules.isRefetching || snapshot.isRefetching;
  const stale = schedules.isCached || schedules.isError || snapshot.isCached || snapshot.isError;
  const clock = (at: string) => new Date(at).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' });
  const refresh = () => { void Promise.all([schedules.refetch(), snapshot.refetch()]); };
  return <View style={styles.content}>
    <Card><View style={styles.heading}><Text style={styles.section}>Your classes</Text><Button title="Timetable" tone="plain" onPress={() => router.push('/timetable')}/></View>
      {day.classesLoaded && (schedules.isCached || schedules.isError) && <Text style={styles.meta}>Saved timetable · may be out of date.</Text>}
      {!day.classesLoaded ? <Text style={styles.copy}>{schedules.isLoading ? 'Loading your classes…' : 'Your class schedule hasn’t been loaded. Connect and refresh.'}</Text>
        : !day.classes.length && !day.classIssues.length ? <Text style={styles.copy}>No classes scheduled for this date.</Text> : null}
      {day.classIssues.map((title, index) => <Text key={`${title}:${index}`} accessibilityRole="alert" style={styles.warning}>{title}: check its time around the clock change.</Text>)}
      {compact && day.classes.length > 0 && <Text style={styles.meta}>{day.classes.length} {day.classes.length === 1 ? 'class' : 'classes'} scheduled{currentDay && !next ? ' · All finished for today' : ''}</Text>}
      {visibleClasses.map(item => <View key={item.key} style={[styles.meeting, next?.key === item.key && styles.next]}>
        {next?.key === item.key && <Text style={styles.kicker}>{Date.parse(item.startsAt) <= Date.parse(now) ? 'IN CLASS NOW' : 'NEXT CLASS'}</Text>}
        <Text style={styles.time}>{clock(item.startsAt)} – {clock(item.endsAt)}</Text><Text style={styles.item}>{item.title}</Text>
        <Text style={styles.copy}>{item.location || 'Room not set'}{item.instructor ? ` · ${item.instructor}` : ''}</Text>
        {conflicts.has(item.key) && <Text style={styles.warning}>Overlaps another class</Text>}
      </View>)}
    </Card>
    {showWindows ? <Card><Text style={styles.section}>Make time for study</Text>
      <Text style={styles.copy}>Find a window between 8 AM and 8 PM, with 10 minutes around commitments to move or take a break.</Text>
      <View style={styles.options}>{[30, 60].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value} minute study block`}
        aria-checked={minutes === value} accessibilityState={{ checked: minutes === value }} onPress={() => setMinutes(value)}
        style={[styles.choice, minutes === value && styles.selected]}><Text style={styles.item}>{value} min</Text></Pressable>)}</View>
      {stale && <Text style={styles.meta}>Using saved information. Refresh before choosing a window.</Text>}
      {day.status === 'unavailable' && <Text style={styles.copy}>{loading ? 'Checking your saved commitments…' : 'Load this day’s plan and timetable to find study windows.'}</Text>}
      {day.status === 'clockChange' && <Text style={styles.warning}>A time needs attention around a clock change. Check the timetable before planning study.</Text>}
      {day.status === 'missingDuration' && <Text style={styles.copy}>A timed task needs an estimated duration, or a planned event needs an end time, before study windows can be suggested.</Text>}
      {day.status === 'missingDuration' && <Button title="Review scheduled tasks" tone="plain" onPress={() => router.push('/tasks')}/>}
      {day.status === 'ready' && !day.windows.length && <Text style={styles.copy}>{date < localDateAt(now, timeZone) ? 'Choose today or a future date to plan study.' : `No ${minutes}-minute windows remain in these study hours. ${minutes === 60 ? 'Try a shorter block or another day.' : 'Choose another day or adjust your commitments.'}`}</Text>}
      {day.windows.slice(0, 3).map(window => <View key={window.startsAt} style={styles.window}>
        <View style={styles.windowCopy}><Text style={styles.item}>{clock(window.startsAt)} – {clock(window.endsAt)}</Text><Text style={styles.meta}>{window.minutes} minutes available in your saved plan</Text></View>
        <Button title={`Plan ${minutes} min at ${clock(window.startsAt)}`} tone="plain" onPress={() => onPlan(studyTaskDefaults(window.startsAt, minutes, timeZone))}/>
      </View>)}
      {day.windows.length > 3 && <Text style={styles.meta}>Showing the earliest three windows.</Text>}
      {day.status === 'ready' && <Text style={styles.meta}>Suggestions use saved classes, scheduled tasks and planned events. Leave room for other commitments too.</Text>}
      <Button title={refreshing ? 'Refreshing…' : 'Refresh classes & study windows'} disabled={refreshing} tone="plain" onPress={refresh}/>
      {compact && <Button title="Close study windows" tone="plain" onPress={() => setShowWindows(false)}/>}
    </Card> : <Button title="Find study time" tone="plain" onPress={() => setShowWindows(true)}/>}
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 16 }, heading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  section: { color: colors.ink, fontSize: 19, fontWeight: '800' }, copy: { color: colors.muted, lineHeight: 21 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  meeting: { paddingVertical: 12, gap: 5, borderTopWidth: 1, borderColor: colors.line }, next: { padding: 12, backgroundColor: colors.sage, borderRadius: 12, borderTopWidth: 0 },
  kicker: { color: colors.moss, fontSize: 11, letterSpacing: .6, fontWeight: '800' }, time: { color: colors.moss, fontWeight: '700' }, item: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  warning: { color: colors.coral, lineHeight: 21 }, options: { flexDirection: 'row', gap: 8 }, choice: { minHeight: 46, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  selected: { borderColor: colors.moss, backgroundColor: colors.sage }, window: { gap: 10, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 }, windowCopy: { gap: 5 },
});
