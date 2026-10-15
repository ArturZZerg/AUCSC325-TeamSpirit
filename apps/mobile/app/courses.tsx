import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackLink, Button, Card, Screen, State, colors } from '@/components/ui';
import { useAcademic, useAction, useCourses } from '@/features/queries';
import { CourseEditor, courseColor, isManualCourse } from '@/features/course-editor';
import { useSessionStore } from '@/store/session';
import type { Course } from '@/lib/types';

export default function CoursesScreen() {
  const session = useSessionStore(state => state.session);
  // Account switches discard open editors and confirmations.
  return session ? <CoursesContent key={JSON.stringify([session.user.id, session.accessToken])}/> : null;
}

function CoursesContent() {
  const router = useRouter();
  const courses = useCourses(), academic = useAcademic(), action = useAction();
  const [editing, setEditing] = useState<Course | null>(), [deleting, setDeleting] = useState<Course>();
  const guard = useRef(false), [pending, setPending] = useState<string>(), [message, setMessage] = useState<string>();
  const run = async (key: string, request: Parameters<typeof action.mutateAsync>[0]) => {
    if (guard.current || action.isPending) return false;
    guard.current = true; setPending(key); setMessage(undefined);
    try { await action.mutateAsync(request); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the change. Please try again.'); return false; }
    finally { guard.current = false; setPending(undefined); }
  };
  const disabled = !!pending || action.isPending;
  const open = (course: Course) => academic.data?.filter(item => item.courseId === course.id && item.submissionState !== 'submitted' && item.submissionState !== 'graded').length;
  const active = courses.data?.filter(course => course.active) ?? [], archived = courses.data?.filter(course => !course.active) ?? [];
  const row = (course: Course) => <View key={course.id} style={styles.course}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${course.name}`} disabled={disabled}
    onPress={() => setEditing(course)} style={({ pressed }) => [styles.courseMain, pressed && styles.pressed]}>
    <View style={[styles.swatch, { backgroundColor: courseColor(course) }]}><Text style={styles.swatchText}>{(course.code ?? course.name).slice(0, 3).toUpperCase()}</Text></View>
    <View style={styles.body}>
      <Text style={styles.name}>{course.name}</Text>
      <Text style={styles.meta}>{[course.code, isManualCourse(course) ? 'Your course' : 'Imported from Canvas',
        open(course) === undefined ? null : `${open(course)} open ${open(course) === 1 ? 'item' : 'items'}`].filter(Boolean).join(' · ')}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>
    {isManualCourse(course) && <Pressable accessibilityRole="button" accessibilityLabel={course.active ? `Archive ${course.name}` : `Restore ${course.name}`} disabled={disabled} hitSlop={8}
      onPress={() => { void run(course.id, { path: `/courses/${course.id}`, method: 'PATCH', body: { active: !course.active } }); }}>
      <Ionicons name={course.active ? 'archive-outline' : 'arrow-undo-outline'} size={20} color={colors.muted}/></Pressable>}
  </View>;
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={courses.isRefetching} onRefresh={() => { void courses.refetch(); void academic.refetch(); }}/>}>
    <View style={styles.heading}><BackLink to="Coursework" onPress={() => router.replace('/academics')}/><Text style={styles.kicker}>COURSES</Text></View>
    <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.title}>Your courses</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add course" disabled={disabled} onPress={() => setEditing(null)} style={[styles.add, disabled && styles.dim]}>
        <Ionicons name="add" size={24} color={colors.onAccent}/></Pressable></View>
    <Text style={styles.meta}>Group coursework by course and give each one a colour. Canvas courses appear here after a sync.</Text>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <State loading={courses.isLoading} error={courses.error}/>
    {courses.data?.length === 0 && <View style={styles.empty}><Ionicons name="school-outline" size={30} color={colors.moss}/>
      <Text style={styles.name}>Add your first course.</Text><Text style={styles.meta}>Then pick it when you add coursework.</Text>
      <Button title="Add a course" onPress={() => setEditing(null)}/></View>}
    {active.map(row)}
    {archived.length > 0 && <Text style={styles.section}>Archived</Text>}
    {archived.map(row)}
    {active.some(isManualCourse) && <Text style={styles.meta}>Archive a course when the term ends; its coursework stays.</Text>}
  </ScrollView>
    {editing !== undefined && !deleting && <CourseEditor key={editing?.id ?? 'new'} course={editing} onClose={() => setEditing(undefined)}
      onDelete={editing && isManualCourse(editing) ? () => setDeleting(editing) : undefined}/>}
    {deleting && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!disabled) setDeleting(undefined); }}>
      <SafeAreaView style={styles.confirm}><Card><Text style={styles.section}>Delete {deleting.name}?</Text>
        <Text style={styles.meta}>Its coursework stays and becomes “No course”. To keep the course for later, archive it instead.</Text>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={disabled ? 'Deleting…' : 'Delete course'} tone="danger" disabled={disabled} onPress={() => {
          void run(deleting.id, { path: `/courses/${deleting.id}`, method: 'DELETE' }).then(done => { if (done) { setDeleting(undefined); setEditing(undefined); } });
        }}/>
        <Button title="Keep course" tone="plain" disabled={disabled} onPress={() => setDeleting(undefined)}/>
      </Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: colors.ink, fontSize: 28, fontWeight: '800' },
  add: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' }, dim: { opacity: 0.5 },
  course: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  courseMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }, pressed: { opacity: 0.75 }, swatch: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatchText: { color: colors.onAccent, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  body: { flex: 1, gap: 2 }, name: { color: colors.ink, fontSize: 16, fontWeight: '700' }, meta: { color: colors.muted, lineHeight: 20 },
  section: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 8 }, error: { color: colors.coral },
  empty: { alignItems: 'center', gap: 8, padding: 24, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  confirm: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
});
