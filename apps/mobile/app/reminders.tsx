import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { idSchema } from '@campusflow/contracts';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAcademic, useEvents, useGoals, usePreferences, useReminders, useTasks } from '@/features/queries';
import { reminderRows, type ReminderRow, type ReminderSubject } from '@/features/reminder-center';
import { TaskEditor } from '@/features/task-editor';
import { TaskReminderEditor } from '@/features/task-reminder-editor';
import { AcademicReminderEditor } from '@/features/academic-reminder-editor';
import { GoalReminderEditor } from '@/features/goal-reminder-editor';
import { EventReminderEditor } from '@/features/event-reminder-editor';
import { taskTimingLabel } from '@/features/task-form';
import { useSessionStore } from '@/store/session';
import type { Session } from '@/lib/types';

export default function RemindersScreen() {
  const session = useSessionStore(state => state.session);
  const params = useLocalSearchParams<{ reminderId?: string | string[]; accountId?: string | string[] }>();
  return session ? <ReminderCenter key={`${session.accessToken}:${session.user.timeZone}`} owner={session} params={params}/> : null;
}
function ReminderCenter({ owner, params }: { owner: Session; params: { reminderId?: string | string[]; accountId?: string | string[] } }) {
  const router = useRouter(), reminders = useReminders(), preferences = usePreferences();
  const tasks = useTasks(), academic = useAcademic(), goals = useGoals(), events = useEvents();
  const queries = [reminders, preferences, tasks, academic, goals, events];
  const validId = idSchema.safeParse(params.reminderId);
  const validOwner = params.accountId === undefined || params.accountId === owner.user.id;
  const linkedId = validOwner && validId.success ? validId.data : undefined;
  const [selected, setSelected] = useState<string>(), [search, setSearch] = useState('');
  const [view, setView] = useState<'upcoming' | 'earlier' | 'all'>('upcoming'), [limit, setLimit] = useState(50);
  const [editing, setEditing] = useState<ReminderSubject>(), [editingTask, setEditingTask] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setSelected(linkedId); }, [linkedId]);
  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    const timer = setInterval(() => { if (AppState.currentState === 'active') refreshClock(); }, 60_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refreshClock(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const rows = reminderRows(reminders.data ?? [], { tasks: tasks.data, academic: academic.data, goals: goals.data, events: events.data }, owner.user.timeZone, preferences.data);
  const highlighted = rows.find(row => row.reminder.id === selected);
  const searchText = search.trim().toLocaleLowerCase();
  const visible = rows.filter(row => row.reminder.id !== highlighted?.reminder.id
    && (view === 'all' || (view === 'upcoming' ? Date.parse(row.fireAt) > now : Date.parse(row.fireAt) <= now))
    && (!searchText || `${row.subject?.value.title ?? ''} ${({ personalTask: 'personal task', academicItem: 'coursework', goal: 'routine', savedEvent: 'campus event' })[row.reminder.targetKind]}`.toLocaleLowerCase().includes(searchText)));
  const saved = queries.some(query => query.data && (query.isCached || query.error));
  const refreshing = queries.some(query => query.isRefetching);
  const refresh = () => { setNow(Date.now()); void Promise.allSettled(queries.map(query => query.refetch({ cancelRefetch: false }))); };
  const close = () => { setSelected(undefined); router.setParams({ reminderId: undefined, accountId: undefined }); };
  function rowCard(row: ReminderRow, expanded = false) {
    const subject = row.subject, title = subject?.value.title ?? 'Saved item unavailable';
    const status = !row.reminder.enabled ? 'Reminder off' : row.categoryEnabled === false ? 'Category off'
      : row.categoryEnabled === undefined ? 'Preferences unavailable' : Date.parse(row.fireAt) <= now ? 'Time passed' : 'Upcoming';
    return <Card key={row.reminder.id}>
      <View style={styles.rowTop}><Text style={styles.kicker}>{({ personalTask: 'PERSONAL TASK', academicItem: 'COURSEWORK', goal: 'ROUTINE', savedEvent: 'CAMPUS EVENT' })[row.reminder.targetKind]}</Text>
        <Text style={styles.badge}>{status}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open reminder: ${title}`} accessibilityState={{ expanded }}
        style={styles.open} onPress={() => setSelected(row.reminder.id)}><Text style={styles.item}>{title}</Text>
        <Text style={styles.meta}>{taskTimingLabel({ kind: 'instant', at: row.fireAt }, owner.user.timeZone)}</Text></Pressable>
      {row.delayed && <Text style={styles.meta}>Moved out of quiet hours. Saved time: {taskTimingLabel({ kind: 'instant', at: row.reminder.fireAt }, owner.user.timeZone)}</Text>}
      {row.reminder.occurrenceKey && <Text style={styles.meta}>Occurrence: {row.reminder.occurrenceKey}</Text>}
      {expanded && <>
        {!subject && <Text style={styles.meta}>The matching item is not in the available information. Refresh to check it; this does not confirm deletion.</Text>}
        {subject?.kind === 'task' && <><Text style={styles.meta}>{subject.value.completedAt ? 'Task completed.' : subject.value.recurrence ? 'Complete recurring occurrences from Today.' : 'Choose your next step.'}</Text>
          {subject.value.description && <Text style={styles.meta}>{subject.value.description}</Text>}
          <Text style={styles.meta}>Deadline: {taskTimingLabel(subject.value.due, owner.user.timeZone)}</Text>
          {subject.value.scheduled && <Text style={styles.meta}>Planned: {taskTimingLabel(subject.value.scheduled, owner.user.timeZone)}</Text>}
          {!subject.value.completedAt && !subject.value.recurrence && <Button title="Focus on this task" onPress={() => router.push({ pathname: '/focus', params: { taskId: subject.value.id } })}/>}
          <Button title="Edit this task" tone="plain" onPress={() => { setEditingTask(true); setEditing(subject); }}/></>}
        {subject?.kind === 'academic' && <><Text style={styles.meta}>Deadline: {taskTimingLabel(subject.value.due, owner.user.timeZone)} · {subject.value.submissionState ?? 'No submission status'}</Text>
          <Button title="Open coursework" tone="plain" onPress={() => router.push('/academics')}/></>}
        {subject?.kind === 'goal' && <><Text style={styles.meta}>{subject.value.pausedAt ? 'This routine is paused.' : 'Review and complete the right occurrence in your daily plan.'}</Text>
          <Button title="Open daily plan" tone="plain" onPress={() => router.push('/today')}/></>}
        {subject?.kind === 'event' && <><Text style={styles.meta}>{subject.value.location ?? 'No location provided'}</Text>
          <Button title="Open campus events" tone="plain" onPress={() => router.push('/campus')}/></>}
        {subject && (subject.kind !== 'event' || subject.value.savedReminder !== undefined)
          && <Button title="Edit this reminder" tone="plain" onPress={() => { setEditingTask(false); setEditing(subject); }}/>}
        <Button title="Close selected reminder" tone="plain" onPress={close}/>
      </>}
    </Card>;
  }
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.heading}><Button title="Back to Today" tone="plain" onPress={() => router.replace('/today')}/><Text style={styles.kicker}>YOUR REMINDERS</Text></View>
    <Text accessibilityRole="header" style={styles.title}>A nudge, then a next step.</Text>
    <Text style={styles.copy}>Review saved reminders and open the work behind them. Times reflect your account zone and available quiet-hour settings.</Text>
    <View style={styles.actions}><View style={styles.action}><Button title={refreshing ? 'Refreshing…' : 'Refresh reminders'} disabled={refreshing} onPress={refresh}/></View>
      <View style={styles.action}><Button title="Notification settings" tone="plain" onPress={() => router.push('/settings')}/></View></View>
    <State loading={reminders.isLoading} error={queries.find(query => query.error)?.error}/>
    {saved && <Text style={styles.notice}>Showing saved information. Connect and refresh to check changes made elsewhere.</Text>}
    <Text style={styles.meta}>These are saved reminder times, not a delivery history. Device permission, preferences and Android timing can affect arrival.</Text>
    {params.reminderId !== undefined && (!validOwner || !validId.success) && <Card><Text style={styles.item}>This reminder link is unavailable.</Text><Text style={styles.meta}>Browse this account’s saved reminders below.</Text></Card>}
    {highlighted && <><Text style={styles.section}>Selected reminder</Text>{rowCard(highlighted, true)}</>}
    {selected && reminders.data && !highlighted && <Card><Text style={styles.item}>This reminder is not in your saved information.</Text><Text style={styles.meta}>It may have changed or been removed. Refresh to check, or browse your reminders.</Text><Button title="Browse saved reminders" tone="plain" onPress={close}/></Card>}
    <Field label="Search reminders" value={search} onChangeText={value => { setSearch(value); setLimit(50); }} placeholder="Task, coursework or routine" autoCorrect={false}/>
    <View style={styles.choices}>{(['upcoming', 'earlier', 'all'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Reminder view: ${value}`}
      accessibilityState={{ selected: view === value }} style={[styles.chip, view === value && styles.chosen]} onPress={() => { setView(value); setLimit(50); }}>
      <Text style={[styles.chipText, view === value && styles.chosenText]}>{value === 'all' ? 'All saved' : value === 'earlier' ? 'Earlier' : 'Upcoming'}</Text></Pressable>)}</View>
    {!reminders.data && !reminders.isLoading && <Card><Text style={styles.item}>Reminders are unavailable.</Text><Text style={styles.meta}>Connect and refresh to load them. An unavailable read does not mean you have no reminders.</Text></Card>}
    {reminders.data && !visible.length && <Card><Text style={styles.item}>{!reminders.data.length ? 'No saved reminders yet.' : 'No other reminders in this view.'}</Text>
      <Text style={styles.meta}>{!reminders.data.length ? 'Set a reminder on a task, coursework deadline, routine or saved event.' : 'Try All saved or clear your search.'}</Text>
      {!reminders.data.length && <Button title="Open my tasks" tone="plain" onPress={() => router.push('/tasks')}/>}</Card>}
    {visible.slice(0, limit).map(row => rowCard(row))}
    {visible.length > limit && <Button title="Show more reminders" tone="plain" onPress={() => setLimit(value => value + 50)}/>}
  </ScrollView>
    {editing?.kind === 'task' && (editingTask ? <TaskEditor task={editing.value} timeZone={owner.user.timeZone} onClose={() => setEditing(undefined)}/>
      : <TaskReminderEditor task={editing.value} timeZone={owner.user.timeZone} onClose={() => setEditing(undefined)}/>)}
    {editing?.kind === 'academic' && <AcademicReminderEditor item={editing.value} onClose={() => setEditing(undefined)}/>}
    {editing?.kind === 'goal' && <GoalReminderEditor goal={editing.value} onClose={() => setEditing(undefined)}/>}
    {editing?.kind === 'event' && <EventReminderEditor event={editing.value} timeZone={owner.user.timeZone} onClose={() => setEditing(undefined)}/>}
  </Screen>;
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  heading: { alignItems: 'flex-start', gap: 12 }, kicker: { color: colors.moss, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '800' }, copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { flexGrow: 1, flexBasis: 180 },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { color: colors.moss, backgroundColor: colors.sage, padding: 7, borderRadius: 10, fontSize: 12, fontWeight: '700' },
  open: { minHeight: 48, gap: 7, justifyContent: 'center' }, item: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  section: { color: colors.ink, fontSize: 18, fontWeight: '800' }, meta: { color: colors.muted, fontSize: 14, lineHeight: 21 }, notice: { color: colors.blue, lineHeight: 21 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
  chosen: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.muted, fontWeight: '600' }, chosenText: { color: '#FFFFFF' },
});
