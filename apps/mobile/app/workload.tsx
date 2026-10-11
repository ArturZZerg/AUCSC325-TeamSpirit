import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAcademic, useStudyPlans, useTasks } from '@/features/queries';
import { filterWorkload, workloadInbox, type WorkloadRow, type WorkloadSection, type WorkloadView } from '@/features/workload-inbox';
import { useTodayClock } from '@/features/today-clock';
import { useAgendaClock } from '@/features/use-agenda-clock';
import { taskTimingLabel } from '@/features/task-form';
import { TaskEditor } from '@/features/task-editor';
import { PreparationPlanEditor } from '@/features/preparation-plan-editor';
import { useSessionStore } from '@/store/session';
import type { AcademicItem, PersonalTask } from '@/lib/types';

const sections: Record<WorkloadSection, { title: string; detail: string }> = {
  attention: { title: 'Needs attention', detail: 'Review missed deadlines and earlier sessions. Choose your next step.' },
  unscheduled: { title: 'No time set', detail: 'Give these tasks a place in your week.' },
  coursework: { title: 'Coursework to plan', detail: 'Break a deadline into manageable study sessions.' },
  today: { title: 'Today’s work', detail: 'Open work scheduled or due today, plus your chosen Main Goal.' },
  later: { title: 'Coming up', detail: 'Scheduled tasks and coursework with preparation already saved.' },
};
export default function WorkloadScreen() {
  const session = useSessionStore(state => state.session);
  return <WorkloadContent key={JSON.stringify([session?.user.id, session?.accessToken])}/>;
}
function WorkloadContent() {
  const router = useRouter();
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date, resumeCount } = useTodayClock(timeZone), now = useAgendaClock(date, timeZone);
  const tasks = useTasks(), academic = useAcademic(), plans = useStudyPlans();
  const [search, setSearch] = useState(''), [view, setView] = useState<WorkloadView>('queue');
  const [editing, setEditing] = useState<PersonalTask>(), [preparing, setPreparing] = useState<AcademicItem>();
  const lastResume = useRef(resumeCount);
  useEffect(() => {
    if (lastResume.current === resumeCount) return;
    lastResume.current = resumeCount;
    void tasks.refetch({ cancelRefetch: false }); void academic.refetch({ cancelRefetch: false });
    // Study plans already refresh on foreground resume in their query hook.
  }, [resumeCount, tasks.refetch, academic.refetch]);
  const plansCurrent = plans.data !== undefined && !plans.isCached && !plans.error && !plans.isRefetching;
  const inbox = workloadInbox({ tasks: tasks.data, academic: academic.data, plans: plans.data, plansCurrent }, timeZone, now);
  const groups = filterWorkload(inbox.rows, view, search, timeZone);
  const available = tasks.data !== undefined || academic.data !== undefined;
  const loading = tasks.isLoading || academic.isLoading || plans.isLoading;
  const saved = [tasks, academic, plans].some(query => query.data !== undefined && (query.isCached || query.error));
  const missing = [tasks.data === undefined && 'Tasks', academic.data === undefined && 'Coursework', plans.data === undefined && 'Study plans'].filter(Boolean).join(', ');
  const modalOpen = !!editing || !!preparing;
  const refresh = () => { void Promise.all([tasks.refetch(), academic.refetch(), plans.refetch()]); };
  const openPlan = (id: string) => router.push({ pathname: '/study-plans', params: { planId: id } });
  return <Screen><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    aria-hidden={modalOpen} accessibilityElementsHidden={modalOpen} importantForAccessibility={modalOpen ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={tasks.isRefetching || academic.isRefetching || plans.isRefetching} onRefresh={refresh}/> }>
    <View style={styles.heading}><Button title="Back to Today" tone="plain" onPress={() => router.replace('/today')}/><Text style={styles.kicker}>WORKLOAD INBOX</Text></View>
    <Text style={styles.title}>Clear your next step.</Text><Text style={styles.meta}>Bring loose tasks and coursework into a plan you can follow.</Text>
    {available && <View style={styles.summary}>
      <Metric value={inbox.attention} label="to revisit"/><Metric value={tasks.data === undefined ? undefined : inbox.unscheduled} label="tasks to schedule"/>
      <Metric value={academic.data !== undefined && plansCurrent ? inbox.coursework : undefined} label="deadlines to plan"/>
    </View>}
    <View style={styles.actions}><Button title="Find a study window" tone="plain" onPress={() => router.push('/planner')}/><Button title="My study plans" tone="plain" onPress={() => router.push('/study-plans')}/>
      <Button title="Refresh workload" tone="plain" disabled={tasks.isRefetching || academic.isRefetching || plans.isRefetching} onPress={refresh}/></View>
    <State loading={loading && !available} error={tasks.error || academic.error || plans.error}/>
    {saved && <Text style={styles.notice}>Showing saved workload. Refresh to check changes made elsewhere.</Text>}
    {missing && <Text style={styles.notice}>{missing}: {loading ? 'still loading' : 'unavailable'}. Counts include available information.</Text>}
    {!plansCurrent && academic.data !== undefined && <Text style={styles.meta}>Refresh study plans before creating a new preparation plan. Saved links remain available.</Text>}
    <Field label="Search workload" value={search} onChangeText={setSearch} placeholder="Task, coursework or plan" autoCorrect={false}/>
    <View style={styles.actions}>{([{ value: 'queue', label: 'To organise' }, { value: 'today', label: 'Today' }, { value: 'later', label: 'Later' }] as const).map(option =>
      <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: view === option.value }} aria-checked={view === option.value}
        onPress={() => setView(option.value)} style={[styles.choice, view === option.value && styles.selected]}><Text style={[styles.choiceText, view === option.value && styles.selectedText]}>{option.label}</Text></Pressable>)}</View>
    {available && !groups.length && <Card><Text style={styles.section}>{search ? 'Nothing matches this search.' : !inbox.complete || saved ? 'No items in the available information.' : view === 'queue' ? 'Your next steps have a place.' : view === 'today' ? 'No open work scheduled today.' : 'No later work in this view.'}</Text>
      <Text style={styles.meta}>{search ? 'Try another title or clear your search.' : !inbox.complete || saved ? 'Refresh to check the rest of your workload.' : 'Browse another view or use your weekly plan to choose a study window.'}</Text>
      {search && <Button title="Clear workload search" tone="plain" onPress={() => setSearch('')}/>}
    </Card>}
    {groups.map(group => <View key={group.section} style={styles.group}>
      <View style={styles.heading}><Text style={styles.section}>{sections[group.section].title}</Text><Text style={styles.count}>{group.rows.length}</Text></View>
      <Text style={styles.meta}>{sections[group.section].detail}</Text>
      {group.rows.map(row => <WorkloadCard key={`${row.kind}:${row.kind === 'task' ? row.task.id : row.item.id}`} row={row} timeZone={timeZone}
        onEdit={setEditing} onPrepare={setPreparing} onPlan={openPlan} onRefresh={refresh}
        onFocus={task => router.push({ pathname: '/focus', params: { taskId: task.id } })}/>) }
    </View>)}
    {inbox.deferred > 0 && <Text style={styles.meta}>{inbox.deferred} snoozed {inbox.deferred === 1 ? 'task returns' : 'tasks return'} when the snooze ends. Overdue deadlines stay visible.</Text>}
    {inbox.recurring > 0 && <Card><Text style={styles.item}>Keep your routines in Today.</Text><Text style={styles.meta}>Repeating tasks use their daily occurrence state.</Text><Button title="Open today’s routines" tone="plain" onPress={() => router.push('/today')}/></Card>}
    <Text style={styles.meta}>Study minutes are estimates. Completing preparation does not submit coursework. Imported coursework reflects the last successful sync.</Text>
  </ScrollView>
    {editing && <TaskEditor key={editing.id} task={editing} timeZone={timeZone} onClose={() => setEditing(undefined)}/>}
    {preparing && <PreparationPlanEditor key={preparing.id} item={preparing} timeZone={timeZone} onClose={() => setPreparing(undefined)}
      onSaved={() => { setPreparing(undefined); router.push('/study-plans'); }}/>}
  </Screen>;
}
function WorkloadCard({ row, timeZone, onEdit, onFocus, onPrepare, onPlan, onRefresh }: {
  row: WorkloadRow; timeZone: string; onEdit(task: PersonalTask): void; onFocus(task: PersonalTask): void;
  onPrepare(item: AcademicItem): void; onPlan(id: string): void; onRefresh(): void;
}) {
  if (row.kind === 'task') return <Card>
    <View style={styles.heading}><Text style={styles.kicker}>{row.task.studyPlanId ? 'STUDY SESSION' : 'PERSONAL TASK'}</Text><Text style={styles.meta}>{row.task.priority} priority</Text></View>
    <Text style={styles.item}>{row.task.title}</Text>
    {row.plan && <Text style={styles.meta}>{row.plan.title}{row.plan.archivedAt ? ' · archived plan' : ''}</Text>}
    {row.task.studyPlanId && !row.plan && <Text style={styles.meta}>Study plan details are unavailable.</Text>}
    {row.task.due && <Text style={row.overdue ? styles.attention : styles.meta}>Due: {taskTimingLabel(row.task.due, timeZone)}{row.overdue ? ' · overdue' : ''}</Text>}
    <Text style={styles.meta}>{row.task.scheduled ? `Scheduled: ${taskTimingLabel(row.task.scheduled, timeZone)}` : 'Choose when to work on this.'}
      {row.task.estimatedMinutes === null ? ' · No estimate' : ` · ${row.task.estimatedMinutes} min estimated`}</Text>
    {row.earlier && <Text style={styles.attention}>This session was scheduled earlier. Review the date before moving it.</Text>}
    {row.snoozed && <Text style={styles.meta}>Snoozed until {taskTimingLabel({ kind: 'instant', at: row.task.snoozedUntil! }, timeZone)}. The deadline remains overdue.</Text>}
    <View style={styles.actions}><Button title={row.task.scheduled ? 'Edit / move task' : 'Schedule task'} onPress={() => onEdit(row.task)}/>
      <Button title="Focus on task" tone="plain" onPress={() => onFocus(row.task)}/>
      {row.plan && <Button title="Open study plan" tone="plain" onPress={() => onPlan(row.plan!.id)}/>}</View>
  </Card>;
  return <Card>
    <View style={styles.heading}><Text style={styles.kicker}>COURSEWORK · {row.item.kind.toUpperCase()}</Text><Text style={row.section === 'attention' ? styles.attention : styles.meta}>{row.item.submissionState === 'missing' ? 'Marked missing' : 'To do'}</Text></View>
    <Text style={styles.item}>{row.item.title}</Text><Text style={styles.meta}>Due: {taskTimingLabel(row.item.due, timeZone)}</Text>
    {row.plan ? <><Text style={styles.meta}>Preparation: {row.plan.title}{row.plan.archivedAt ? ' · archived' : ''}</Text>
      <Button title="Review preparation" onPress={() => onPlan(row.plan!.id)}/></>
      : row.canPrepare ? <><Text style={styles.meta}>Choose a few sessions, review their dates, then save your plan.</Text><Button title="Build preparation plan" onPress={() => onPrepare(row.item)}/></>
        : <><Text style={styles.meta}>Preparation status needs a refresh.</Text><Button title="Check preparation status" tone="plain" onPress={onRefresh}/></>}
  </Card>;
}
function Metric({ value, label }: { value?: number; label: string }) { return <View style={styles.stat}><Text style={styles.number}>{value ?? '—'}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '800' }, section: { color: colors.ink, fontSize: 21, fontWeight: '800' },
  item: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: '700' }, kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: .5 },
  meta: { color: colors.muted, lineHeight: 21 }, attention: { color: colors.coral, lineHeight: 21 },
  summary: { flexDirection: 'row', gap: 8, backgroundColor: colors.sage, padding: 16, borderRadius: 18 }, stat: { flex: 1, gap: 6 },
  number: { color: colors.ink, fontSize: 28, fontWeight: '800' }, metricLabel: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, group: { gap: 12 }, count: { color: colors.moss, fontWeight: '800', padding: 8, backgroundColor: colors.sage, borderRadius: 10 },
  notice: { color: colors.ink, backgroundColor: colors.sage, padding: 12, borderRadius: 12, lineHeight: 21 },
  choice: { minHeight: 46, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.card },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, choiceText: { color: colors.ink, fontWeight: '700' }, selectedText: { color: colors.card },
});
