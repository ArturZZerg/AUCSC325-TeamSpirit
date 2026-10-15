import { useRef, useState, type ComponentProps } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, Screen, State, colors } from '@/components/ui';
import { useAcademic, useAction, useCourses, useTasks, useToday } from '@/features/queries';
import { courseColor } from '@/features/course-editor';
import { checklistProgress } from '@/features/task-checklist';
import { ExamCountdown } from '@/features/exam-countdown';
import { upcomingExams } from '@/features/exams';
import type { PlanItem } from '@/lib/types';
import { DayAgenda } from '@/features/day-agenda';
import { TaskEditor } from '@/features/task-editor';
import type { TaskFormValues } from '@/features/task-form';
import { FocusRecoveryCard } from '@/features/focus-recovery-card';
import { QuickAddBar } from '@/features/quick-add-bar';
import { localDateAt } from '@campusflow/domain';
import { PlanRow, kindColors, type PlanAction, type PlanRowContext } from '@/features/plan-row';
import { greeting, groupPlan, isAccountToday, planProgress, planTimingLabel } from '@/features/today-plan';
import { useSessionStore } from '@/store/session';

type MutationAction = Exclude<PlanAction, 'focus'>;
type IconName = ComponentProps<typeof Ionicons>['name'];
const shortcuts: { label: string; title: string; icon: IconName; path: '/focus' | '/planner' | '/calendar' | '/academics' | '/study-plans' | '/workload' | '/review' }[] = [
  { label: 'Focus space', title: 'Focus', icon: 'timer-outline', path: '/focus' },
  { label: 'Plan your week', title: 'Week', icon: 'albums-outline', path: '/planner' },
  { label: 'Month calendar', title: 'Calendar', icon: 'calendar-outline', path: '/calendar' },
  { label: 'Coursework', title: 'Coursework', icon: 'school-outline', path: '/academics' },
  { label: 'My study plans', title: 'Study plans', icon: 'layers-outline', path: '/study-plans' },
  { label: 'Organise my workload', title: 'Workload', icon: 'file-tray-full-outline', path: '/workload' },
  { label: 'Review your week', title: 'Weekly review', icon: 'stats-chart-outline', path: '/review' },
];

export default function TodayScreen() {
  const selectedDate = useLocalSearchParams<{ date?: string }>().date;
  const query = useToday(selectedDate === undefined ? undefined : String(selectedDate));
  const name = useSessionStore(state => state.session?.user.displayName);
  const date = query.date;
  const isCurrentDay = isAccountToday(date, query.timeZone, Date.now());
  const action = useAction();
  const busy = useRef(false);
  const [pending, setPending] = useState<{ key: string; action: MutationAction }>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const [taskDraft, setTaskDraft] = useState<Partial<TaskFormValues>>();
  const [showDone, setShowDone] = useState(false);

  const run = async (item: PlanItem, selected: PlanAction) => {
    if (selected === 'focus') { router.push({ pathname: '/focus', params: { taskId: item.entityId } }); return; }
    if (busy.current || action.isPending || !item.allowedActions.includes(selected)) return;
    busy.current = true;
    setPending({ key: item.key, action: selected });
    setFailure(undefined);
    try {
      if (selected === 'snooze' && (item.kind === 'personalTask' || item.kind === 'goal')) {
        if (!isAccountToday(date, query.timeZone, Date.now())) throw new Error('Open today’s plan before snoozing.');
        if (item.kind === 'goal' && !item.occurrenceKey) throw new Error('Refresh your plan before changing this goal.');
        await action.mutateAsync({ path: `/${item.kind === 'goal' ? 'goals' : 'tasks'}/${item.entityId}/snooze`, body: {
          until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          ...(item.kind === 'goal' ? { occurrenceKey: item.occurrenceKey } : {}),
        } });
      } else if (item.kind === 'personalTask' && selected !== 'skip') {
        await action.mutateAsync({ path: `/tasks/${item.entityId}/complete`, body: {
          completed: selected === 'complete',
          ...(item.occurrenceKey !== null ? { occurrenceKey: item.occurrenceKey } : {}),
        } });
      } else if (item.kind === 'goal' && selected !== 'uncomplete') {
        // Goal occurrence dates belong to the goal's zone. Never substitute the
        // screen date or invent one when the read model is incomplete.
        if (!item.occurrenceKey) throw new Error('Refresh your plan before changing this goal.');
        await action.mutateAsync({ path: `/goals/${item.entityId}/complete`, body: {
          occurrenceKey: item.occurrenceKey, state: selected === 'skip' ? 'skipped' : 'completed',
        } });
      }
    } catch (error) {
      setFailure({ key: item.key, message: error instanceof Error ? error.message : 'Could not save the change. Please try again.' });
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  };

  const items = query.data?.items ?? [];
  // Course codes/colours and step progress come from the cached lists; Today itself stays a derived read model.
  const tasks = useTasks(), academic = useAcademic(), courses = useCourses();
  const contextFor = (item: PlanItem): PlanRowContext | undefined => {
    if (item.kind === 'personalTask') {
      const task = tasks.data?.find(row => row.id === item.entityId), course = task?.courseId ? courses.data?.find(row => row.id === task.courseId) : undefined;
      if (!task) return undefined;
      return { ...(!task.recurrence ? { steps: checklistProgress(task) } : {}), ...(course ? { course: { label: course.code ?? course.name, color: courseColor(course) } } : {}) };
    }
    if (item.kind !== 'academic') return undefined;
    const course = courses.data?.find(row => row.id === academic.data?.find(entry => entry.id === item.entityId)?.courseId);
    return course ? { course: { label: course.code ?? course.name, color: courseColor(course) } } : undefined;
  };
  const groups = groupPlan(items), progress = planProgress(items);
  const blocked = !!pending || action.isPending;
  const row = (item: PlanItem) => <PlanRow key={item.key} item={item} timeZone={query.timeZone} date={date} isCurrentDay={isCurrentDay}
    disabled={blocked} pendingAction={pending?.key === item.key ? pending.action : undefined}
    error={failure?.key === item.key ? failure.message : undefined} onAction={selected => { void run(item, selected); }} context={contextFor(item)}/>;

  return <Screen safeArea edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}
    aria-hidden={!!taskDraft} accessibilityElementsHidden={!!taskDraft} importantForAccessibility={taskDraft ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}/> }>
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        <Text style={styles.kicker}>{new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        <Text accessibilityRole="header" style={styles.title}>Your daily flow</Text>
        {isCurrentDay && <Text style={styles.greeting}>{greeting(Date.now(), query.timeZone)}{name ? `, ${name.trim().split(/\s+/)[0]}` : ''}.</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Get started" onPress={() => router.push('/get-started')} style={styles.setup} hitSlop={6}>
        <Ionicons name="sparkles-outline" size={16} color={colors.moss}/><Text style={styles.setupText}>Get started</Text>
      </Pressable>
    </View>

    <View style={styles.hero}>
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroValue}>{progress.total ? `${progress.done} of ${progress.total}` : 'Clear'}</Text>
          <Text style={styles.heroLabel}>{!progress.total ? 'Nothing planned yet' : progress.done === progress.total ? 'Everything done. Nice work.' : 'done in this day’s plan'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Review this day" onPress={() => router.push({ pathname: '/day-review', params: { date } })} style={styles.review}>
          <Ionicons name="moon-outline" size={16} color={colors.ink}/><Text style={styles.reviewText}>Review this day</Text>
        </Pressable>
      </View>
      {progress.total > 0 && <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}>
        <View style={[styles.fill, { width: `${Math.round(progress.ratio * 100)}%` }]}/></View>}
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts}>
      {shortcuts.map(item => <Pressable key={item.path} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => router.push(item.path)}
        style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
        <View style={styles.shortcutIcon}><Ionicons name={item.icon} size={22} color={colors.moss}/></View>
        <Text style={styles.shortcutText} numberOfLines={1}>{item.title}</Text>
      </Pressable>)}
    </ScrollView>

    {query.data?.sourceStatus.availability === 'unavailable' && <Text style={styles.offline}>Source refresh is unavailable. These are your last saved items.</Text>}
    <FocusRecoveryCard/>
    <State loading={query.isLoading} error={query.error}/>

    <ExamCountdown exams={isCurrentDay ? upcomingExams(academic.data, courses.data, date, query.timeZone, Date.now()) : []}/>
    <QuickAddBar courses={courses.data} today={localDateAt(new Date(Date.now()).toISOString(), query.timeZone)} planDate={date} timeZone={query.timeZone} disabled={blocked || !!taskDraft}
      onOpenEditor={values => setTaskDraft(values)}/>
    {query.data && !items.length && <Card><Text style={styles.item}>Make room for a good day.</Text>
      <Text style={styles.meta}>Add a task, keep a deadline in sight, or choose one small routine.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/get-started')} style={styles.primary}><Text style={styles.primaryText}>Build my daily plan</Text></Pressable></Card>}
    {groups.open.length > 0 && <Section title="To do" count={groups.open.length}/>}
    {groups.open.map(row)}
    {items.length > 0 && !groups.open.length && <View style={styles.cleared}><Ionicons name="checkmark-done-circle" size={34} color={colors.moss}/>
      <Text style={styles.item}>All clear for this day.</Text><Text style={styles.meta}>Add something new or review how it went.</Text></View>}
    {groups.done.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${showDone ? 'Hide' : 'Show'} ${groups.done.length} done`}
      accessibilityState={{ expanded: showDone }} onPress={() => setShowDone(value => !value)} style={styles.doneToggle}>
      <Text style={styles.section}>Done</Text><Text style={styles.count}>{groups.done.length}</Text>
      <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted}/>
    </Pressable>}
    {showDone && groups.done.map(row)}

    <DayAgenda compact date={date} timeZone={query.timeZone} onPlan={setTaskDraft}/>

    {query.data?.campusEvents.length ? <><Section title="Campus today" count={query.data.campusEvents.length}/>
      {query.data.campusEvents.map(event => <View key={event.id} style={styles.compact}><View style={[styles.stripe, { backgroundColor: kindColors.event }]}/>
        <View style={styles.compactBody}><Text style={styles.item}>{event.title}</Text><Text style={styles.meta}>{event.timing.kind === 'timed' ? new Date(event.timing.startsAt).toLocaleTimeString([], { timeZone: query.timeZone, hour: 'numeric', minute: '2-digit' }) : event.timing.startDate} · {event.location ?? 'Campus'}</Text></View></View>)}
    </> : null}
    {query.data?.upcoming.length ? <><Section title="Coming up" count={query.data.upcoming.length}/>
      {query.data.upcoming.map(item => <View key={item.key} style={styles.compact}><View style={[styles.stripe, { backgroundColor: kindColors[item.kind] }]}/>
        <View style={styles.compactBody}><Text style={styles.item}>{item.title}</Text>
          <Text style={styles.meta}>{planTimingLabel(item, query.timeZone, date) ?? 'No date'}</Text></View></View>)}
    </> : null}
    <View style={styles.spacer}/>
  </ScrollView>
  {!taskDraft && <Pressable testID="today-add-task" accessibilityRole="button" accessibilityLabel="Add a task to this day" accessibilityState={{ disabled: blocked }} disabled={blocked}
    onPress={() => setTaskDraft({ scheduledMode: 'date', scheduledDate: date })} style={({ pressed }) => [styles.fab, pressed && styles.pressed, blocked && styles.dim]}>
    <Ionicons name="add" size={24} color="#fff"/><Text style={styles.fabText}>Add task</Text>
  </Pressable>}
  {taskDraft && <TaskEditor task={null} timeZone={query.timeZone} courses={courses.data} initialValues={taskDraft} onClose={() => setTaskDraft(undefined)}/>}</Screen>;
}

function Section({ title, count }: { title: string; count: number }) {
  return <View style={styles.sectionRow}><Text accessibilityRole="header" style={styles.section}>{title}</Text><Text style={styles.count}>{count}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, headingCopy: { flex: 1, gap: 2 },
  kicker: { color: colors.muted, fontWeight: '700', fontSize: 13, letterSpacing: .3 },
  title: { fontSize: 29, color: colors.ink, fontWeight: '800' }, greeting: { color: colors.muted, fontSize: 16 },
  setup: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 36, borderRadius: 18, backgroundColor: colors.sage, marginTop: 4 },
  setupText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  hero: { backgroundColor: colors.moss, borderRadius: 22, padding: 18, gap: 14 },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, heroCopy: { gap: 2, flexShrink: 1 },
  heroValue: { color: '#fff', fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] }, heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  review: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, minHeight: 40 },
  reviewText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }, fill: { height: 8, borderRadius: 4, backgroundColor: '#fff' },
  shortcuts: { gap: 10, paddingVertical: 2 },
  shortcut: { width: 84, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  shortcutIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  shortcutText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  section: { fontSize: 18, color: colors.ink, fontWeight: '800' },
  count: { color: colors.muted, fontWeight: '700', backgroundColor: colors.sage, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden', fontSize: 12 },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 40 },
  cleared: { alignItems: 'center', gap: 6, padding: 20, borderRadius: 18, backgroundColor: colors.sage },
  compact: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  stripe: { width: 4 }, compactBody: { padding: 12, gap: 3, flex: 1 },
  item: { color: colors.ink, fontSize: 16, fontWeight: '700' }, meta: { color: colors.muted },
  primary: { minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.moss }, primaryText: { color: '#fff', fontWeight: '700' },
  offline: { backgroundColor: colors.warnSurface, color: colors.warnText, padding: 12, borderRadius: 12 },
  fab: { position: 'absolute', right: 18, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.moss, borderRadius: 28, paddingHorizontal: 18, minHeight: 54,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 15 }, pressed: { opacity: 0.75 }, dim: { opacity: 0.5 }, spacer: { height: 72 },
});
