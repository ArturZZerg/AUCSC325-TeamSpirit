import { useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ClassSchedule } from '@campusflow/contracts';
import { addCalendarDays, classConflicts, classesOnDay, dayBounds } from '@campusflow/domain';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { ClassEditor, classDays, classPalette } from '@/features/class-editor';
import { useAction, useClasses } from '@/features/queries';
import { calendarLabel, weekStart } from '@/features/weekly-planner';
import { useTodayClock } from '@/features/today-clock';
import { useSessionStore } from '@/store/session';

export default function TimetableScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <TimetableContent key={JSON.stringify([session.user.id, session.accessToken])} timeZone={session.user.timeZone}/> : null;
}
function TimetableContent({ timeZone }: { timeZone: string }) {
  const router = useRouter(); const query = useClasses(); const action = useAction(); const busy = useRef(false);
  const { date: today } = useTodayClock(timeZone);
  const [selected, setSelected] = useState<string>(); const date = selected ?? today; const start = weekStart(date);
  const [editing, setEditing] = useState<ClassSchedule | null | undefined>();
  const [confirm, setConfirm] = useState<string>(); const [removing, setRemoving] = useState<string>(); const [failure, setFailure] = useState<string>();
  const days = Array.from({ length: 7 }, (_, offset) => {
    const day = addCalendarDays(start, offset); return { date: day, ...classesOnDay(query.data ?? [], day, timeZone) };
  });
  const day = days.find(value => value.date === date)!; const conflicts = classConflicts(day.occurrences);
  const meetings = [...new Map(days.flatMap(value => value.occurrences).map(item => [item.key, item])).values()];
  const total = meetings.length;
  const weekFrom = Date.parse(dayBounds(start, timeZone).start), weekThrough = Date.parse(dayBounds(addCalendarDays(start, 7), timeZone).start);
  const minutes = meetings.reduce((sum, item) => sum + (Math.min(weekThrough, Date.parse(item.endsAt)) - Math.max(weekFrom, Date.parse(item.startsAt))) / 60000, 0);
  const remove = async (id: string) => {
    if (busy.current) return;
    busy.current = true; setRemoving(id); setFailure(undefined);
    try { await action.mutateAsync({ path: `/classes/${id}`, method: 'DELETE' }); setConfirm(undefined); }
    catch (error) { setFailure(error instanceof Error ? error.message : 'Could not remove this class. Try again.'); }
    finally { busy.current = false; setRemoving(undefined); }
  };
  const clock = (instant: string) => new Date(instant).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' });
  return <Screen><ScrollView contentContainerStyle={styles.content}
    aria-hidden={editing !== undefined} accessibilityElementsHidden={editing !== undefined} importantForAccessibility={editing !== undefined ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}/> }>
    <View style={styles.heading}><Button title="Back to Today" tone="plain" onPress={() => router.replace('/today')}/><Text style={styles.kicker}>CLASS TIMETABLE</Text></View>
    <View style={styles.hero}><Ionicons name="school-outline" size={28} color={colors.moss}/>
      <Text style={styles.title}>Know where to be.</Text><Text style={styles.copy}>Your classes, rooms and weekly rhythm in one place.</Text></View>
    <Button title="Add a class" disabled={!!removing} onPress={() => setEditing(null)}/>
    <State loading={query.isLoading} error={query.error}/>
    {query.data && <Text style={styles.meta}>{query.isCached || query.isError ? 'Saved timetable · refresh to check for changes' : 'Timetable refreshed'} · Times in {timeZone}</Text>}
    <View style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous week" style={styles.arrow} onPress={() => setSelected(addCalendarDays(date, -7))}><Ionicons name="chevron-back" size={21} color={colors.ink}/></Pressable>
      <Button title="This week" tone="plain" onPress={() => setSelected(undefined)}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Next week" style={styles.arrow} onPress={() => setSelected(addCalendarDays(date, 7))}><Ionicons name="chevron-forward" size={21} color={colors.ink}/></Pressable>
    </View>
    <Text style={styles.section}>{calendarLabel(start, { month: 'short', day: 'numeric' })} – {calendarLabel(addCalendarDays(start, 6), { month: 'short', day: 'numeric' })}</Text>
    {query.data && <Text style={styles.copy}>{total} {total === 1 ? 'meeting' : 'meetings'} · {Number((minutes / 60).toFixed(1))} class {minutes === 60 ? 'hour' : 'hours'} this week</Text>}
    {days.some(value => value.issues.length > 0) && <Text style={styles.warning}>Some class times need attention around a clock change. Weekly totals include valid meetings only.</Text>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.days}>
      {days.map(value => <Pressable key={value.date} accessibilityRole="button" accessibilityLabel={`${calendarLabel(value.date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${query.data ? `${value.occurrences.length} classes` : 'not loaded'}`}
        aria-selected={date === value.date} accessibilityState={{ selected: date === value.date }} onPress={() => setSelected(value.date)} style={[styles.day, value.date === date && styles.selected]}>
        <Text style={[styles.meta, value.date === date && styles.selectedText]}>{calendarLabel(value.date, { weekday: 'short' })}</Text>
        <Text style={[styles.dayNumber, value.date === date && styles.selectedText]}>{calendarLabel(value.date, { day: 'numeric' })}</Text>
        <Text style={[styles.meta, value.date === date && styles.selectedText]}>{query.data ? value.occurrences.length : '—'}</Text>
      </Pressable>)}
    </View></ScrollView>
    <Text style={styles.section}>{calendarLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
    {day.issues.map(issue => <Text key={`${issue.classId}:${issue.date}`} accessibilityRole="alert" style={styles.warning}>{issue.title}: this time is ambiguous or unavailable during the clock change. Edit the class time.</Text>)}
    {query.data && !day.occurrences.length && !day.issues.length && <Card><Text style={styles.item}>No classes scheduled.</Text><Text style={styles.copy}>Make room for study or a little downtime.</Text><Button title="Open this day’s plan" tone="plain" onPress={() => router.push({ pathname: '/today', params: { date } })}/></Card>}
    {day.occurrences.map(item => <View key={item.key} style={[styles.meeting, { borderLeftColor: classPalette[item.color as keyof typeof classPalette] }]}>
      <Text style={styles.time}>{clock(item.startsAt)} – {clock(item.endsAt)}</Text><Text style={styles.item}>{item.title}</Text>
      <Text style={styles.copy}>{item.location || 'Room not set'}{item.instructor ? ` · ${item.instructor}` : ''}</Text>
      {conflicts.has(item.key) && <Text style={styles.warning}>Overlaps another class</Text>}
      <Button title={`Edit ${item.title}`} tone="plain" disabled={!!removing} onPress={() => setEditing(query.data!.find(value => value.id === item.classId)!)}/>
    </View>)}
    {!query.data && !query.isLoading && <Card><Text style={styles.item}>Your timetable isn’t available yet.</Text><Text style={styles.copy}>Connect and refresh to load your saved classes.</Text><Button title="Retry timetable" onPress={() => { void query.refetch(); }}/></Card>}
    <Text style={styles.section}>Your saved classes</Text>
    {query.data?.length === 0 && <Text style={styles.copy}>Start with one class from your syllabus. You can add lectures and labs separately.</Text>}
    {failure && <Text accessibilityRole="alert" style={styles.warning}>{failure}</Text>}
    {query.data?.map(item => <Card key={item.id}>
      <View style={styles.heading}><Text style={styles.item}>{item.title}</Text><View style={[styles.swatch, { backgroundColor: classPalette[item.color] }]}/></View>
      <Text style={styles.copy}>{[...item.weekdays].sort((a, b) => a - b).map(day => classDays[day - 1].slice(0, 3)).join(' · ')} · {item.startTime}–{item.endTime}</Text>
      <Text style={styles.meta}>{item.termStart} to {item.termEnd} · {item.timeZone}</Text>
      {item.location && <Text style={styles.copy}>{item.location}</Text>}{item.instructor && <Text style={styles.copy}>{item.instructor}</Text>}{item.notes && <Text style={styles.copy}>{item.notes}</Text>}
      <View style={styles.heading}><Button title={`Edit ${item.title} schedule`} tone="plain" disabled={!!removing} onPress={() => setEditing(item)}/>
        <Button title={`Remove ${item.title}`} tone="plain" disabled={!!removing} onPress={() => { setConfirm(item.id); setFailure(undefined); }}/></View>
      {confirm === item.id && <><Text style={styles.copy}>Remove this class and all its timetable meetings?</Text>
        <Button title={removing === item.id ? 'Removing…' : 'Confirm removal'} tone="danger" disabled={!!removing} onPress={() => { void remove(item.id); }}/>
        <Button title="Keep class" tone="plain" disabled={!!removing} onPress={() => setConfirm(undefined)}/></>}
    </Card>)}
    <Text style={styles.meta}>Weekly schedules repeat within the term, including holidays. Check your syllabus for exceptions.</Text>
  </ScrollView>{editing !== undefined && <ClassEditor item={editing} date={today} timeZone={timeZone} onClose={() => setEditing(undefined)}/>}</Screen>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  arrow: { minWidth: 46, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.sage },
  hero: { paddingVertical: 10, gap: 12 }, kicker: { color: colors.moss, fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: colors.ink }, section: { fontSize: 20, fontWeight: '800', color: colors.ink },
  copy: { color: colors.muted, lineHeight: 22 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  days: { flexDirection: 'row', gap: 6 }, day: { minWidth: 44, padding: 10, minHeight: 90, gap: 6, alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, selectedText: { color: colors.card }, dayNumber: { fontSize: 20, color: colors.ink, fontWeight: '800' },
  meeting: { padding: 16, gap: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4 },
  time: { color: colors.moss, fontWeight: '700' }, item: { fontSize: 17, color: colors.ink, fontWeight: '700' }, warning: { color: colors.coral, lineHeight: 21 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
});
