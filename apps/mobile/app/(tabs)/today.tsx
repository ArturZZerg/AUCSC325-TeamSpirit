import { useRef, useState, type ComponentProps } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, Screen, State, colors, design, typography } from '@/components/ui';
import { useAcademic, useAction, useCourses, useTasks, useToday } from '@/features/queries';
import { courseColor } from '@/features/course-editor';
import { TaskChecklist, checklistProgress } from '@/features/task-checklist';
import { ExamCountdown } from '@/features/exam-countdown';
import { upcomingExams } from '@/features/exams';
import { upNext } from '@/features/up-next';
import { UpNextCard } from '@/features/up-next-card';
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
import { courseLabel } from '@/features/course-label';
import { TodayWeekStrip } from '@/features/today-week-strip';
import { MotionPressable } from '@/components/motion';
import { FlowProgress } from '@/features/flow-progress';

type MutationAction = Exclude<PlanAction, 'focus'>;
type IconName = ComponentProps<typeof Ionicons>['name'];
// Four shortcuts fit one row on a phone. Study plans, workload and weekly review stay one tap away in Coursework and Week.
const shortcuts: { label: string; title: string; icon: IconName; path: '/focus' | '/planner' | '/calendar' | '/academics' }[] = [
  { label: 'Focus space', title: 'Focus', icon: 'timer-outline', path: '/focus' },
  { label: 'Plan your week', title: 'Week', icon: 'albums-outline', path: '/planner' },
  { label: 'Month calendar', title: 'Calendar', icon: 'calendar-outline', path: '/calendar' },
  { label: 'Coursework', title: 'Coursework', icon: 'school-outline', path: '/academics' },
];

export default function TodayScreen() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 1180;
  const compact = width < 600;
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
  const [filter, setFilter] = useState<PlanItem['kind'] | 'all'>('all');
  const localPreview = __DEV__ && process.env.EXPO_PUBLIC_LOCAL_PREVIEW === '1';

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
  const exams = isCurrentDay ? upcomingExams(academic.data, courses.data, date, query.timeZone, Date.now()) : [];
  const contextFor = (item: PlanItem): PlanRowContext | undefined => {
    if (item.kind === 'personalTask') {
      const task = tasks.data?.find(row => row.id === item.entityId), course = task?.courseId ? courses.data?.find(row => row.id === task.courseId) : undefined;
      if (!task) return undefined;
      return { ...(!task.recurrence ? { steps: checklistProgress(task) } : {}), ...(course ? { course: { label: courseLabel(course), color: courseColor(course) } } : {}) };
    }
    if (item.kind !== 'academic') return undefined;
    const course = courses.data?.find(row => row.id === academic.data?.find(entry => entry.id === item.entityId)?.courseId);
    return course ? { course: { label: courseLabel(course), color: courseColor(course) } } : undefined;
  };
  const groups = groupPlan(items), progress = planProgress(items);
  const next = query.data?.upcoming[0], nextTiming = next ? planTimingLabel(next, query.timeZone, date) : undefined;
  const nextDue = next ? `${next.title}${nextTiming ? ` · ${nextTiming.replace(/^Due /, '')}` : ''}` : undefined;
  const setupDone = (academic.data?.some(entry => !(entry.source ?? '').includes('fixture')) ?? false) || (tasks.data?.length ?? 0) > 0;
  const blocked = !!pending || action.isPending;
  const row = (item: PlanItem) => {
    const task = item.kind === 'personalTask' ? tasks.data?.find(task => task.id === item.entityId) : undefined;
    return <PlanRow key={item.key} item={item} timeZone={query.timeZone} date={date} isCurrentDay={isCurrentDay}
    disabled={blocked} pendingAction={pending?.key === item.key ? pending.action : undefined}
    error={failure?.key === item.key ? failure.message : undefined} onAction={selected => { void run(item, selected); }} context={contextFor(item)}>
      {task && !task.recurrence && !task.completedAt && item.occurrenceKey === null
        && item.allowedActions.includes('complete') && !!task.checklist?.length
        && <View style={styles.checklist}><TaskChecklist task={task} disabled={blocked}/></View>}
    </PlanRow>;
  };

  const today = localDateAt(new Date(Date.now()).toISOString(), query.timeZone);
  const filters = [
    { key: 'all', label: 'All' }, { key: 'academic', label: 'Coursework' },
    { key: 'personalTask', label: 'Personal' }, { key: 'goal', label: 'Routines' }, { key: 'event', label: 'Events' },
  ] as const;
  const visible = filter === 'all' ? groups.open : groups.open.filter(item => item.kind === filter);
  const addTask = () => setTaskDraft({ scheduledMode: 'date', scheduledDate: date });

  const heroActions = (<View style={styles.heroActions}>
                <MotionPressable accessibilityRole="button" accessibilityLabel="Start a focus session" onPress={() => router.push('/focus')}
                  style={({ hovered }) => [styles.heroCta, hovered && styles.signalHover]}>
                  <Ionicons name="play" size={13} color={design.signalInk}/><Text style={styles.heroCtaText}>Start focus</Text><Ionicons name="arrow-up-outline" size={15} color={design.signalInk} style={styles.ctaArrow}/>
                </MotionPressable>
                <MotionPressable accessibilityRole="button" accessibilityLabel="Review this day" onPress={() => router.push({ pathname: '/day-review', params: { date } })}
                  style={({ hovered }) => [styles.review, hovered && styles.reviewHover]}>
                  <Text style={styles.reviewText}>Review this day</Text>
                </MotionPressable>
              </View>);

  return <Screen safeArea edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide, compact && styles.contentCompact]}
    aria-hidden={!!taskDraft} accessibilityElementsHidden={!!taskDraft} importantForAccessibility={taskDraft ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}/> }>
    {(!compact || localPreview) && <View style={styles.topline}>
      {!compact && <View style={styles.breadcrumb}><Ionicons name="grid-outline" size={14} color={colors.muted}/><Text style={styles.breadcrumbText}>My workspace</Text><Text style={styles.breadcrumbSlash}>/</Text><Text style={styles.breadcrumbCurrent}>Overview</Text></View>}
      {localPreview && <View style={styles.previewBadge}><View style={styles.previewDot}/><Text style={styles.previewText}>Local preview · sample data</Text></View>}
    </View>}
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        <Text style={styles.kicker}>{new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        <Text accessibilityRole="header" style={[styles.title, wide && styles.titleWide]}>Your daily flow<Text style={styles.titleDot}>.</Text></Text>
        <Text style={styles.greeting}>{isCurrentDay ? `${greeting(Date.now(), query.timeZone)}${name ? `, ${name.trim().split(/\s+/)[0]}` : ''}. ` : ''}A little focus. A little balance. All in one place.</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push('/search')} style={styles.searchButton}>
          <Ionicons name="search-outline" size={20} color={colors.ink}/></Pressable>
        {wide && <Pressable accessibilityRole="button" accessibilityLabel="Reminders" onPress={() => router.push('/reminders')} style={styles.searchButton}>
          <Ionicons name="notifications-outline" size={20} color={colors.ink}/></Pressable>}
        {!setupDone && <Pressable accessibilityRole="button" accessibilityLabel="Get started" onPress={() => router.push('/get-started')} style={styles.setup}>
          <Ionicons name="sparkles-outline" size={16} color={colors.moss}/><Text style={styles.setupText}>Get started</Text></Pressable>}
      </View>
    </View>

    {query.data?.sourceStatus.availability === 'unavailable' && <Text style={styles.offline}>Source refresh is unavailable. These are your last saved items.</Text>}
    <FocusRecoveryCard/>
    <State loading={query.isLoading} error={query.error}/>

    <View style={[styles.columns, wide && styles.columnsWide]}>
      <View style={styles.mainColumn}>
        <View style={[styles.hero, compact && styles.heroCompact]}>
          <View pointerEvents="none" style={styles.heroOrbit}/><View pointerEvents="none" style={styles.heroOrbitSmall}/>
          <View pointerEvents="none" style={styles.heroSignal}/>
          <View style={styles.heroRow}>
            <View style={styles.heroCopy}>
              <View style={styles.heroEyebrow}><View style={styles.heroStatusDot}/><Text style={styles.heroKicker}>Your day, in motion</Text></View>
              <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>{progress.total && progress.done === progress.total ? 'Look at you go.' : 'Small steps. Real progress.'}</Text>
              <Text style={styles.heroLabel}>{!progress.total ? nextDue ? `Next due: ${nextDue}` : 'Nothing planned yet' : progress.done === progress.total ? 'Everything done. Nice work.' : 'You don’t have to do it all at once. Just the next thing.'}</Text>
              {!compact && heroActions}
            </View>
            <FlowProgress done={progress.done} total={progress.total}/>
          </View>
          {compact && heroActions}

        </View>

        <View style={styles.shortcuts}>
          {shortcuts.map(item => <MotionPressable key={item.path} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => router.push(item.path)}
            style={({ hovered }) => [styles.shortcut, hovered && styles.shortcutHover]}>
            <View style={styles.shortcutIcon}><Ionicons name={item.icon} size={20} color={colors.moss}/></View>
            <Text style={styles.shortcutText} numberOfLines={1}>{item.title}</Text>
            {wide && <Ionicons name="arrow-up-outline" size={14} color={colors.muted} style={styles.shortcutArrow}/>}
          </MotionPressable>)}
        </View>

        <View style={styles.planCard}>
          <View style={styles.planHeading}><View style={styles.planHeadingText}><Text accessibilityRole="header" style={styles.section}>To do</Text><Text style={styles.count}>{groups.open.length} to do</Text></View>
            {!taskDraft && <MotionPressable testID="today-add-task" accessibilityRole="button" accessibilityLabel="Add a task to this day" accessibilityState={{ disabled: blocked }} disabled={blocked}
              onPress={addTask} style={({ hovered }) => [styles.addTask, hovered && styles.signalHover, blocked && styles.dim]}>
              <View style={styles.addTaskIcon}><Ionicons name="add" size={17} color={design.signal}/></View><Text style={styles.addTaskText}>Add task</Text><Ionicons name="arrow-up-outline" size={15} color={design.signalInk} style={styles.ctaArrow}/>
            </MotionPressable>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {filters.map(item => <MotionPressable key={item.key} accessibilityRole="tab" accessibilityLabel={`Filter ${item.label.toLowerCase()}`} accessibilityState={{ selected: filter === item.key }}
              onPress={() => setFilter(item.key)} lift={0} style={({ hovered }) => [styles.filter, hovered && styles.filterHover, filter === item.key && styles.filterSelected]}>
              <Text style={[styles.filterText, filter === item.key && styles.filterTextSelected]}>{item.label}</Text>
            </MotionPressable>)}
          </ScrollView>
          <QuickAddBar courses={courses.data} today={today} planDate={date} timeZone={query.timeZone} disabled={blocked || !!taskDraft} onOpenEditor={values => setTaskDraft(values)}/>
          {query.data && !items.length && <View style={styles.empty}><Ionicons name="leaf-outline" size={32} color={colors.moss}/><Text style={styles.item}>Make room for a good day.</Text>
            <Text style={styles.meta}>Add a task, keep a deadline in sight, or choose one small routine.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/get-started')} style={styles.primary}><Text style={styles.primaryText}>Build my daily plan</Text></Pressable></View>}
          {visible.map(row)}
          {groups.open.length > 0 && !visible.length && <View style={styles.empty}><Ionicons name="checkmark-circle-outline" size={28} color={colors.moss}/><Text style={styles.meta}>Nothing to do in this category. A little breathing room.</Text></View>}
          {items.length > 0 && !groups.open.length && <View style={styles.cleared}><Ionicons name="checkmark-done-circle" size={34} color={colors.moss}/>
            <Text style={styles.item}>All clear for this day.</Text><Text style={styles.meta}>Add something new or review how it went.</Text></View>}
          {groups.done.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${showDone ? 'Hide' : 'Show'} ${groups.done.length} done`}
            accessibilityState={{ expanded: showDone }} onPress={() => setShowDone(value => !value)} style={styles.doneToggle}>
            <Ionicons name="checkmark-done-outline" size={17} color={colors.moss}/><Text style={styles.doneText}>Done</Text><Text style={styles.count}>{groups.done.length}</Text>
            <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted}/>
          </Pressable>}
          {showDone && groups.done.map(row)}
        </View>
        <ExamCountdown exams={exams}/>
        <View style={styles.footerNote}><Ionicons name="leaf-outline" size={14} color={colors.muted}/><Text style={styles.footerText}>A productive day has room for you, too.</Text></View>
      </View>

      <View style={[styles.sideColumn, wide && styles.sideColumnWide]}>
        <TodayWeekStrip date={date} today={today}/>
        <UpNextCard next={isCurrentDay ? upNext(items, exams, date, query.timeZone, Date.now()) : undefined}/>
        <DayAgenda compact date={date} timeZone={query.timeZone} onPlan={setTaskDraft}/>
        {query.data?.upcoming.length ? <Card><Section title="Coming up" count={query.data.upcoming.length}/>
          {query.data.upcoming.slice(0, 4).map(item => <View key={item.key} style={styles.compact}>
            <View style={[styles.upcomingIcon, { backgroundColor: `${kindColors[item.kind]}12` }]}><Ionicons name={item.kind === 'academic' ? 'school-outline' : 'checkbox-outline'} size={17} color={kindColors[item.kind]}/></View>
            <View style={styles.compactBody}><Text style={styles.upcomingTitle}>{item.title}</Text><Text style={styles.compactMeta}>{[contextFor(item)?.course?.label, planTimingLabel(item, query.timeZone, date) ?? 'No date'].filter(Boolean).join(' · ')}</Text></View>
          </View>)}
          <Pressable accessibilityRole="button" accessibilityLabel="View all upcoming deadlines" onPress={() => router.push('/calendar')} style={styles.textLink}><Text style={styles.textLinkText}>View calendar</Text><Ionicons name="arrow-forward" size={14} color={colors.moss}/></Pressable>
        </Card> : null}
        {query.data?.campusEvents.length ? <Card><Section title="Around campus" count={query.data.campusEvents.length}/>
          {query.data.campusEvents.slice(0, 3).map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`Explore ${event.title}`} onPress={() => router.push('/campus')} style={({ pressed }) => [styles.campusEvent, pressed && styles.pressed]}>
            <View style={styles.campusIcon}><Ionicons name="people-outline" size={21} color={colors.coral}/></View>
            <View style={styles.compactBody}><Text style={styles.upcomingTitle}>{event.title}</Text><Text style={styles.compactMeta}>{[event.timing.kind === 'timed' ? new Date(event.timing.startsAt).toLocaleTimeString([], { timeZone: query.timeZone, hour: 'numeric', minute: '2-digit' }) : 'All day', event.location].filter(Boolean).join(' · ')}</Text></View>
          </Pressable>)}
        </Card> : null}
      </View>
    </View>
  </ScrollView>
  {taskDraft && <TaskEditor task={null} timeZone={query.timeZone} courses={courses.data} initialValues={taskDraft} onClose={() => setTaskDraft(undefined)}/>}</Screen>;
}

function Section({ title, count }: { title: string; count: number }) {
  return <View style={styles.sectionRow}><Text accessibilityRole="header" style={styles.section}>{title}</Text><Text style={styles.count}>{count}</Text></View>;
}

const styles = StyleSheet.create({
  checklist: { paddingLeft: 42 },
  content: { padding: 20, paddingTop: 22, gap: 26, width: '100%', maxWidth: 1440, alignSelf: 'center', paddingBottom: 48 },
  contentWide: { paddingHorizontal: 40, paddingTop: 28 }, contentCompact: { gap: 20 },
  topline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  breadcrumb: { flexDirection: 'row', gap: 10, alignItems: 'center' }, breadcrumbText: { ...typography, color: colors.muted, fontSize: 12 },
  breadcrumbSlash: { color: colors.faint, fontSize: 14 }, breadcrumbCurrent: { ...typography, color: colors.ink, fontSize: 12, fontWeight: '500' },
  previewBadge: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.sage },
  previewDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.moss }, previewText: { ...typography, color: colors.moss, fontSize: 10, fontWeight: '500' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, headingCopy: { flex: 1, gap: 7 },
  kicker: { ...typography, color: colors.muted, fontSize: 12, letterSpacing: .2 },
  title: { ...typography, fontSize: 32, letterSpacing: -1.3, color: colors.ink, fontWeight: '600' }, titleWide: { fontSize: 40 }, titleDot: { color: colors.moss },
  greeting: { ...typography, color: colors.muted, fontSize: 13, lineHeight: 21, maxWidth: 460 },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
  setup: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 46, borderRadius: 12, backgroundColor: colors.sage },
  setupText: { ...typography, color: colors.ink, fontWeight: '600', fontSize: 12 },
  searchButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  columns: { gap: 24 }, columnsWide: { flexDirection: 'row', alignItems: 'flex-start' }, mainColumn: { flex: 1, minWidth: 0, gap: 22 },
  sideColumn: { gap: 20 }, sideColumnWide: { width: 324 },
  hero: { backgroundColor: design.hero, borderRadius: 22, padding: 26, gap: 18, overflow: 'hidden' },
  heroCompact: { padding: 20 }, heroTitleCompact: { fontSize: 23, lineHeight: 30 },
  heroSignal: { position: 'absolute', width: 180, height: 2, right: 0, top: 0, backgroundColor: design.signal, opacity: .8 },
  heroStatusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: design.signal },
  heroOrbit: { position: 'absolute', height: 330, width: 330, borderRadius: 165, borderWidth: 1, borderColor: 'rgba(203,245,154,.10)', right: -90, top: -105 },
  heroOrbitSmall: { position: 'absolute', height: 260, width: 260, borderRadius: 130, borderWidth: 1, borderColor: 'rgba(203,245,154,.10)', right: -54, top: -70 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }, heroCopy: { gap: 8, flex: 1 },
  heroEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, heroKicker: { ...typography, color: design.heroMuted, fontSize: 11, fontWeight: '500' },
  heroTitle: { ...typography, color: design.heroText, fontSize: 27, fontWeight: '500', lineHeight: 34, letterSpacing: -.7, maxWidth: 420 },
  heroLabel: { ...typography, color: design.heroMuted, fontSize: 12, lineHeight: 20, maxWidth: 380 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 9 },
  heroCta: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 15, borderRadius: 10, backgroundColor: design.signal },
  heroCtaText: { ...typography, fontSize: 12, fontWeight: '700', color: design.signalInk },
  ctaArrow: { transform: [{ rotate: '45deg' }] }, signalHover: { backgroundColor: '#DAFFB0', shadowColor: design.signal, shadowRadius: 12, shadowOpacity: .22, shadowOffset: { width: 0, height: 3 } },
  reviewHover: { backgroundColor: 'rgba(255,255,255,.07)' },
  review: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 9, minHeight: 46, paddingHorizontal: 11, borderRadius: 9 },
  reviewText: { ...typography, color: design.heroMuted, fontWeight: '500', fontSize: 12 },
  shortcuts: { flexDirection: 'row', gap: 8 },
  shortcut: { flex: 1, minWidth: 0, alignItems: 'center', gap: 9, paddingVertical: 15, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  shortcutIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  shortcutHover: { borderColor: colors.moss, backgroundColor: colors.sage },
  shortcutText: { ...typography, color: colors.ink, fontSize: 11, fontWeight: '500' }, shortcutArrow: { position: 'absolute', right: 10, top: 11, transform: [{ rotate: '45deg' }] },
  planCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, gap: 12 },
  planHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 },
  planHeadingText: { flexDirection: 'row', alignItems: 'center', gap: 9 }, section: { ...typography, fontSize: 18, letterSpacing: -.4, color: colors.ink, fontWeight: '600' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  count: { ...typography, color: colors.muted, fontSize: 10, backgroundColor: colors.canvas, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden' },
  addTask: { minHeight: 48, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: design.signal, borderWidth: 1, borderColor: '#B9DC8F' },
  addTaskIcon: { width: 25, height: 25, borderRadius: 7, backgroundColor: design.signalInk, alignItems: 'center', justifyContent: 'center' },
  addTaskText: { ...typography, color: design.signalInk, fontWeight: '700', fontSize: 12 },
  filters: { flexDirection: 'row', gap: 3, paddingBottom: 4 }, filter: { paddingHorizontal: 12, minHeight: 46, borderRadius: 9, justifyContent: 'center' },
  filterHover: { backgroundColor: colors.canvas },
  filterSelected: { backgroundColor: colors.sage }, filterText: { ...typography, color: colors.muted, fontSize: 12, fontWeight: '500' }, filterTextSelected: { color: colors.moss, fontWeight: '600' },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, marginTop: 4, minHeight: 46 },
  doneText: { ...typography, color: colors.muted, fontSize: 12, flex: 1 }, cleared: { alignItems: 'center', gap: 8, padding: 20, borderRadius: 14, backgroundColor: colors.sage },
  empty: { padding: 20, alignItems: 'center', gap: 12 },
  compact: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  upcomingIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, compactBody: { gap: 5, flex: 1 },
  upcomingTitle: { ...typography, color: colors.ink, fontSize: 13, lineHeight: 19, fontWeight: '500' }, compactMeta: { ...typography, color: colors.muted, fontSize: 11, lineHeight: 17 },
  item: { ...typography, color: colors.ink, fontSize: 16, fontWeight: '600' }, meta: { ...typography, color: colors.muted, fontSize: 13, lineHeight: 20 },
  primary: { minHeight: 46, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.moss }, primaryText: { ...typography, color: colors.onAccent, fontWeight: '600' },
  offline: { backgroundColor: colors.warnSurface, color: colors.warnText, padding: 12, borderRadius: 12 },
  campusEvent: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, campusIcon: { width: 42, height: 46, borderRadius: 12, backgroundColor: colors.streakSurface, alignItems: 'center', justifyContent: 'center' },
  textLink: { flexDirection: 'row', gap: 7, alignItems: 'center', minHeight: 46 }, textLinkText: { ...typography, color: colors.moss, fontSize: 12, fontWeight: '500' },
  footerNote: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingTop: 3 }, footerText: { ...typography, color: colors.muted, fontSize: 11 },
  pressed: { opacity: .7 }, dim: { opacity: .5 },
});
