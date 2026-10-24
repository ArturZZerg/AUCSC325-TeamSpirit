import { useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { Workout } from '@campusflow/contracts';
import { activeDays, estimateDayMinutes, gymWeek, nextProgramDay, resolveProgram, workoutVolume, type GymExercise, type ProgramDay, type TrainingProgram } from '@campusflow/domain';
import { Button, Card, Screen, State, colors } from '@/components/ui';
import { useAction, useGym } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { createDraft, draftProgress, exerciseName, formatDuration, formatSets, ownGym, toLogged, weekMessage } from '@/features/gym';
import { importOpenGymBackup, pickOpenGymBackup } from '@/services/opengym-import';
import { ProgramBrowser } from '@/features/gym-program-browser';
import { gymOwner, useGymWorkout } from '@/store/gym-workout';
import { useSessionStore } from '@/store/session';

const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function GymScreen() {
  const session = useSessionStore(state => state.session);
  const owner = gymOwner(session), timeZone = session?.user.timeZone ?? 'UTC';
  const { date: today } = useTodayClock(timeZone);
  const gym = useGym(); const action = useAction();
  const { draft: stored, restore, start, discard } = useGymWorkout();
  const draft = stored?.owner === owner ? stored : null;
  const [choosing, setChoosing] = useState(false); const [confirm, setConfirm] = useState<'replace' | Workout>();
  const [pendingDay, setPendingDay] = useState<ProgramDay>(); const [expanded, setExpanded] = useState<string>(); const [message, setMessage] = useState<string>();
  useEffect(() => { if (owner) void restore(owner); }, [owner, restore]);
  const enrollment = gym.data?.enrollment, workouts = gym.data?.workouts ?? [];
  const own = ownGym(gym.data);
  const program = enrollment ? resolveProgram(enrollment.programId, own.programs) : undefined;
  const [importing, setImporting] = useState(false); const [imported, setImported] = useState<string>();
  const open = (item: { id: string }) => router.push({ pathname: '/gym-program', params: { id: item.id } });
  const begin = (day: ProgramDay, replace = false) => {
    if (!owner || !program || !enrollment) return;
    if (draft && !replace) { setPendingDay(day); setConfirm('replace'); return; }
    start(createDraft(owner, program, day, enrollment.unit, workouts, today, timeZone, new Date(), own.exercises, enrollment.trackRir));
    setConfirm(undefined); setChoosing(false); router.push('/workout');
  };
  const importBackup = async () => {
    setMessage(undefined); setImported(undefined);
    try {
      const text = await pickOpenGymBackup();
      if (!text) return;
      setImporting(true);
      const result = await importOpenGymBackup(text);
      await gym.refetch();
      setImported(`Imported ${result.workouts} workouts, ${result.exercises} exercises and ${result.bodyWeights} body-weight entries${result.skipped ? ` (${result.skipped} cardio or empty entries skipped)` : ''}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import the backup.'); }
    finally { setImporting(false); }
  };
  const remove = async (workout: Workout) => {
    setMessage(undefined);
    try { await action.mutateAsync({ path: `/gym/workouts/${workout.id}`, method: 'DELETE' }); setConfirm(undefined); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete the workout. Please try again.'); }
  };

  return <Screen safeArea edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={!!gym.isRefetching} onRefresh={() => { void gym.refetch(); }}/>}>
    <Text accessibilityRole="header" style={styles.title}>Gym</Text>
    <Text style={styles.sub}>{program ? 'Train with a plan. Every rep counts.' : 'Pick a program and we will guide every workout.'}</Text>
    <State loading={gym.isLoading} error={gym.error}/>
    {message && !confirm && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    {draft && <Pressable accessibilityRole="button" accessibilityLabel={`Resume ${draft.title}`} onPress={() => router.push('/workout')} style={({ pressed }) => [styles.resume, pressed && styles.pressed]}>
      <Ionicons name="play-circle" size={34} color={colors.onAccent}/>
      <View style={styles.flex}><Text style={styles.resumeTitle}>Workout in progress · {draft.title}</Text>
        <Text style={styles.resumeMeta}>{draftProgress(draft).done} of {draftProgress(draft).total} sets · started {formatDuration(Date.now() - Date.parse(draft.startedAt))} ago</Text></View>
      <Ionicons name="chevron-forward" size={20} color={colors.onAccent}/>
    </Pressable>}
    {gym.data && !program && <>
      <View style={styles.intro}><Ionicons name="barbell-outline" size={30} color={colors.moss}/>
        <View style={styles.flex}><Text style={styles.section}>Find a program that fits you</Text>
          <Text style={styles.meta}>Every program tells you exactly what to do, remembers your last weights and tells you when to go heavier.</Text></View></View>
      <MyPrograms programs={own.programs} importing={importing} onOpen={open} onImport={() => { void importBackup(); }}/>
      <Text accessibilityRole="header" style={styles.section}>Programs for every level</Text>
      <ProgramBrowser onOpen={open}/>
    </>}
    {imported && <View style={styles.notice}><Ionicons name="checkmark-circle" size={20} color={colors.moss}/><Text style={styles.noticeText}>{imported}</Text></View>}
    {program && enrollment && <Overview program={program} own={own.exercises} enrollment={enrollment} workouts={workouts} today={today} timeZone={timeZone}
      programs={own.programs} importing={importing} onImport={() => { void importBackup(); }}
      choosing={choosing} expanded={expanded} onBegin={day => begin(day)} onChoose={() => setChoosing(value => !value)} onOpen={open}
      onExpand={id => setExpanded(value => value === id ? undefined : id)} onDelete={workout => { setMessage(undefined); setConfirm(workout); }}/>}
  </ScrollView>
    {confirm && <Modal visible transparent animationType="fade" onRequestClose={() => setConfirm(undefined)}>
      <SafeAreaView style={styles.scrim}><Card>{confirm === 'replace' ? <>
        <Text style={styles.section}>Start a new workout?</Text>
        <Text style={styles.meta}>Your unfinished {draft?.title} workout will be discarded. Sets you have not finished are not saved.</Text>
        <Button title="Discard and start" tone="danger" onPress={() => { discard(); if (pendingDay) begin(pendingDay, true); }}/>
        <Button title="Resume current workout" tone="plain" onPress={() => { setConfirm(undefined); router.push('/workout'); }}/>
      </> : <>
        <Text style={styles.section}>Delete this workout?</Text>
        <Text style={styles.meta}>{confirm.title} and its sets will be removed from your history and progress.</Text>
        {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Button title={action.isPending ? 'Deleting…' : 'Delete workout'} tone="danger" disabled={action.isPending} onPress={() => { void remove(confirm); }}/>
        <Button title="Keep workout" tone="plain" disabled={action.isPending} onPress={() => setConfirm(undefined)}/>
      </>}</Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

function MyPrograms({ programs, importing, onOpen, onImport }: { programs: readonly TrainingProgram[]; importing: boolean; onOpen(program: { id: string }): void; onImport(): void }) {
  return <Card><Text accessibilityRole="header" style={styles.section}>My programs</Text>
    {programs.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} onPress={() => onOpen(item)} style={styles.myProgram}>
      <Ionicons name="clipboard-outline" size={20} color={colors.moss}/><View style={styles.flex}><Text style={styles.item}>{item.name}</Text>
        <Text style={styles.meta}>{activeDays(item).length} days · {activeDays(item).reduce((sum, day) => sum + day.exercises.length, 0)} exercises</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}
    {!programs.length && <Text style={styles.meta}>Build your own split, or customize any program below.</Text>}
    <View style={styles.buttons}>
      <Button title="Create a program" tone="plain" onPress={() => router.push('/program-editor')}/>
      <Button title={importing ? 'Importing…' : 'Import from openGym'} tone="plain" disabled={importing} onPress={onImport}/>
    </View>
  </Card>;
}

function Overview({ program, own, programs, enrollment, workouts, today, timeZone, choosing, expanded, importing, onImport, onBegin, onChoose, onOpen, onExpand, onDelete }: {
  program: TrainingProgram; own: readonly GymExercise[]; programs: readonly TrainingProgram[]; enrollment: { weeklyTarget: number; unit: 'kg' | 'lb' }; workouts: Workout[];
  today: string; timeZone: string; choosing: boolean; expanded?: string; importing: boolean; onImport(): void;
  onBegin(day: ProgramDay): void; onChoose(): void; onOpen(program: { id: string }): void; onExpand(id: string): void; onDelete(workout: Workout): void;
}) {
  const next = nextProgramDay(program, toLogged(workouts));
  const week = gymWeek(workouts, today, timeZone, enrollment.weeklyTarget);
  const doneToday = week.days.find(day => day.date === today)?.workouts ?? 0;
  const dateLabel = (instant: string) => new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(instant));
  return <>
    <View style={styles.hero}>
      <Text style={styles.heroKicker}>{doneToday ? 'NICE WORK TODAY · NEXT UP' : 'UP NEXT'} · {program.name.toUpperCase()}</Text>
      <Text style={styles.heroTitle}>{next.name}</Text>
      <Text style={styles.heroMeta}>{next.focus ? `${next.focus} · ` : ''}{next.exercises.length} exercises · ~{estimateDayMinutes(next)} min</Text>
      <Text style={styles.heroList} numberOfLines={2}>{next.exercises.map(item => exerciseName(item.exerciseId, own)).join(' · ')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Start ${next.name}`} onPress={() => onBegin(next)} style={({ pressed }) => [styles.start, pressed && styles.pressed]}>
        <Ionicons name="play" size={18} color={colors.moss}/><Text style={styles.startText}>Start workout</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: choosing }} onPress={onChoose} hitSlop={6}>
        <Text style={styles.other}>{choosing ? 'Hide other days' : 'Do a different day'}</Text></Pressable>
      {choosing && activeDays(program).filter(day => day.id !== next.id).map(day => <Pressable key={day.id} accessibilityRole="button" accessibilityLabel={`Start ${day.name}`}
        onPress={() => onBegin(day)} style={({ pressed }) => [styles.dayOption, pressed && styles.pressed]}>
        <View style={styles.flex}><Text style={styles.dayName}>{day.name}</Text><Text style={styles.dayMeta}>{day.focus ? `${day.focus} · ` : ''}~{estimateDayMinutes(day)} min</Text></View>
        <Ionicons name="play-circle-outline" size={24} color={colors.onAccent}/></Pressable>)}
    </View>

    <Card><View style={styles.row}><Text style={styles.section}>This week</Text>
      {week.streakWeeks > 0 && <View style={styles.streak}><Ionicons name="flame" size={16} color={colors.streak}/><Text style={styles.streakText}>{week.streakWeeks}-week streak</Text></View>}</View>
      <View style={styles.week} accessibilityLabel={`${week.count} of ${week.target} workouts this week`}>
        {week.days.map((day, index) => <View key={day.date} style={styles.weekDay}>
          <View style={[styles.dot, day.workouts > 0 && styles.dotDone, day.date === today && styles.dotToday]}>
            {day.workouts > 0 && <Ionicons name="checkmark" size={16} color={colors.onAccent}/>}</View>
          <Text style={[styles.weekLabel, day.date === today && styles.weekLabelToday]}>{weekdays[index]}</Text></View>)}
      </View>
      <Text style={styles.progressText}>{week.count} of {week.target} workouts</Text>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, (week.count / week.target) * 100)}%` }]}/></View>
      <Text style={styles.meta}>{weekMessage(week.count, week.target, week.streakWeeks)}</Text>
    </Card>

    <View style={styles.row}><Text accessibilityRole="header" style={styles.section}>Recent workouts</Text></View>
    {!workouts.length && <View style={styles.empty}><Ionicons name="trophy-outline" size={28} color={colors.plum}/>
      <Text style={styles.item}>Your first workout starts the story.</Text><Text style={styles.meta}>Finished workouts show up here with your sets and progress.</Text></View>}
    {workouts.slice(0, 6).map(workout => { const open = expanded === workout.id;
      return <Card key={workout.id}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${workout.title}, ${dateLabel(workout.endedAt)}`}
        onPress={() => onExpand(workout.id)} style={styles.row}>
        <View style={styles.flex}><Text style={styles.item}>{workout.title}</Text>
          <Text style={styles.meta}>{dateLabel(workout.endedAt)} · {formatDuration(Date.parse(workout.endedAt) - Date.parse(workout.startedAt))} · {workout.exercises.reduce((sum, entry) => sum + entry.sets.length, 0)} sets
            {workoutVolume(workout.exercises) > 0 ? ` · ${workoutVolume(workout.exercises).toLocaleString()} ${workout.unit}` : ''}</Text></View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted}/></Pressable>
        {open && <View style={styles.details}>
          {workout.exercises.map(entry => <Text key={entry.exerciseId} style={styles.meta}><Text style={styles.detailName}>{exerciseName(entry.exerciseId, own)}</Text>  {formatSets(entry.sets, workout.unit)}</Text>)}
          {workout.note && <Text style={styles.meta}>“{workout.note}”</Text>}
          <Pressable accessibilityRole="button" onPress={() => onDelete(workout)} hitSlop={6}><Text style={styles.delete}>Delete workout</Text></Pressable>
        </View>}
      </Card>; })}

    <Card><Text style={styles.kicker}>YOUR PROGRAM</Text><Text style={styles.section}>{program.name}</Text>
      <Text style={styles.meta}>{activeDays(program).length} days in rotation · goal {enrollment.weeklyTarget} a week · weights in {enrollment.unit}</Text>
      <View style={styles.actions}><Button title="View program & settings" tone="plain" onPress={() => onOpen(program)}/></View>
    </Card>
    <MyPrograms programs={programs} importing={importing} onOpen={onOpen} onImport={onImport}/>
    <Text accessibilityRole="header" style={styles.section}>Explore other programs</Text>
    <ProgramBrowser currentId={program.id} onOpen={onOpen}/>
  </>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink }, sub: { color: colors.muted, fontSize: 15, marginTop: -8 },
  section: { fontSize: 18, fontWeight: '800', color: colors.ink }, item: { color: colors.ink, fontSize: 16, fontWeight: '700' }, meta: { color: colors.muted, lineHeight: 20 },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }, flex: { flex: 1, gap: 2 }, error: { color: colors.coral }, pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  intro: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 20, backgroundColor: colors.sage },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.blue },
  resumeTitle: { color: colors.onAccent, fontWeight: '800', fontSize: 16 }, resumeMeta: { color: colors.onAccent, opacity: 0.9 },
  hero: { gap: 6, padding: 20, borderRadius: 24, backgroundColor: colors.moss },
  heroKicker: { color: colors.onAccent, opacity: 0.85, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  heroTitle: { color: colors.onAccent, fontSize: 30, fontWeight: '900' }, heroMeta: { color: colors.onAccent, fontWeight: '600' },
  heroList: { color: colors.onAccent, opacity: 0.85, lineHeight: 20 },
  start: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, minHeight: 50, borderRadius: 25, backgroundColor: colors.card },
  startText: { color: colors.moss, fontSize: 17, fontWeight: '800' },
  other: { color: colors.onAccent, fontWeight: '700', textAlign: 'center', paddingVertical: 8, textDecorationLine: 'underline' },
  dayOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)' },
  dayName: { color: colors.onAccent, fontWeight: '800' }, dayMeta: { color: colors.onAccent, opacity: 0.85, fontSize: 13 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.streakSurface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  streakText: { color: colors.streakText, fontWeight: '800', fontSize: 13 },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 }, weekDay: { alignItems: 'center', gap: 4 },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.moss, borderColor: colors.moss }, dotToday: { borderColor: colors.moss },
  weekLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' }, weekLabelToday: { color: colors.moss },
  progressText: { color: colors.ink, fontWeight: '800' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.sage, overflow: 'hidden' }, barFill: { height: 8, borderRadius: 4, backgroundColor: colors.moss },
  empty: { alignItems: 'center', gap: 6, padding: 22, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  details: { gap: 6, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }, detailName: { color: colors.ink, fontWeight: '700' },
  delete: { color: colors.danger, fontWeight: '700', marginTop: 4 }, actions: { marginTop: 4 },
  myProgram: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  buttons: { gap: 4 }, notice: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: colors.sage },
  noticeText: { color: colors.ink, flex: 1, fontWeight: '600' },
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
});
