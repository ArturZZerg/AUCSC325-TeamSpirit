import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { gradeSummary } from '@campusflow/domain';
import { BackLink, Button, Card, Screen, State, colors } from '@/components/ui';
import { useAcademic, useAction, useClasses, useCourses } from '@/features/queries';
import { ClassEditor, classDays } from '@/features/class-editor';
import { CourseEditor, courseColor, isManualCourse } from '@/features/course-editor';
import { AssessmentEditor } from '@/features/assessment-editor';
import { planTimingLabel } from '@/features/today-plan';
import { useTodayClock } from '@/features/today-clock';
import { useSessionStore } from '@/store/session';
import type { Course } from '@/lib/types';
import { courseLabel } from '@/features/course-label';

type Assessment = NonNullable<Course['assessments']>[number];
const pct = (value: number | null) => value === null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

export default function CourseScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <CourseContent key={JSON.stringify([session.user.id, session.accessToken])} timeZone={session.user.timeZone}/> : null;
}

function CourseContent({ timeZone }: { timeZone: string }) {
  const router = useRouter(), { id } = useLocalSearchParams<{ id: string }>();
  const courses = useCourses(), academic = useAcademic(), classes = useClasses(), action = useAction();
  const { date: today } = useTodayClock(timeZone);
  const course = courses.data?.find(row => row.id === id);
  const assessments = useMemo(() => course?.assessments ?? [], [course?.assessments]);
  const summary = useMemo(() => gradeSummary(assessments, course?.targetGrade ?? null), [assessments, course?.targetGrade]);
  const [editing, setEditing] = useState<Assessment | null>(), [editingCourse, setEditingCourse] = useState(false), [deleting, setDeleting] = useState(false);
  const [target, setTarget] = useState<string>(), guard = useRef(false), [busy, setBusy] = useState(false), [message, setMessage] = useState<string>();
  const coursework = academic.data?.filter(item => item.courseId === id) ?? [];
  const meetings = classes.data?.filter(item => item.courseId === id) ?? [];
  const [addingClass, setAddingClass] = useState(false);
  const removeCourse = async () => {
    if (guard.current || !course) return;
    guard.current = true; setBusy(true); setMessage(undefined);
    try { await action.mutateAsync({ path: `/courses/${course.id}`, method: 'DELETE' }); router.replace('/courses'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete the course. Please try again.'); }
    finally { guard.current = false; setBusy(false); }
  };
  const saveTarget = async (value: number | null) => {
    if (guard.current || !course) return;
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 100)) { setMessage('Enter a whole-number target from 0 to 100.'); return; }
    guard.current = true; setBusy(true); setMessage(undefined);
    try { await action.mutateAsync({ path: `/courses/${course.id}`, method: 'PATCH', body: { targetGrade: value } }); setTarget(undefined); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the target. Please try again.'); }
    finally { guard.current = false; setBusy(false); }
  };
  if (!course) return <Screen safeArea><View style={styles.content}>
    <BackLink to="Courses" onPress={() => router.replace('/courses')}/>
    <State loading={courses.isLoading} error={courses.error}/>
    {courses.data && <Text style={styles.meta}>This course isn’t available. It may have been deleted.</Text>}
  </View></Screen>;
  const accent = courseColor(course);
  const outlook = summary.status === 'final' ? `Final grade: ${pct(summary.floor)}`
    : summary.status === 'secured' ? `Target secured. Even 0% on the remaining ${pct(summary.remainingWeight)} keeps you at ${pct(summary.floor)}.`
      : summary.status === 'unreachable' ? `Out of reach: 100% on the rest gives ${pct(summary.ceiling)}.`
        : summary.status === 'reachable' ? `Average ${pct(summary.needed)} on the remaining ${pct(summary.remainingWeight)} to reach ${course.targetGrade}%.`
          : assessments.length ? 'Set a target to see what you need on the rest.' : 'Add assessments from your course outline to track your grade.';
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={courses.isRefetching} onRefresh={() => { void courses.refetch(); void academic.refetch(); }}/>}>
    <View style={styles.heading}><BackLink to="Courses" onPress={() => router.replace('/courses')}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit course" onPress={() => setEditingCourse(true)} hitSlop={8}><Text style={styles.link}>Edit</Text></Pressable></View>
    <View style={styles.titleRow}><View style={[styles.tile, { backgroundColor: accent }]}><Text style={styles.tileText}>{courseLabel(course).slice(0, 3).toUpperCase()}</Text></View>
      <View style={styles.titleText}><Text accessibilityRole="header" style={styles.title}>{course.name}</Text>
        <Text style={styles.meta}>{[course.code, isManualCourse(course) ? 'Your course' : 'Imported from Canvas', course.active ? null : 'Archived'].filter(Boolean).join(' · ')}</Text></View></View>

    <View style={[styles.hero, { backgroundColor: accent }]}>
      <Text style={styles.heroLabel}>CURRENT GRADE</Text>
      <Text style={styles.heroValue} accessibilityLabel={summary.current === null ? 'No graded work yet' : `Current grade ${pct(summary.current)}`}>{pct(summary.current)}</Text>
      <Text style={styles.heroMeta}>{summary.totalWeight ? `${pct(summary.gradedWeight)} of ${pct(summary.totalWeight)} graded` : 'No assessments yet'}</Text>
      {summary.totalWeight > 0 && <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Graded weight"
        accessibilityValue={{ min: 0, max: Math.round(summary.totalWeight), now: Math.round(summary.gradedWeight) }}>
        <View style={[styles.fill, { width: `${Math.min(100, summary.gradedWeight / summary.totalWeight * 100)}%` }]}/></View>}
      <Text style={styles.outlook}>{outlook}</Text>
    </View>

    <View style={styles.card}>
      <Text style={styles.section}>Target grade</Text>
      <View style={styles.targets}>{[null, 60, 70, 80, 85, 90].map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityLabel={value === null ? 'No target' : `Target ${value}%`}
        accessibilityState={{ checked: (course.targetGrade ?? null) === value, disabled: busy }} disabled={busy} onPress={() => { void saveTarget(value); }}
        style={[styles.target, (course.targetGrade ?? null) === value && { backgroundColor: accent, borderColor: accent }]}>
        <Text style={[styles.targetText, (course.targetGrade ?? null) === value && styles.targetChosen]}>{value === null ? 'None' : `${value}%`}</Text></Pressable>)}</View>
      <View style={styles.custom}><TextInput accessibilityLabel="Custom target (%)" value={target ?? ''} onChangeText={setTarget} placeholder="Other target, e.g. 75" placeholderTextColor={colors.muted}
        keyboardType="number-pad" style={styles.input} editable={!busy} returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => { if (target?.trim()) void saveTarget(Number(target)); }}/>
        {!!target?.trim() && <Pressable accessibilityRole="button" accessibilityLabel="Set target" disabled={busy} onPress={() => { void saveTarget(Number(target)); }}><Text style={styles.link}>Set</Text></Pressable>}</View>
      {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    </View>

    <View style={styles.sectionRow}><Text accessibilityRole="header" style={styles.section}>Assessments</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add assessment" onPress={() => setEditing(null)} style={[styles.add, { backgroundColor: accent }]}>
        <Ionicons name="add" size={20} color={colors.onAccent}/></Pressable></View>
    {!assessments.length && <Text style={styles.meta}>Add each graded part with its weight, such as Midterm 30% or Final 40%.</Text>}
    {assessments.map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Edit ${row.title}`} onPress={() => setEditing(row)}
      style={({ pressed }) => [styles.assessment, pressed && styles.pressed]}>
      <View style={styles.assessmentBody}><Text style={styles.item}>{row.title}</Text><Text style={styles.meta}>Weight {pct(row.weight)}</Text></View>
      <Text style={[styles.score, row.score === null && styles.ungraded]}>{row.score === null ? 'Not graded' : pct(row.score)}</Text>
    </Pressable>)}
    {summary.totalWeight > 0 && summary.totalWeight < 100 && <Text style={styles.meta}>Weights total {pct(summary.totalWeight)}. Add the rest of your outline for a complete picture.</Text>}

    <Text style={styles.section}>Classes</Text>
    {meetings.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}, open timetable`} onPress={() => router.push('/timetable')} style={styles.coursework}>
      <View style={[styles.stripe, { backgroundColor: accent }]}/><View style={styles.courseworkBody}><Text style={styles.item}>{item.title}</Text>
        <Text style={styles.meta}>{[[...item.weekdays].sort((a, b) => a - b).map(day => classDays[day - 1].slice(0, 3)).join(' · '), `${item.startTime}–${item.endTime}`, item.location].filter(Boolean).join(' · ')}</Text></View>
    </Pressable>)}
    {classes.data && !meetings.length && <Text style={styles.meta}>Add when and where this course meets so it appears in your timetable and day plan.</Text>}
    {classes.data && <Button title="Add a class time" tone="plain" onPress={() => setAddingClass(true)}/>}

    {coursework.length > 0 && <><Text style={styles.section}>Coursework</Text>
      {coursework.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push('/academics')} style={styles.coursework}>
        <View style={[styles.stripe, { backgroundColor: accent }]}/><View style={styles.courseworkBody}><Text style={styles.item}>{item.title}</Text>
          <Text style={styles.meta}>{[item.kind[0].toUpperCase() + item.kind.slice(1), item.submissionState === 'submitted' || item.submissionState === 'graded' ? 'Done'
            : planTimingLabel({ kind: 'academic', schedule: null, due: item.due }, timeZone, today) ?? 'No deadline'].join(' · ')}</Text></View>
      </Pressable>)}</>}
    <Text style={styles.meta}>Grades here are your own notes for planning; your institution’s records are authoritative.</Text>
  </ScrollView>
    {addingClass && <ClassEditor item={null} date={today} timeZone={timeZone} courses={courses.data} initialCourseId={course.id} onClose={() => setAddingClass(false)}/>}
    {editing !== undefined && <AssessmentEditor key={editing?.id ?? 'new'} courseId={course.id} assessment={editing} onClose={() => setEditing(undefined)}/>}
    {editingCourse && !deleting && <CourseEditor course={course} onClose={() => setEditingCourse(false)} onDelete={isManualCourse(course) ? () => setDeleting(true) : undefined}/>}
    {deleting && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) setDeleting(false); }}>
      <SafeAreaView style={styles.confirm}><Card><Text style={styles.section}>Delete {course.name}?</Text>
        <Text style={styles.meta}>Its assessments are removed. Coursework stays and becomes “No course”. To keep it for later, archive the course instead.</Text>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={busy ? 'Deleting…' : 'Delete course'} tone="danger" disabled={busy} onPress={() => { void removeCourse(); }}/>
        <Button title="Keep course" tone="plain" disabled={busy} onPress={() => setDeleting(false)}/>
      </Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, link: { color: colors.moss, fontWeight: '800', fontSize: 15 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, titleText: { flex: 1, gap: 2 },
  tile: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, tileText: { color: colors.onAccent, fontWeight: '800', letterSpacing: 0.5 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 20 },
  hero: { borderRadius: 22, padding: 18, gap: 6 }, heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroValue: { color: colors.onAccent, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }, heroMeta: { color: 'rgba(255,255,255,0.85)' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden', marginTop: 4 }, fill: { height: 8, borderRadius: 4, backgroundColor: colors.onAccent },
  outlook: { color: colors.onAccent, fontWeight: '700', lineHeight: 21, marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  section: { color: colors.ink, fontSize: 18, fontWeight: '800' }, sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  target: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  targetText: { color: colors.ink, fontWeight: '700' }, targetChosen: { color: colors.onAccent },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.canvas },
  input: { flex: 1, minHeight: 42, color: colors.ink, fontSize: 15 }, error: { color: colors.coral },
  add: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  assessment: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.75 }, assessmentBody: { flex: 1, gap: 2 }, item: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  score: { color: colors.ink, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }, ungraded: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  coursework: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  stripe: { width: 4 }, courseworkBody: { flex: 1, padding: 12, gap: 2 },
  confirm: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
});
