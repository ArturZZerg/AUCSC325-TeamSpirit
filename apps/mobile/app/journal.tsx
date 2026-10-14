import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addCalendarDays } from '@campusflow/domain';
import { Button, Card, Field, Screen, colors, BackLink } from '@/components/ui';
import { useWellnessJournal, useWellnessJournalAction } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { calendarLabel } from '@/features/weekly-planner';
import { ratingLabel, reflectJournal, type JournalEntry, type Rating } from '@/features/wellness-journal';
import { WellnessJournalEditor } from '@/features/wellness-journal-editor';
import { useSessionStore } from '@/store/session';

export default function JournalScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <JournalContent key={JSON.stringify([session.user.id, session.accessToken])} accountId={session.user.id} timeZone={session.user.timeZone}/> : null;
}
function JournalContent({ accountId, timeZone }: { accountId: string; timeZone: string }) {
  const router = useRouter(), { date: today, resumeCount } = useTodayClock(timeZone);
  const [anchor, setAnchor] = useState<string>(), [period, setPeriod] = useState<7 | 30>(7), [selected, setSelected] = useState<string>();
  const through = anchor && anchor < today ? anchor : today, from = addCalendarDays(through, -29);
  const query = useWellnessJournal(from, through), action = useWellnessJournalAction();
  const [editing, setEditing] = useState<{ date: string; entry: JournalEntry | null }>();
  const [search, setSearch] = useState(''), [message, setMessage] = useState<string>();
  const [confirmed, setConfirmed] = useState<{ date: string; entry: JournalEntry | null }>();
  const lastResume = useRef(resumeCount);
  const dayStrip = useRef<ScrollView>(null);
  useEffect(() => { if (lastResume.current !== resumeCount) { lastResume.current = resumeCount; void query.refetch({ cancelRefetch: false }); } }, [resumeCount, query.refetch]);
  const saved = query.data && confirmed && query.isError ? { ...query.data, entries: [
    ...query.data.entries.filter(entry => entry.date !== confirmed.date), ...(confirmed.entry ? [confirmed.entry] : []),
  ] } : query.data;
  const reflection = reflectJournal(saved, accountId, timeZone, through, period);
  const date = selected && reflection?.calendar.some(day => day.date === selected) ? selected : through;
  const entry = reflection?.entries.find(row => row.date === date) ?? null;
  const term = search.trim().toLocaleLowerCase();
  const rows = reflection?.entries.filter(row => !term || `${row.date} ${row.note ?? ''}`.toLocaleLowerCase().includes(term)) ?? [];
  const window = (end?: string) => { setAnchor(end); setSelected(undefined); setSearch(''); setMessage(undefined); setConfirmed(undefined); };
  return <Screen safeArea><View style={styles.fill} aria-hidden={!!editing} accessibilityElementsHidden={!!editing} importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}/>}>
      <View style={styles.heading}><BackLink to="Wellness" disabled={action.isPending} onPress={() => router.replace('/wellness')}/><Text style={styles.kicker}>CHECK-IN JOURNAL</Text></View>
      <Text style={styles.title}>A moment for yourself.</Text><Text style={styles.copy}>Keep a short record of how your days feel. Choose what to record and leave the rest blank.</Text>
      {message && <Text accessibilityRole="alert" style={styles.notice}>{message}</Text>}
      {action.cacheWarning && <Card><Text accessibilityRole="alert" style={styles.error}>{action.cacheWarning}</Text>
        <Button title="Retry device cleanup" tone="plain" disabled={action.isPending} onPress={() => { void action.retryCleanup(); }}/></Card>}
      <View style={styles.options}>{([7, 30] as const).map(days => <Pressable key={days} accessibilityRole="radio" accessibilityLabel={`${days}-day view`} aria-checked={period === days}
        accessibilityState={{ checked: period === days, disabled: action.isPending }} disabled={action.isPending} onPress={() => { setPeriod(days); setSelected(undefined); setSearch(''); }}
        style={[styles.option, period === days && styles.selected]}><Text style={styles.label}>{days} days</Text></Pressable>)}</View>
      <View style={styles.heading}><Button title="Previous 30 days" tone="plain" disabled={action.isPending} onPress={() => window(addCalendarDays(through, -30))}/>
        <Button title="Recent days" tone="plain" disabled={action.isPending || through === today} onPress={() => window()}/>
        <Button title="Next 30 days" tone="plain" disabled={action.isPending || through === today} onPress={() => window(addCalendarDays(through, 30))}/></View>
      <Text style={styles.meta}>{reflection?.from ?? from} – {through} · {timeZone}</Text>
      {query.isLoading && <Text style={styles.copy}>Loading your check-in history…</Text>}
      {!reflection && !query.isLoading && <Card><Text style={styles.section}>History unavailable</Text><Text style={styles.copy}>Connect and refresh to review this range before adding or editing a check-in.</Text></Card>}
      {reflection && <>
        <Text style={styles.notice}>{query.isError || query.isCached ? 'Showing saved history. Refresh when connected to check for changes.' : 'History loaded from your account.'}
          {confirmed && query.isError ? ' Your confirmed change is included.' : ''}</Text>
        <Card><Text style={styles.section}>{reflection.savedDays} of {period} days have a check-in</Text><Text style={styles.meta}>Unrecorded days stay blank. Averages use only the ratings you saved.</Text>
          <View style={styles.metrics}>{(['mood', 'energy', 'stress'] as Rating[]).map(metric => <View key={metric} style={styles.metric}>
            <Text style={styles.label}>{metric[0].toUpperCase() + metric.slice(1)}</Text><Text style={styles.score}>{reflection[metric].average?.toFixed(1) ?? '—'}<Text style={styles.meta}> / 5</Text></Text>
            <Text style={styles.meta}>{reflection[metric].samples} recorded {reflection[metric].samples === 1 ? 'rating' : 'ratings'}</Text>
          </View>)}</View></Card>
        <ScrollView ref={dayStrip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days} onContentSizeChange={() => dayStrip.current?.scrollToEnd({ animated: false })}>
          {reflection.calendar.map(day => <Pressable key={day.date} accessibilityRole="button"
            accessibilityLabel={`${day.date}, ${day.entry ? `mood ${ratingLabel('mood', day.entry.mood)}` : 'no check-in'}`}
            aria-selected={date === day.date} accessibilityState={{ selected: date === day.date, disabled: action.isPending }} disabled={action.isPending} onPress={() => setSelected(day.date)}
            style={[styles.day, date === day.date && styles.selected]}>
            <Text style={styles.meta}>{calendarLabel(day.date, { weekday: 'short' })}</Text><Text style={styles.dayNumber}>{calendarLabel(day.date, { day: 'numeric' })}</Text>
            <Text style={styles.meta}>{day.entry?.mood === null ? 'No mood' : day.entry ? ratingLabel('mood', day.entry.mood) : 'Blank'}</Text>
          </Pressable>)}</ScrollView>
        <Card><View style={styles.heading}><Text style={styles.section}>{date === today ? 'Today’s check-in' : 'Selected check-in'}</Text><Text style={styles.meta}>{date}</Text></View>
          {entry ? <><Text style={styles.copy}>Mood: {ratingLabel('mood', entry.mood)} · Energy: {ratingLabel('energy', entry.energy)} · Stress: {ratingLabel('stress', entry.stress)}</Text>
            <Text style={styles.copy}>{entry.note || 'No note recorded.'}</Text></> : <Text style={styles.copy}>No saved entry for this day. You can record a rating, a note, or both.</Text>}
          <Button title={entry ? 'Edit selected check-in' : 'Add selected check-in'} disabled={action.isPending} onPress={() => { setMessage(undefined); setEditing({ date, entry }); }}/></Card>
        <Text style={styles.section}>Your recorded days</Text><Field label="Search check-ins" value={search} onChangeText={setSearch} placeholder="Search notes or YYYY-MM-DD" editable={!action.isPending}/>
        {!rows.length && <Text style={styles.copy}>{term ? 'No matching entries in this visible range.' : 'No check-ins recorded in this visible range.'}</Text>}
        {rows.map(row => <Card key={row.id}><Text style={styles.section}>{calendarLabel(row.date, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
          <Text style={styles.meta}>Mood: {ratingLabel('mood', row.mood)} · Energy: {ratingLabel('energy', row.energy)} · Stress: {ratingLabel('stress', row.stress)}</Text>
          {row.note && <Text style={styles.copy}>{row.note}</Text>}<Button title={`Review ${row.date}`} tone="plain" disabled={action.isPending} onPress={() => { setSelected(row.date); setEditing({ date: row.date, entry: row }); }}/></Card>)}
        <Text style={styles.meta}>History captured {new Date(saved!.capturedAt).toLocaleString(undefined, { timeZone })}. Saved entries can be read offline; changes require a connection. These are personal ratings, without medical interpretation.</Text>
      </>}
      <Button title="Refresh history" tone="plain" disabled={query.isFetching || action.isPending} onPress={() => { void query.refetch(); }}/>
    </ScrollView>
  </View>{editing && <WellnessJournalEditor date={editing.date} entry={editing.entry} action={action} onClose={() => setEditing(undefined)}
    onSaved={row => { setConfirmed({ date: editing.date, entry: row }); setMessage(row ? 'Check-in saved to your account.' : 'Check-in deleted from your account.'); }}/>}</Screen>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, content: { padding: 20, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 40 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '800', lineHeight: 38 }, section: { color: colors.ink, fontSize: 18, fontWeight: '800', lineHeight: 25 },
  copy: { color: colors.ink, lineHeight: 23 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 19 }, label: { color: colors.ink, fontWeight: '700' },
  notice: { backgroundColor: colors.sage, borderRadius: 13, padding: 14, color: colors.ink, lineHeight: 21 }, error: { color: colors.danger, lineHeight: 21 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { minHeight: 46, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  selected: { backgroundColor: colors.sage, borderColor: colors.moss }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, metric: { flex: 1, minWidth: 100, paddingVertical: 8, gap: 4 },
  score: { fontSize: 28, fontWeight: '800', color: colors.moss }, days: { gap: 8 }, day: { minWidth: 88, minHeight: 96, borderRadius: 13, padding: 12, gap: 5, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center' }, dayNumber: { color: colors.ink, fontSize: 22, fontWeight: '700' } });
