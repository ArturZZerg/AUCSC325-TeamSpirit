import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { localDateAt } from '@campusflow/domain';
import { Button, Card, Field, Screen, State, colors } from '@/components/ui';
import { useAcademic, useAction, useCourses, usePlanningSnapshot } from '@/features/queries';
import { academicAttention, academicFinished, academicOverview, type AcademicView } from '@/features/academic-overview';
import { AcademicReminderEditor } from '@/features/academic-reminder-editor';
import { StudyPlanEditor } from '@/features/study-plan-editor';
import { useTodayClock } from '@/features/today-clock';
import { taskTimingLabel } from '@/features/task-form';
import { useSessionStore } from '@/store/session';
import type { AcademicItem } from '@/lib/types';

export default function AcademicsScreen() {
  const session = useSessionStore(state => state.session);
  return <AcademicsContent key={JSON.stringify([session?.user.id, session?.accessToken])}/>;
}
function AcademicsContent() {
  const router = useRouter();
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date: today, resumeCount } = useTodayClock(timeZone);
  const academic = useAcademic(); const courses = useCourses(); const snapshot = usePlanningSnapshot(today);
  const action = useAction();
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState<string>();
  const [view, setView] = useState<AcademicView>('open');
  const [reminding, setReminding] = useState<AcademicItem>();
  const [planning, setPlanning] = useState<AcademicItem>();
  const [studySaved, setStudySaved] = useState(false);
  const [pending, setPending] = useState<string>();
  const [failure, setFailure] = useState<{ id: string; message: string }>();
  const busy = useRef(false);
  const lastResume = useRef(resumeCount);
  useEffect(() => {
    if (lastResume.current === resumeCount) return;
    lastResume.current = resumeCount;
    void academic.refetch({ cancelRefetch: false }); void courses.refetch({ cancelRefetch: false });
  }, [resumeCount, academic.refetch, courses.refetch]);
  const now = new Date().toISOString();
  const overview = academicOverview(academic.data ?? [], { search, courseId, view }, timeZone, now);
  const byCourse = new Map(courses.data?.map(course => [course.id, course]) ?? []);
  const disabled = !!pending || action.isPending;
  const mainGoal = async (item: AcademicItem) => {
    if (busy.current || disabled) return;
    busy.current = true; setPending(item.id); setFailure(undefined);
    try {
      const date = localDateAt(new Date().toISOString(), timeZone);
      await action.mutateAsync({ path: `/academic-items/${item.id}/main-goal`, method: 'PATCH',
        body: { date: item.mainGoalDate === date ? null : date } });
    } catch (error) { setFailure({ id: item.id, message: error instanceof Error ? error.message : 'Could not update your Main Goal. Try again.' }); }
    finally { busy.current = false; setPending(undefined); }
  };
  const refresh = () => { void Promise.all([academic.refetch(), courses.refetch(), snapshot.refetch()]); };
  const fixtureData = academic.data?.some(item => item.source.includes('fixture'));
  return <Screen><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={academic.isRefetching || courses.isRefetching || snapshot.isRefetching} onRefresh={refresh}/> }>
    <View style={styles.heading}><Button title="Back to Today" tone="plain" onPress={() => router.replace('/today')}/><Text style={styles.kicker}>COURSEWORK</Text></View>
    <Text style={styles.title}>Stay ahead of deadlines.</Text>
    <Text style={styles.meta}>Find your next assignment and make time to work on it.</Text>
    {studySaved && <Card><Text accessibilityRole="alert" style={styles.item}>Study task added to your plan.</Text><Text style={styles.meta}>You can edit it, set a reminder or check it off in Tasks.</Text><Button title="View my tasks" tone="plain" onPress={() => router.push('/tasks')}/></Card>}
    {fixtureData && <Text style={styles.notice}>Demo coursework is shown. Live Canvas access still needs an approved connection.</Text>}
    {snapshot.data?.sourceStatus.availability === 'notConnected' && !fixtureData && <Card><Text style={styles.item}>Bring your courses together.</Text><Text style={styles.meta}>Canvas coursework appears after a successful connection and sync.</Text><Button title="Canvas settings" tone="plain" onPress={() => router.push('/settings')}/></Card>}
    {snapshot.data && ['stale', 'unavailable'].includes(snapshot.data.sourceStatus.availability) && <Text style={styles.notice}>Coursework may be out of date. Last successful sync: {snapshot.data.sourceStatus.lastSuccessfulSyncAt ? new Date(snapshot.data.sourceStatus.lastSuccessfulSyncAt).toLocaleString(undefined, { timeZone }) : 'not yet available'}.</Text>}
    <State loading={academic.isLoading} error={academic.error}/>
    {courses.error && <Text style={styles.meta}>Course names couldn’t refresh. Saved coursework is still shown when available.</Text>}
    {academic.data && <View style={styles.metrics}><Metric value={overview.attention} label="need attention"/><Metric value={overview.dueSoon} label="due soon"/><Metric value={overview.finished} label="finished"/></View>}
    <Field label="Search coursework" value={search} onChangeText={setSearch} placeholder="Assignment or quiz title" autoCorrect={false}/>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      <Choice label="All courses" selected={!courseId} onPress={() => setCourseId(undefined)}/>
      {courses.data?.map(course => <Choice key={course.id} label={`${course.code ?? course.name}${course.active ? '' : ' · inactive'}`} selected={courseId === course.id} onPress={() => setCourseId(course.id)}/>)}
    </ScrollView>
    <View style={styles.chips}>{([{ value: 'open', label: 'To do' }, { value: 'finished', label: 'Finished' }, { value: 'all', label: 'All work' }] as const)
      .map(option => <Choice key={option.value} label={option.label} selected={view === option.value} onPress={() => setView(option.value)}/>)}</View>
    {academic.data && <Text style={styles.meta}>{overview.visibleCount} {overview.visibleCount === 1 ? 'item' : 'items'} shown</Text>}
    {academic.data && !overview.visibleCount && <Card><Text style={styles.item}>{academic.data.length ? 'Nothing matches this view.' : 'Your coursework will appear here.'}</Text>
      <Text style={styles.meta}>{academic.data.length ? 'Try another course, clear your search or look at finished work.' : 'Connect and sync Canvas in Settings. You can still plan personal study tasks today.'}</Text>
      <Button title={academic.data.length ? 'Reset filters' : 'Go to Tasks'} tone="plain" onPress={() => {
        if (academic.data?.length) { setSearch(''); setCourseId(undefined); setView('open'); } else router.push('/tasks');
      }}/></Card>}
    {!academic.data && !academic.isLoading && <Button title="Retry coursework" onPress={refresh}/>}
    {overview.groups.map(group => <View key={group.title} style={styles.group}>
      <View style={styles.heading}><Text style={styles.section}>{group.title}</Text><Text style={styles.meta}>{group.items.length}</Text></View>
      {group.items.map(item => <Card key={item.id}>
        <View style={styles.heading}><Text style={styles.kicker}>{byCourse.get(item.courseId ?? '')?.code ?? byCourse.get(item.courseId ?? '')?.name ?? 'OTHER COURSEWORK'}</Text><Text style={styles.meta}>{item.kind}</Text></View>
        {item.mainGoalDate === today && <Text style={styles.kicker}>★ MAIN GOAL TODAY</Text>}
        <Text style={[styles.item, academicFinished(item) && styles.finished]}>{item.title}</Text>
        <Text style={[styles.meta, academicAttention(item, timeZone, now) && styles.attention]}>{item.submissionState === 'missing' ? 'Marked missing' : item.submissionState ?? 'Status not provided'} · {taskTimingLabel(item.due, timeZone)}</Text>
        {byCourse.get(item.courseId ?? '')?.active === false && <Text style={styles.meta}>Inactive course · reminder delivery paused</Text>}
        <View style={styles.chips}>
          {!academicFinished(item) && <Button title="Plan study time" disabled={disabled}
            onPress={() => { setStudySaved(false); setPlanning(item); }}/>}
          {(!academicFinished(item) || item.mainGoalDate === today) && <Button title={pending === item.id ? 'Saving…' : item.mainGoalDate === today ? 'Remove Main Goal' : 'Make Main Goal today'}
            disabled={disabled} tone="plain" onPress={() => { void mainGoal(item); }}/>}
          <Button title="Reminder" disabled={disabled} tone="plain" onPress={() => setReminding(item)}/>
        </View>
        {failure?.id === item.id && <Text accessibilityRole="alert" style={styles.attention}>{failure.message}</Text>}
      </Card>)}
    </View>)}
  </ScrollView>{reminding && <AcademicReminderEditor key={reminding.id} item={reminding} onClose={() => setReminding(undefined)}/>}
    {planning && <StudyPlanEditor key={planning.id} item={planning} course={byCourse.get(planning.courseId ?? '')?.code ?? byCourse.get(planning.courseId ?? '')?.name}
      timeZone={timeZone} onClose={() => setPlanning(undefined)} onSaved={() => { setPlanning(undefined); setStudySaved(true); }}/>}</Screen>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.selected]}><Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.meta}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  kicker: { color: colors.moss, fontWeight: '800', fontSize: 11, letterSpacing: .5 },
  meta: { color: colors.muted, lineHeight: 21 }, notice: { color: colors.ink, lineHeight: 21, padding: 12, backgroundColor: colors.sage, borderRadius: 12 },
  metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, padding: 12, backgroundColor: colors.sage, borderRadius: 16, gap: 6 },
  metricValue: { fontSize: 28, color: colors.ink, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 12 },
  selected: { backgroundColor: colors.moss, borderColor: colors.moss }, choiceText: { color: colors.ink, fontWeight: '600' }, selectedText: { color: '#fff' },
  section: { color: colors.ink, fontSize: 19, fontWeight: '800' }, group: { gap: 12 },
  item: { color: colors.ink, fontSize: 17, fontWeight: '700' }, finished: { color: colors.muted, textDecorationLine: 'line-through' }, attention: { color: colors.coral },
});
