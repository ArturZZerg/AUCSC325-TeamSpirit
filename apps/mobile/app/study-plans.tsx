import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { idSchema, updateStudyPlanSchema, type StudyPlan } from '@campusflow/contracts';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAction, useStudyPlans } from '@/features/queries';
import { filterStudyPlans, sessionNeedsMoving, studyPlanProgress, type StudyPlanView } from '@/features/preparation-progress';
import { useTodayClock } from '@/features/today-clock';
import { useAgendaClock } from '@/features/use-agenda-clock';
import { TaskEditor } from '@/features/task-editor';
import { TaskReminderEditor } from '@/features/task-reminder-editor';
import { taskTimingLabel } from '@/features/task-form';
import { useSessionStore } from '@/store/session';
import type { PersonalTask } from '@/lib/types';

export default function StudyPlansScreen() {
  const session = useSessionStore(state => state.session);
  return <StudyPlansContent key={JSON.stringify([session?.user.id, session?.accessToken])}/>;
}
function StudyPlansContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ planId?: string | string[] }>();
  const parsedTarget = idSchema.safeParse(params.planId);
  const [dismissedTarget, setDismissedTarget] = useState<string>();
  const target = parsedTarget.success && parsedTarget.data !== dismissedTarget ? parsedTarget.data : undefined;
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date } = useTodayClock(timeZone); const now = useAgendaClock(date, timeZone);
  const plans = useStudyPlans(), action = useAction();
  const [search, setSearch] = useState(''), [view, setView] = useState<StudyPlanView>('active');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editing, setEditing] = useState<PersonalTask>(), [reminding, setReminding] = useState<PersonalTask>();
  const [renaming, setRenaming] = useState<StudyPlan>(), [name, setName] = useState('');
  const [pending, setPending] = useState<string>(), [error, setError] = useState<string>();
  const busy = useRef(false);
  const disabled = !!pending || action.isPending;
  const modalOpen = !!editing || !!reminding || !!renaming;
  const visible = target ? (plans.data ?? []).filter(plan => plan.id === target)
    : filterStudyPlans(plans.data ?? [], search, view, timeZone, now);
  const leaveTarget = () => setDismissedTarget(parsedTarget.success ? parsedTarget.data : undefined);
  const browse = () => { leaveTarget(); setSearch(''); setView('active'); };
  const active = (plans.data ?? []).filter(plan => !plan.archivedAt && !studyPlanProgress(plan, timeZone, now).finished);
  const openCount = active.reduce((sum, plan) => sum + studyPlanProgress(plan, timeZone, now).open.length, 0);
  const earlierCount = active.reduce((sum, plan) => sum + studyPlanProgress(plan, timeZone, now).needsMoving.length, 0);
  const run = async (key: string, request: { path: string; method?: string; body?: unknown }) => {
    if (busy.current || disabled) return false;
    busy.current = true; setPending(key); setError(undefined);
    try { await action.mutateAsync(request); return true; }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the change. Try again.'); return false; }
    finally { busy.current = false; setPending(undefined); }
  };
  const rename = async () => {
    if (!renaming || busy.current) return;
    const valid = updateStudyPlanSchema.safeParse({ title: name });
    if (!valid.success) { setError('Give your plan a name of 1–240 characters.'); return; }
    if (await run(`plan:${renaming.id}`, { path: `/study-plans/${renaming.id}`, method: 'PATCH', body: valid.data })) setRenaming(undefined);
  };
  const focus = (task: PersonalTask) => router.push({ pathname: '/focus', params: { taskId: task.id } });
  const refresh = () => { void plans.refetch(); };
  return <Screen><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    aria-hidden={modalOpen} accessibilityElementsHidden={modalOpen} importantForAccessibility={modalOpen ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={plans.isRefetching} onRefresh={refresh}/>}>
    <View style={styles.heading}><Button title="Back to Today" tone="plain" disabled={disabled} onPress={() => router.replace('/today')}/><Text style={styles.kicker}>MY STUDY PLANS</Text></View>
    <Text style={styles.title}>Make steady progress.</Text><Text style={styles.meta}>Your preparation, one session at a time.</Text>
    {plans.data && <View style={styles.summary}><Metric value={active.length} label="active plans"/><Metric value={openCount} label="sessions left"/><Metric value={earlierCount} label="to revisit"/></View>}
    <Button title="Plan from coursework" tone="plain" disabled={disabled} onPress={() => router.push('/academics')}/>
    <Button title="My study report" tone="plain" disabled={disabled} onPress={() => router.push('/study-report')}/>
    <State loading={plans.isLoading} error={plans.error}/>
    {plans.data && (plans.isCached || plans.error) && <Text style={styles.notice}>Showing saved plans. Refresh to check changes made elsewhere.</Text>}
    {!plans.data && !plans.isLoading && <Card><Text style={styles.section}>Study plans are unavailable.</Text><Text style={styles.meta}>Connect and refresh to load your plans. An unavailable read does not mean you have no plans.</Text><Button title="Retry study plans" onPress={refresh}/></Card>}
    {target && <Card><Text style={styles.item}>Your selected preparation plan</Text><Text style={styles.meta}>{visible.length ? 'The linked plan and its sessions are shown below.' : 'This plan is not in the available information. Refresh to check it, or browse your plans.'}</Text>
      <Button title="Browse all study plans" tone="plain" onPress={browse}/>{!visible.length && <Button title="Refresh selected plan" onPress={refresh}/>}</Card>}
    {params.planId !== undefined && !parsedTarget.success && <Text style={styles.notice}>This plan link is invalid. Choose a plan below.</Text>}
    <Field label="Search study plans" value={search} onChangeText={value => { leaveTarget(); setSearch(value); }} placeholder="Plan, coursework or session" autoCorrect={false}/>
    <View style={styles.choices}>{(['active', 'finished', 'archived'] as const).map(value => <Choice key={value} label={value === 'active' ? 'Active' : value === 'finished' ? 'Finished' : 'Archived'} selected={!target && view === value} onPress={() => { leaveTarget(); setView(value); }}/>)}</View>
    {view === 'archived' && <Text style={styles.meta}>Archived plans keep their tasks and reminders in your daily plan.</Text>}
    {error && !renaming && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {plans.data && !target && !visible.length && <Card><Text style={styles.section}>{!plans.data.length ? 'Give your next deadline a plan.' : 'No plans in this view.'}</Text>
      <Text style={styles.meta}>{!plans.data.length ? 'Open coursework and build a few manageable study sessions.' : 'Try another view or clear your search.'}</Text>
      {!!plans.data.length && <Button title="Reset plan filters" tone="plain" onPress={() => { setSearch(''); setView('active'); }}/>}</Card>}
    {visible.map(plan => {
      const progress = studyPlanProgress(plan, timeZone, now), showing = expanded.includes(plan.id) || target === plan.id;
      return <Card key={plan.id}>
        <View style={styles.heading}><Text style={styles.kicker}>{plan.archivedAt ? 'ARCHIVED PLAN' : progress.finished ? 'PREPARATION FINISHED' : 'YOUR NEXT STEPS'}</Text><Text style={styles.meta}>{progress.completed}/{progress.total} sessions</Text></View>
        <Text style={styles.planTitle}>{plan.title}</Text>
        <Text style={styles.meta}>{plan.academicItem ? 'Coursework deadline' : 'Deadline when planned'}: {taskTimingLabel(progress.deadline, timeZone)}</Text>
        {!plan.academicItem && <Text style={styles.meta}>The original coursework is no longer available. Your preparation is saved.</Text>}
        {progress.deadlineChanged && <Text style={styles.notice}>The coursework deadline changed. Your session dates stay as you chose them; review your plan.</Text>}
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`${plan.title} preparation progress`} accessibilityValue={{ min: 0, max: 100, now: progress.percentage }}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage} style={styles.track}><View style={[styles.fill, { width: `${progress.percentage}%` }]}/></View>
        <Text style={styles.meta}>{progress.total ? `${progress.completed} of ${progress.total} sessions completed` : 'No sessions remain in this group.'}
          {progress.open.length ? ` · ${progress.remainingMinutes} min estimated left${progress.unestimated ? ` + ${progress.unestimated} without an estimate` : ''}` : ''}</Text>
        {progress.needsMoving.length > 0 && <Text style={styles.attention}>{progress.needsMoving.length} {progress.needsMoving.length === 1 ? 'session was' : 'sessions were'} scheduled earlier. Edit a session to give it a new date.</Text>}
        {progress.next && !plan.archivedAt && <View style={styles.next}>
          <Text style={styles.kicker}>NEXT SESSION</Text><Text style={styles.item}>{progress.next.title}</Text>
          <Text style={styles.meta}>{taskTimingLabel(progress.next.scheduled, timeZone)}</Text>
          <Button title="Focus next session" disabled={disabled} onPress={() => focus(progress.next!)}/>
        </View>}
        <View style={styles.choices}>
          <Button title={showing ? 'Hide sessions' : 'Show sessions'} tone="plain" disabled={disabled} onPress={() => {
            if (target === plan.id) { browse(); setView(plan.archivedAt ? 'archived' : progress.finished ? 'finished' : 'active'); }
            setExpanded(values => showing ? values.filter(id => id !== plan.id) : [...values, plan.id]);
          }}/>
          <Button title="Rename plan" tone="plain" disabled={disabled} onPress={() => { setName(plan.title); setError(undefined); setRenaming(plan); }}/>
          <Button title={plan.archivedAt ? 'Restore plan' : 'Archive plan'} tone="plain" disabled={disabled} onPress={() => {
            void run(`plan:${plan.id}`, { path: `/study-plans/${plan.id}`, method: 'PATCH', body: { archived: !plan.archivedAt } });
          }}/>
        </View>
        {!plan.archivedAt && <Text style={styles.meta}>Archiving hides this plan from Active. Your tasks and reminders stay saved.</Text>}
        {showing && <View style={styles.sessions}>{plan.tasks.map((task, index) => <View key={task.id} style={styles.session}>
          <View style={styles.heading}><Text style={styles.kicker}>SESSION {index + 1}</Text><Text style={sessionNeedsMoving(task, date, now) ? styles.attention : styles.meta}>{task.completedAt ? 'Completed' : sessionNeedsMoving(task, date, now) ? 'Scheduled earlier' : 'To do'}</Text></View>
          <Text style={[styles.item, task.completedAt && styles.done]}>{task.title}</Text><Text style={styles.meta}>{taskTimingLabel(task.scheduled, timeZone)} · {task.estimatedMinutes === null ? 'No estimate' : `${task.estimatedMinutes} min`}</Text>
          {task.reminder && <Text style={styles.meta}>Reminder: {taskTimingLabel(task.reminder, timeZone)}</Text>}
          <View style={styles.choices}>
            <Button title={pending === `task:${task.id}` ? 'Saving…' : task.completedAt ? 'Undo completion' : 'Complete session'} disabled={disabled} tone="plain" onPress={() => {
              void run(`task:${task.id}`, { path: `/tasks/${task.id}/complete`, body: { completed: !task.completedAt } });
            }}/>
            {!task.completedAt && <Button title="Focus" tone="plain" disabled={disabled} onPress={() => focus(task)}/>}
            <Button title="Edit session" tone="plain" disabled={disabled} onPress={() => setEditing(task)}/>
            <Button title="Reminder" tone="plain" disabled={disabled} onPress={() => setReminding(task)}/>
          </View>
        </View>)}</View>}
        {progress.finished && <Text style={styles.notice}>Your preparation sessions are complete. Check your coursework separately for submission.</Text>}
      </Card>;
    })}
    <Text style={styles.meta}>Minutes are your task estimates, not recorded focus time. Complete a session when that step is done.</Text>
  </ScrollView>
    {editing && <TaskEditor key={editing.id} task={editing} timeZone={timeZone} onClose={() => setEditing(undefined)}/>}
    {reminding && <TaskReminderEditor key={reminding.id} task={reminding} timeZone={timeZone} onClose={() => setReminding(undefined)}/>}
    {renaming && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy.current) setRenaming(undefined); }}>
      <SafeAreaView style={styles.overlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.rename}>
        <Card><Text style={styles.section}>Rename your plan</Text><Field label="Plan name" value={name} onChangeText={setName} editable={!disabled}/>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Button title={disabled ? 'Saving…' : 'Save plan name'} disabled={disabled} onPress={() => { void rename(); }}/>
          <Button title="Cancel" tone="plain" disabled={disabled} onPress={() => setRenaming(undefined)}/>
        </Card>
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>}
  </Screen>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} aria-checked={selected} onPress={onPress} style={[styles.choice, selected && styles.selected]}><Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.stat}><Text style={styles.number}>{value}</Text><Text style={styles.meta}>{label}</Text></View>; }
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kicker: { color: colors.moss, fontWeight: '800', fontSize: 11, letterSpacing: .5 }, title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  planTitle: { color: colors.ink, fontSize: 21, lineHeight: 27, fontWeight: '800' }, section: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  item: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' }, done: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { color: colors.muted, lineHeight: 21 }, summary: { flexDirection: 'row', gap: 12, backgroundColor: colors.sage, padding: 16, borderRadius: 18 }, stat: { flex: 1, gap: 4 }, number: { fontSize: 28, color: colors.ink, fontWeight: '800' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 46, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.card },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, choiceText: { color: colors.ink, fontWeight: '600' }, selectedText: { color: colors.card },
  track: { height: 8, backgroundColor: colors.sage, borderRadius: 4, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.moss },
  next: { padding: 14, backgroundColor: colors.sage, borderRadius: 12, gap: 8 }, sessions: { gap: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.line }, session: { gap: 10 },
  notice: { color: colors.ink, backgroundColor: colors.sage, padding: 12, borderRadius: 12, lineHeight: 21 }, attention: { color: colors.coral, lineHeight: 21 }, error: { color: colors.coral },
  overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,.25)' }, rename: { width: '100%', maxWidth: 600, alignSelf: 'center' },
});
