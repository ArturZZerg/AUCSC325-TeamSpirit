import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Button, Card, Screen, colors } from '@/components/ui';
import { useAcademic, useCourses, useGoals, useTasks } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { TaskEditor } from '@/features/task-editor';
import { AcademicItemEditor } from '@/features/academic-item-editor';
import { GoalEditor } from '@/features/goal-editor';
import { setupProgress, type SetupStatus } from '@/features/setup-progress';
import { useSessionStore } from '@/store/session';

export default function GetStartedScreen() {
  const session = useSessionStore(state => state.session);
  return session ? <GetStartedContent key={JSON.stringify([session.user.id, session.accessToken])} timeZone={session.user.timeZone}/> : null;
}

function GetStartedContent({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const tasks = useTasks(); const academic = useAcademic(); const goals = useGoals(); const courses = useCourses();
  const { date, resumeCount } = useTodayClock(timeZone);
  const [editing, setEditing] = useState<'task' | 'coursework' | 'routine'>();
  const lastResume = useRef(resumeCount);
  const progress = setupProgress(tasks.data, academic.data, goals.data);
  const refreshing = tasks.isRefetching || academic.isRefetching || goals.isRefetching || courses.isRefetching;
  const refresh = () => { void Promise.all([tasks.refetch(), academic.refetch(), goals.refetch(), courses.refetch()]); };
  useEffect(() => {
    if (lastResume.current === resumeCount) return;
    lastResume.current = resumeCount;
    void tasks.refetch({ cancelRefetch: false }); void academic.refetch({ cancelRefetch: false });
    void goals.refetch({ cancelRefetch: false }); void courses.refetch({ cancelRefetch: false });
  }, [resumeCount, tasks.refetch, academic.refetch, goals.refetch, courses.refetch]);
  const failed = tasks.error || academic.error || goals.error;
  return <Screen><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    aria-hidden={!!editing} accessibilityElementsHidden={!!editing} importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
    refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={refresh}/>}>
    <View style={styles.heading}><Button title="Back to Today" tone="plain" onPress={() => router.replace('/today')}/><Text style={styles.kicker}>GET STARTED</Text></View>
    <View style={styles.hero}>
      <View style={styles.heroIcon}><Ionicons name="leaf-outline" size={28} color={colors.moss}/></View>
      <Text style={styles.title}>{'A little structure.\nA lighter day.'}</Text>
      <Text style={styles.copy}>Put the things that matter in one place. Start with one small step and build a plan that fits you.</Text>
      <View style={styles.heading}><Text style={styles.progressLabel}>{progress.added} of 3 foundations added</Text><Text style={styles.meta}>At your pace</Text></View>
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="Setup progress" accessibilityValue={{ min: 0, max: 3, now: progress.added }}>
        {[1, 2, 3].map(step => <View key={step} style={[styles.segment, step <= progress.added && styles.segmentDone]}/>)}
      </View>
      {progress.added === 3 && <Text style={styles.copy}>Your foundations are in place. Open Today to choose what comes next.</Text>}
    </View>
    {failed && <Card><Text accessibilityRole="alert" style={styles.copy}>Couldn’t refresh your setup. Progress uses saved information where available.</Text><Button title="Refresh setup" tone="plain" disabled={!!refreshing} onPress={refresh}/></Card>}
    {!failed && progress.known < 3 && <Text style={styles.meta}>Checking your saved tasks, coursework and routines…</Text>}
    <Step number="01" icon="checkbox-outline" title="Make space for one task" status={progress.task}
      description="Something on your mind? Give it a name and a day. A quick task starts in today’s plan; you can change the date."
      action={progress.task === 'added' ? 'View my tasks' : 'Add a task for today'} onPress={() => progress.task === 'added' ? router.push('/tasks') : setEditing('task')}/>
    <Step number="02" icon="school-outline" title="Keep a deadline in sight" status={progress.coursework}
      description="Add an assignment or quiz from your syllabus. You can start with your own coursework while Canvas is optional."
      action={progress.coursework === 'added' ? 'View my coursework' : 'Add coursework'} onPress={() => progress.coursework === 'added' ? router.push('/academics') : setEditing('coursework')}/>
    <Step number="03" icon="repeat-outline" title="Find a steady rhythm" status={progress.routine}
      description="Choose one small routine: a weekday study block, a walk, or a weekly activity. Set a pace you can keep."
      action={progress.routine === 'added' ? 'View my routines' : 'Create a routine'} onPress={() => progress.routine === 'added' ? router.push('/wellness') : setEditing('routine')}/>
    <Text style={styles.section}>Try your daily flow</Text>
    <Text style={styles.copy}>Once you have something planned, pick a Main Goal, make time for the week, and focus on one thing at a time.</Text>
    <View style={styles.links}><Shortcut icon="calendar-outline" title="Plan my week" subtitle="See what’s ahead" onPress={() => router.push('/planner')}/>
      <Shortcut icon="timer-outline" title="Try focus space" subtitle="Start a quiet study block" onPress={() => router.push('/focus')}/></View>
    <Button title="Open my daily plan" onPress={() => router.replace('/today')}/>
    <Text style={styles.footnote}>This guide is always available from Today. You choose what to add; nothing is created automatically.</Text>
  </ScrollView>
    {editing === 'task' && <TaskEditor task={null} timeZone={timeZone} initialValues={{ scheduledMode: 'date', scheduledDate: date }} onClose={() => setEditing(undefined)}/>}
    {editing === 'coursework' && <AcademicItemEditor item={null} courses={courses.data ?? []} timeZone={timeZone} onClose={() => setEditing(undefined)} onSaved={() => setEditing(undefined)}/>}
    {editing === 'routine' && <GoalEditor goal={null} timeZone={timeZone} onClose={() => setEditing(undefined)}/>}
  </Screen>;
}

type IconName = ComponentProps<typeof Ionicons>['name'];
function Step({ number, icon, title, description, status, action, onPress }: {
  number: string; icon: IconName; title: string; description: string; status: SetupStatus; action: string; onPress(): void;
}) {
  return <Card><View style={styles.heading}><View style={styles.stepIcon}><Ionicons name={icon} size={23} color={colors.moss}/></View>
    <Text style={styles.kicker}>{status === 'added' ? 'ADDED' : status === 'unknown' ? 'NOT LOADED' : `STEP ${number}`}</Text></View>
    <Text style={styles.section}>{title}</Text><Text style={styles.copy}>{description}</Text>
    <Button title={action} tone={status === 'added' ? 'plain' : 'primary'} onPress={onPress}/></Card>;
}
function Shortcut({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.shortcut}>
    <Ionicons name={icon} size={22} color={colors.moss}/><Text style={styles.shortcutTitle}>{title}</Text><Text style={styles.meta}>{subtitle}</Text></Pressable>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 16 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  kicker: { color: colors.moss, fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  hero: { paddingVertical: 12, gap: 16 }, heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sage },
  title: { fontSize: 32, lineHeight: 39, color: colors.ink, fontWeight: '800' },
  copy: { color: colors.muted, lineHeight: 22, fontSize: 15 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  progressLabel: { color: colors.ink, fontWeight: '700', fontSize: 13 }, progress: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.line }, segmentDone: { backgroundColor: colors.moss },
  stepIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  section: { color: colors.ink, fontSize: 20, fontWeight: '800', lineHeight: 26 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, shortcut: { flex: 1, minWidth: 200, padding: 18, borderRadius: 16, backgroundColor: colors.sage, gap: 8, minHeight: 120 },
  shortcutTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 }, footnote: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
