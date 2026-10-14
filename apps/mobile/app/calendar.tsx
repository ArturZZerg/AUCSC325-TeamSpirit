import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Screen, State, colors } from '@/components/ui';
import { useAcademic, useEvents, useTasks } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { calendarEntries, monthGrid, shiftMonth, type CalendarEntry, type CalendarKind } from '@/features/month-calendar';
import { calendarLabel } from '@/features/weekly-planner';
import { TaskEditor } from '@/features/task-editor';
import type { TaskFormValues } from '@/features/task-form';
import { useSessionStore } from '@/store/session';

const kindColors: Record<CalendarKind, string> = { academic: colors.blue, personalTask: colors.moss, event: colors.coral };
const kindLabels: Record<CalendarKind, string> = { academic: 'Coursework', personalTask: 'Task', event: 'Saved event' };
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarScreen() {
  const session = useSessionStore(state => state.session);
  // Account switches discard the private month/day selection.
  return session ? <CalendarContent key={JSON.stringify([session.user.id, session.accessToken, session.user.timeZone])} timeZone={session.user.timeZone}/> : null;
}

function CalendarContent({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const { date: today } = useTodayClock(timeZone);
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState<Partial<TaskFormValues>>();
  const tasks = useTasks(), academic = useAcademic(), events = useEvents();
  const grid = monthGrid(month, today);
  const days = calendarEntries({ tasks: tasks.data, academic: academic.data, events: events.data, from: grid.start, through: grid.end, timeZone });
  const entries = days.get(selected) ?? [];
  const loading = tasks.isLoading || academic.isLoading;
  const missing = (!tasks.data && !!tasks.error) || (!academic.data && !!academic.error);
  const refreshing = tasks.isRefetching || academic.isRefetching || events.isRefetching;
  const refresh = () => { void Promise.all([tasks.refetch(), academic.refetch(), events.refetch()]); };
  const select = (date: string) => { setSelected(date); if (date.slice(0, 7) !== month.slice(0, 7)) setMonth(`${date.slice(0, 7)}-01`); };
  const move = (months: number) => { const next = shiftMonth(month, months); setMonth(next); setSelected(next.slice(0, 7) === today.slice(0, 7) ? today : next); };

  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} aria-hidden={!!draft} accessibilityElementsHidden={!!draft}
    importantForAccessibility={draft ? 'no-hide-descendants' : 'auto'} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
    <View style={styles.top}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Today" onPress={() => router.replace('/today')} style={styles.back} hitSlop={6}>
        <Ionicons name="chevron-back" size={20} color={colors.moss}/><Text style={styles.backText}>Today</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Jump to today" onPress={() => { setMonth(`${today.slice(0, 7)}-01`); setSelected(today); }} style={styles.todayChip}>
        <Text style={styles.todayText}>Jump to today</Text></Pressable>
    </View>
    <View style={styles.monthRow}>
      <Text accessibilityRole="header" style={styles.title}>{calendarLabel(month, { month: 'long', year: 'numeric' })}</Text>
      <View style={styles.arrows}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => move(-1)} style={styles.arrow}><Ionicons name="chevron-back" size={20} color={colors.ink}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => move(1)} style={styles.arrow}><Ionicons name="chevron-forward" size={20} color={colors.ink}/></Pressable>
      </View>
    </View>
    <View style={styles.legend}>{(Object.keys(kindColors) as CalendarKind[]).map(kind => <View key={kind} style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: kindColors[kind] }]}/><Text style={styles.legendText}>{kindLabels[kind]}</Text></View>)}</View>

    <View style={styles.grid}>
      <View style={styles.week}>{weekdays.map(day => <Text key={day} style={styles.weekday}>{day.slice(0, 1)}</Text>)}</View>
      {grid.weeks.map(week => <View key={week[0].date} style={styles.week}>{week.map(cell => {
        const rows = days.get(cell.date) ?? [], open = rows.filter(row => !row.done), isSelected = cell.date === selected;
        const kinds = [...new Set(open.map(row => row.kind))];
        return <Pressable key={cell.date} accessibilityRole="button" accessibilityState={{ selected: isSelected }}
          accessibilityLabel={`${calendarLabel(cell.date, { weekday: 'long', month: 'long', day: 'numeric' })}${cell.isToday ? ', today' : ''}: ${open.length ? `${open.length} open ${open.length === 1 ? 'item' : 'items'}` : 'nothing open'}`}
          onPress={() => select(cell.date)} style={[styles.cell, isSelected && styles.cellSelected]}>
          <View style={[styles.number, cell.isToday && !isSelected && styles.numberToday]}>
            <Text style={[styles.numberText, !cell.inMonth && styles.outside, isSelected && styles.selectedText, cell.isToday && !isSelected && styles.todayNumber]}>{Number(cell.date.slice(8))}</Text>
          </View>
          <View style={styles.dots}>{kinds.map(kind => <View key={kind} style={[styles.dot, { backgroundColor: isSelected ? '#fff' : kindColors[kind] }]}/>)}</View>
        </Pressable>;
      })}</View>)}
    </View>

    <State loading={loading}/>
    {missing && <Text accessibilityRole="alert" style={styles.notice}>Some saved items couldn’t load. Days may be missing entries; refresh when you’re connected.</Text>}
    {!loading && !missing && ((tasks.isCached && !!tasks.data) || (academic.isCached && !!academic.data)) && <Text style={styles.meta}>Showing saved information. Pull to refresh.</Text>}

    <View style={styles.dayHeading}>
      <Text accessibilityRole="header" style={styles.section}>{calendarLabel(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      {entries.length > 0 && <Text style={styles.count}>{entries.length}</Text>}
    </View>
    {!loading && !entries.length && <View style={styles.empty}><Ionicons name="sunny-outline" size={26} color={colors.moss}/>
      <Text style={styles.item}>Nothing dated for this day.</Text><Text style={styles.meta}>Routines and undated tasks appear in the day plan.</Text></View>}
    {entries.map(entry => <EntryRow key={entry.key} entry={entry} timeZone={timeZone}/>)}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/today', params: { date: selected } })} style={[styles.action, styles.actionPlain]}>
        <Ionicons name="today-outline" size={17} color={colors.moss}/><Text style={styles.actionPlainText}>Open day plan</Text></Pressable>
      {selected >= today && <Pressable accessibilityRole="button" onPress={() => setDraft({ scheduledMode: 'date', scheduledDate: selected })} style={styles.action}>
        <Ionicons name="add" size={18} color="#fff"/><Text style={styles.actionText}>Add task on this day</Text></Pressable>}
    </View>
  </ScrollView>{draft && <TaskEditor task={null} timeZone={timeZone} initialValues={draft} onClose={() => setDraft(undefined)}/>}</Screen>;
}

function EntryRow({ entry, timeZone }: { entry: CalendarEntry; timeZone: string }) {
  const time = entry.timing.kind === 'instant' ? new Date(entry.timing.at).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' }) : undefined;
  const label = entry.role === 'due' ? (time ? `Due ${time}` : 'Due this day') : entry.role === 'planned' ? (time ? `Planned ${time}` : 'Planned for this day') : (time ? `Starts ${time}` : 'All day');
  return <View style={styles.entry}>
    <View style={[styles.stripe, { backgroundColor: kindColors[entry.kind] }]}/>
    <View style={styles.entryBody}>
      <Text style={[styles.kind, { color: kindColors[entry.kind] }]}>{kindLabels[entry.kind].toUpperCase()}</Text>
      <Text style={[styles.item, entry.done && styles.done]}>{entry.title}</Text>
      <Text style={styles.meta}>{entry.done ? `Finished · ${label}` : label}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 40 }, backText: { color: colors.moss, fontWeight: '700', fontSize: 16 },
  todayChip: { paddingHorizontal: 12, minHeight: 34, borderRadius: 17, backgroundColor: colors.sage, justifyContent: 'center' }, todayText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', flexShrink: 1 },
  arrows: { flexDirection: 'row', gap: 8 }, arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  grid: { backgroundColor: colors.card, borderRadius: 20, padding: 8, borderWidth: 1, borderColor: colors.line, gap: 2 },
  week: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '800', paddingVertical: 6 },
  cell: { flex: 1, minHeight: 52, alignItems: 'center', paddingTop: 4, gap: 3, borderRadius: 14 }, cellSelected: { backgroundColor: colors.moss },
  number: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, numberToday: { borderWidth: 2, borderColor: colors.moss },
  numberText: { color: colors.ink, fontWeight: '700', fontVariant: ['tabular-nums'] }, outside: { color: colors.faint }, selectedText: { color: '#fff' }, todayNumber: { color: colors.moss },
  dots: { flexDirection: 'row', gap: 3, minHeight: 6 }, dot: { width: 6, height: 6, borderRadius: 3 },
  dayHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }, section: { color: colors.ink, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  count: { color: colors.muted, fontWeight: '700', backgroundColor: colors.sage, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden', fontSize: 12 },
  entry: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  stripe: { width: 4 }, entryBody: { flex: 1, padding: 12, gap: 2 }, kind: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  item: { color: colors.ink, fontSize: 16, fontWeight: '700' }, done: { color: colors.muted, textDecorationLine: 'line-through' }, meta: { color: colors.muted },
  empty: { alignItems: 'center', gap: 4, padding: 18, borderRadius: 16, backgroundColor: colors.sage },
  notice: { backgroundColor: colors.warnSurface, color: colors.warnText, padding: 12, borderRadius: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: colors.moss }, actionText: { color: '#fff', fontWeight: '700' },
  actionPlain: { backgroundColor: colors.sage }, actionPlainText: { color: colors.ink, fontWeight: '700' },
});
