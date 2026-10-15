import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { taskOccursOn } from '@campusflow/domain';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAcademic, useAction, useCourses, useTasks } from '@/features/queries';
import { courseColor } from '@/features/course-editor';
import { TaskEditor } from '@/features/task-editor';
import { filterPersonalTasks, useTaskFilters } from '@/features/task-filters';
import { TaskFilterControls } from '@/features/task-filter-controls';
import { TaskReminderEditor } from '@/features/task-reminder-editor';
import { Chip, TaskRow, type TaskRowAction } from '@/features/task-row';
import { groupTasks, taskSummary } from '@/features/task-groups';
import { planTimingLabel } from '@/features/today-plan';
import type { PersonalTask } from '@/lib/types';
import { useTodayClock } from '@/features/today-clock';
import { useSessionStore } from '@/store/session';

export default function Tasks() {
  const tasks = useTasks();
  const academic = useAcademic();
  const courses = useCourses();
  const action = useAction();
  const session = useSessionStore(state => state.session);
  const timeZone = session?.user.timeZone ?? 'UTC';
  const { date: today } = useTodayClock(timeZone);
  const { filters, update: updateFilters, reset: resetFilters } = useTaskFilters(session?.user.id);
  const visibleTasks = tasks.data ? filterPersonalTasks(tasks.data, filters) : undefined;
  const busy = useRef(false);
  const [pending, setPending] = useState<string>();
  const disabled = !!pending || action.isPending;
  const [editing, setEditing] = useState<PersonalTask | null>();
  const [reminding, setReminding] = useState<PersonalTask>();
  const [deleting, setDeleting] = useState<PersonalTask>();
  const [expanded, setExpanded] = useState<string>();
  const [message, setMessage] = useState<string>();
  const now = Date.now();
  const run = async (request: Parameters<typeof action.mutateAsync>[0]) => {
    if (busy.current || action.isPending) return false;
    busy.current = true;
    setPending(request.path);
    setMessage(undefined);
    try { await action.mutateAsync(request); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the change. Please try again.'); return false; }
    finally { busy.current = false; setPending(undefined); }
  };
  const mainGoal = (kind: 'personalTask' | 'academic', id: string, selected: boolean) => {
    void run({ path: kind === 'personalTask' ? `/tasks/${id}/main-goal` : `/academic-items/${id}/main-goal`,
      ...(kind === 'academic' ? { method: 'PATCH' } : {}), body: { date: selected ? null : today } });
  };
  const canSelectTask = (task: PersonalTask) => !!session && !task.completedAt && (!task.recurrence || taskOccursOn({
    recurrence: task.recurrence, due: task.due ?? undefined, scheduled: task.scheduled ?? undefined,
  }, today, timeZone));
  const onAction = (task: PersonalTask, selected: TaskRowAction) => {
    if (selected === 'toggle') void run({ path: `/tasks/${task.id}/complete`, body: { completed: !task.completedAt } });
    else if (selected === 'focus') router.push({ pathname: '/focus', params: { taskId: task.id } });
    else if (selected === 'mainGoal') mainGoal('personalTask', task.id, task.mainGoalDate === today);
    else if (selected === 'edit') setEditing(task);
    else if (selected === 'reminder') setReminding(task);
    else { setMessage(undefined); setDeleting(task); }
  };
  const pendingFor = (task: PersonalTask): TaskRowAction | undefined => pending === `/tasks/${task.id}/complete` ? 'toggle'
    : pending === `/tasks/${task.id}/main-goal` ? 'mainGoal' : undefined;
  const courseLabel = (id: string | null | undefined) => { const course = id ? courses.data?.find(row => row.id === id) : undefined;
    return course ? { label: course.code ?? course.name, color: courseColor(course) } : undefined; };
  const summary = tasks.data ? taskSummary(tasks.data, today, timeZone, now) : undefined;
  const openAcademic = academic.data?.filter(item => item.submissionState !== 'submitted' && item.submissionState !== 'graded');

  return <Screen safeArea edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.top}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Tasks</Text>
          {summary && <Text style={styles.summary}>{summary.open} open{summary.overdue ? ` · ${summary.overdue} overdue` : ''}</Text>}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="Add task" accessibilityState={{ disabled }} disabled={disabled} onPress={() => setEditing(null)}
          style={({ pressed }) => [styles.add, pressed && styles.pressed, disabled && styles.dim]}><Ionicons name="add" size={26} color="#fff"/></Pressable>
      </View>
      <View style={styles.links}>
        <Chip icon="layers-outline" label="My study plans" onPress={() => router.push('/study-plans')}/>
        <Chip icon="school-outline" label="Coursework" onPress={() => router.push('/academics')}/>
        <Chip icon="calendar-outline" label="Calendar" onPress={() => router.push('/calendar')}/>
        <Chip icon="search-outline" label="Search everything" onPress={() => router.push('/search')}/>
      </View>
      {message && !deleting && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
      <TaskFilterControls filters={filters} onChange={updateFilters} onReset={resetFilters}/>
      {visibleTasks && <Text style={styles.meta}>{visibleTasks.length} personal {visibleTasks.length === 1 ? 'task' : 'tasks'}</Text>}
      <State loading={tasks.isLoading} error={tasks.error}/>
      {visibleTasks?.length === 0 && <View style={styles.empty}><Ionicons name={tasks.data?.length === 0 ? 'sunny-outline' : 'search-outline'} size={30} color={colors.moss}/>
        <Text style={styles.item}>{tasks.data?.length === 0 ? 'No personal tasks yet.' : 'No personal tasks match your filters.'}</Text>
        {tasks.data?.length === 0 && <Text style={styles.meta}>Capture an assignment step, an errand or anything you want off your mind.</Text>}</View>}
      {visibleTasks && groupTasks(visibleTasks, today, timeZone, now).map(group => <View key={group.bucket} style={styles.group}>
        <View style={styles.groupHeading}><Text accessibilityRole="header" style={[styles.section, group.bucket === 'overdue' && styles.overdue]}>{group.title}</Text>
          <Text style={styles.count}>{group.tasks.length}</Text></View>
        {group.tasks.map(task => <TaskRow key={task.id} task={task} today={today} timeZone={timeZone} expanded={expanded === task.id} disabled={disabled}
          pending={pendingFor(task)} isMainGoal={task.mainGoalDate === today} canChangeMainGoal={canSelectTask(task)}
          course={courseLabel(task.courseId)}
          onToggleExpanded={() => setExpanded(current => current === task.id ? undefined : task.id)} onAction={selected => onAction(task, selected)}/>)}
      </View>)}

      <View style={styles.groupHeading}><Text accessibilityRole="header" style={styles.section}>University</Text>
        {openAcademic && <Text style={styles.count}>{openAcademic.length} open</Text>}</View>
      <State loading={academic.isLoading} error={academic.error} empty={academic.data?.length === 0 ? 'Canvas work appears here after a successful sync.' : undefined}/>
      {academic.data?.map(item => { const selected = item.mainGoalDate === today, done = item.submissionState === 'submitted' || item.submissionState === 'graded';
        const timing = planTimingLabel({ kind: 'academic', schedule: null, due: item.due }, timeZone, today);
        return <View key={item.id} style={[styles.academic, selected && styles.main]}>
          <View style={styles.academicIcon}><Ionicons name={done ? 'checkmark' : 'school-outline'} size={16} color={colors.blue}/></View>
          <View style={styles.academicBody}>
            {selected && <Text style={styles.star}>★ MAIN GOAL TODAY</Text>}
            <Text style={[styles.item, done && styles.done]}>{item.title}</Text>
            <Text style={styles.meta}>{item.kind[0].toUpperCase() + item.kind.slice(1)} · {(item.submissionState ?? 'unsubmitted').replace(/^\w/, letter => letter.toUpperCase())}{timing ? ` · ${timing}` : ' · No deadline'}</Text>
            {(selected || (!!session && !done)) && <View style={styles.links}><Chip icon={selected ? 'star' : 'star-outline'} disabled={disabled}
              label={pending === `/academic-items/${item.id}/main-goal` ? 'Saving…' : selected ? 'Remove Main Goal' : 'Make Main Goal today'}
              onPress={() => mainGoal('academic', item.id, selected)}/></View>}
          </View>
        </View>; })}
      <View style={styles.spacer}/>
    </ScrollView>
    {editing !== undefined && <TaskEditor key={editing?.id ?? 'new'} task={editing} timeZone={timeZone} courses={courses.data} onClose={() => setEditing(undefined)}/>}
    {reminding && <TaskReminderEditor key={reminding.id} task={reminding} timeZone={timeZone} onClose={() => setReminding(undefined)}/>}
    {deleting && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!disabled) setDeleting(undefined); }}>
      <SafeAreaView style={styles.confirm}><Card>
        <Text style={styles.section}>Delete task?</Text><Text style={styles.meta}>Delete “{deleting.title}” and its reminder?</Text>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={disabled ? 'Deleting…' : 'Delete task'} tone="danger" disabled={disabled} onPress={() => {
          void run({ path: `/tasks/${deleting.id}`, method: 'DELETE' }).then(saved => { if (saved) setDeleting(undefined); });
        }}/>
        <Button title="Keep task" tone="plain" disabled={disabled} onPress={() => setDeleting(undefined)}/>
      </Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, heading: { flex: 1, gap: 2 },
  title: { fontSize: 30, color: colors.ink, fontWeight: '800' }, summary: { color: colors.muted, fontSize: 15 },
  add: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { gap: 8 }, groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  section: { fontSize: 18, fontWeight: '800', color: colors.ink }, overdue: { color: colors.coral },
  count: { color: colors.muted, fontWeight: '700', backgroundColor: colors.sage, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden', fontSize: 12 },
  empty: { alignItems: 'center', gap: 6, padding: 24, borderRadius: 18, backgroundColor: colors.sage },
  academic: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.line },
  academicIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.blueSurface, alignItems: 'center', justifyContent: 'center' }, academicBody: { flex: 1, gap: 4 },
  main: { borderColor: colors.goldLine, backgroundColor: colors.goldSurface }, star: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  item: { fontSize: 16, fontWeight: '700', color: colors.ink }, done: { textDecorationLine: 'line-through', color: colors.muted }, meta: { color: colors.muted },
  error: { color: colors.coral }, pressed: { opacity: 0.75 }, dim: { opacity: 0.5 }, spacer: { height: 24 },
  confirm: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
});
