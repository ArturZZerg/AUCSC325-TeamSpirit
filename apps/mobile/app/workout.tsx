import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Workout } from '@campusflow/contracts';
import { findGymExercise, findProgramDay, gymWeek, lastPerformance, personalBests, progressionAdvice, workoutVolume, type ProgressionKind } from '@campusflow/domain';
import { BackLink, Button, Card, Screen, colors } from '@/components/ui';
import { useAction, useGym } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { draftProgress, draftToWorkout, formatClock, formatDuration, formatSets, toLogged, type GymDraft } from '@/features/gym';
import { gymOwner, useGymWorkout } from '@/store/gym-workout';
import { useSessionStore } from '@/store/session';

const adviceTone: Record<ProgressionKind, { icon: 'trending-up' | 'sparkles-outline' | 'refresh' | 'pause-circle-outline' | 'arrow-up-circle'; color: string }> = {
  first: { icon: 'sparkles-outline', color: colors.blue }, returning: { icon: 'refresh', color: colors.blue },
  increase: { icon: 'arrow-up-circle', color: colors.moss }, build: { icon: 'trending-up', color: colors.moss }, hold: { icon: 'pause-circle-outline', color: colors.gold },
};
const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
type Summary = { workout: Workout; bests: string[]; weekCount: number; weekTarget: number };

export default function WorkoutScreen() {
  const router = useRouter();
  const session = useSessionStore(state => state.session);
  const owner = gymOwner(session), timeZone = session?.user.timeZone ?? 'UTC';
  const { draft: stored, restored, restore } = useGymWorkout();
  const [summary, setSummary] = useState<Summary>();
  useEffect(() => { if (owner) void restore(owner); }, [owner, restore]);
  const draft = stored?.owner === owner ? stored : null;
  if (summary) return <WorkoutSummary summary={summary} onDone={() => router.replace('/gym')}/>;
  if (!draft) return <Screen safeArea><View style={styles.content}><BackLink to="gym" onPress={() => router.replace('/gym')}/>
    <Card><Text style={styles.section}>{restored === owner ? 'No workout in progress.' : 'Loading your workout…'}</Text>
      {restored === owner && <Button title="Choose a workout" onPress={() => router.replace('/gym')}/>}</Card></View></Screen>;
  return <ActiveWorkout key={draft.requestKey} draft={draft} timeZone={timeZone} onSaved={setSummary}/>;
}

function ActiveWorkout({ draft, timeZone, onSaved }: { draft: GymDraft; timeZone: string; onSaved(summary: Summary): void }) {
  const router = useRouter(); const gym = useGym(); const action = useAction<Workout>();
  const { updateSet, addSet, removeSet, setNote, discard } = useGymWorkout();
  const { date: today } = useTodayClock(timeZone);
  const day = findProgramDay(draft.programId, draft.dayId);
  const history = useMemo(() => toLogged(gym.data?.workouts ?? []), [gym.data?.workouts]);
  const [now, setNow] = useState(Date.now()); const [rest, setRest] = useState<{ until: number; total: number }>();
  const [message, setMessage] = useState<string>(); const [confirmDiscard, setConfirmDiscard] = useState(false); const [howTo, setHowTo] = useState<string>();
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const restLeft = rest ? Math.ceil((rest.until - now) / 1000) : 0;
  useEffect(() => { if (rest && restLeft <= 0) { setRest(undefined); Vibration.vibrate(400); } }, [rest, restLeft]);
  const progress = draftProgress(draft);
  const toggle = (exercise: number, index: number, restSeconds: number) => {
    const done = !draft.exercises[exercise].sets[index].done;
    updateSet(exercise, index, { done });
    if (done) { const started = Date.now(); setNow(started); setRest({ until: started + restSeconds * 1000, total: restSeconds }); }
  };
  const finish = async () => {
    setMessage(undefined);
    let body;
    try { body = draftToWorkout(draft); } catch (error) { setMessage(error instanceof Error ? error.message : 'Check your sets.'); return; }
    try {
      const saved = await action.mutateAsync({ path: '/gym/workouts', body });
      const earlier = gym.data?.workouts ?? [];
      const week = gymWeek([...earlier.filter(item => item.id !== saved.id), saved], today, timeZone, gym.data?.enrollment?.weeklyTarget ?? 3);
      onSaved({ workout: saved, bests: personalBests(toLogged([saved])[0], toLogged(earlier.filter(item => item.id !== saved.id))), weekCount: week.count, weekTarget: week.target });
      discard();
    } catch (error) {
      // The draft and its save key stay, so retrying cannot create a duplicate.
      setMessage(error instanceof Error ? `${error.message} Your sets are kept on this device.` : 'Could not save. Your sets are kept on this device.');
    }
  };
  if (!day) return <Screen safeArea><View style={styles.content}><Card><Text style={styles.section}>This workout is no longer available.</Text>
    <Button title="Discard workout" tone="danger" onPress={() => { discard(); router.replace('/gym'); }}/></Card></View></Screen>;

  return <Screen safeArea><ScrollView contentContainerStyle={[styles.content, rest && styles.restPadding]} keyboardShouldPersistTaps="handled">
    <BackLink to="gym" onPress={() => router.replace('/gym')}/>
    <View style={styles.header}><View style={styles.flex}><Text style={styles.kicker}>WORKOUT IN PROGRESS</Text><Text accessibilityRole="header" style={styles.title}>{draft.title}</Text></View>
      <View style={styles.clock}><Ionicons name="stopwatch-outline" size={16} color={colors.moss}/><Text style={styles.clockText}>{formatDuration(now - Date.parse(draft.startedAt))}</Text></View></View>
    <View style={styles.bar}><View style={[styles.barFill, { width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }]}/></View>
    <Text style={styles.meta}>{progress.done} of {progress.total} sets done · tick a set to start the rest timer</Text>

    {draft.exercises.map((entry, exerciseIndex) => {
      const exercise = findGymExercise(entry.exerciseId), prescription = day.exercises.find(item => item.exerciseId === entry.exerciseId);
      if (!exercise || !prescription) return null;
      const last = lastPerformance(history, entry.exerciseId, draft.unit, timeZone);
      const advice = progressionAdvice(prescription, exercise, last, today, draft.unit), tone = adviceTone[advice.kind];
      const complete = entry.sets.every(set => set.done);
      return <View key={entry.exerciseId} style={[styles.exercise, complete && styles.exerciseDone]}>
        <View style={styles.row}><View style={styles.flex}><Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.meta}>{prescription.sets} × {prescription.repMin}–{prescription.repMax}{exercise.perSide ? ' per side' : ''} · rest {formatClock(prescription.restSeconds)}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`How to do ${exercise.name}`} accessibilityState={{ expanded: howTo === entry.exerciseId }} hitSlop={8}
            onPress={() => setHowTo(value => value === entry.exerciseId ? undefined : entry.exerciseId)}><Ionicons name="information-circle-outline" size={24} color={colors.moss}/></Pressable></View>
        {howTo === entry.exerciseId && <Text style={styles.cue}>{exercise.cue}</Text>}
        {last && <Text style={styles.last}>Last time · {shortDate(last.date)}: {formatSets(last.sets, draft.unit)}</Text>}
        <View style={styles.advice}><Ionicons name={tone.icon} size={18} color={tone.color}/><Text style={styles.adviceText}>{advice.message}</Text></View>
        <View style={styles.setHeader}><Text style={[styles.setLabel, styles.setNumber]}>SET</Text>
          {exercise.load !== 'bodyweight' && <Text style={[styles.setLabel, styles.inputCell]}>{exercise.load === 'added' ? `+${draft.unit.toUpperCase()}` : draft.unit.toUpperCase()}</Text>}
          <Text style={[styles.setLabel, styles.inputCell]}>REPS</Text><Text style={[styles.setLabel, styles.checkCell]}>DONE</Text></View>
        {entry.sets.map((set, index) => <View key={index} style={[styles.setRow, set.done && styles.setRowDone]}>
          <Text style={[styles.setIndex, styles.setNumber]}>{index + 1}</Text>
          {exercise.load !== 'bodyweight' && <TextInput accessibilityLabel={`${exercise.name} set ${index + 1} weight in ${draft.unit}`} value={set.weight} keyboardType="decimal-pad" maxLength={6}
            placeholder={exercise.load === 'added' ? '0' : '—'} placeholderTextColor={colors.faint} selectTextOnFocus
            onChangeText={value => updateSet(exerciseIndex, index, { weight: value })} style={[styles.input, styles.inputCell]}/>}
          <TextInput accessibilityLabel={`${exercise.name} set ${index + 1} reps`} value={set.reps} keyboardType="number-pad" maxLength={3} selectTextOnFocus
            onChangeText={value => updateSet(exerciseIndex, index, { reps: value })} style={[styles.input, styles.inputCell]}/>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`Set ${index + 1} of ${exercise.name} done`} accessibilityState={{ checked: set.done }} hitSlop={6}
            onPress={() => toggle(exerciseIndex, index, prescription.restSeconds)} style={[styles.check, styles.checkCell, set.done && styles.checkOn]}>
            <Ionicons name="checkmark" size={22} color={set.done ? colors.onAccent : colors.faint}/></Pressable>
        </View>)}
        <View style={styles.setActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Add a set to ${exercise.name}`} disabled={entry.sets.length >= 12} onPress={() => addSet(exerciseIndex)} hitSlop={6}><Text style={styles.link}>+ Add set</Text></Pressable>
          {entry.sets.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Remove the last set from ${exercise.name}`} onPress={() => removeSet(exerciseIndex)} hitSlop={6}><Text style={styles.linkMuted}>Remove set</Text></Pressable>}
        </View>
      </View>;
    })}

    <Text style={styles.label}>Notes (optional)</Text>
    <TextInput accessibilityLabel="Workout notes" value={draft.note} onChangeText={setNote} multiline maxLength={500} placeholder="How did it feel? Anything to remember next time?"
      placeholderTextColor={colors.muted} style={styles.note}/>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={action.isPending ? 'Saving…' : `Finish workout · ${progress.done} sets`} disabled={action.isPending || progress.done === 0} onPress={() => { void finish(); }}/>
    <Button title="Discard workout" tone="plain" disabled={action.isPending} onPress={() => setConfirmDiscard(true)}/>
  </ScrollView>
    {rest && <View style={styles.rest} accessibilityLiveRegion="polite">
      <View style={styles.restRing}><Text style={styles.restTime}>{formatClock(restLeft)}</Text></View>
      <View style={styles.flex}><Text style={styles.restTitle}>Rest</Text><Text style={styles.restMeta}>Breathe. Next set when the timer ends.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Add 30 seconds of rest" onPress={() => setRest(value => value && { ...value, until: value.until + 30_000 })} hitSlop={6}><Text style={styles.restAction}>+30s</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip rest" onPress={() => setRest(undefined)} hitSlop={6}><Text style={styles.restAction}>Skip</Text></Pressable>
    </View>}
    {confirmDiscard && <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmDiscard(false)}>
      <SafeAreaView style={styles.scrim}><Card><Text style={styles.section}>Discard this workout?</Text>
        <Text style={styles.meta}>Nothing from this session will be saved.</Text>
        <Button title="Discard workout" tone="danger" onPress={() => { discard(); router.replace('/gym'); }}/>
        <Button title="Keep training" tone="plain" onPress={() => setConfirmDiscard(false)}/></Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

function WorkoutSummary({ summary: { workout, bests, weekCount, weekTarget }, onDone }: { summary: Summary; onDone(): void }) {
  const sets = workout.exercises.reduce((total, entry) => total + entry.sets.length, 0), volume = workoutVolume(workout.exercises);
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.celebrate}><Ionicons name="trophy" size={48} color={colors.gold}/>
      <Text accessibilityRole="header" style={styles.title}>Workout saved!</Text>
      <Text style={styles.meta}>{workout.title} is in the books. {weekCount >= weekTarget ? 'Weekly goal reached — great consistency.' : `${weekCount} of ${weekTarget} workouts this week.`}</Text></View>
    <View style={styles.stats}>
      <Stat label="Time" value={formatDuration(Date.parse(workout.endedAt) - Date.parse(workout.startedAt))}/><Stat label="Sets" value={String(sets)}/>
      {volume > 0 && <Stat label="Volume" value={`${volume.toLocaleString()} ${workout.unit}`}/>}
    </View>
    {bests.length > 0 && <Card><Text style={styles.section}>New personal bests</Text>
      {bests.map(id => <View key={id} style={styles.best}><Ionicons name="medal-outline" size={20} color={colors.gold}/><Text style={styles.exerciseName}>{findGymExercise(id)?.name ?? id}</Text></View>)}
      <Text style={styles.meta}>Based on your estimated one-rep max compared with every earlier saved workout.</Text></Card>}
    <Card>{workout.exercises.map(entry => <Text key={entry.exerciseId} style={styles.meta}><Text style={styles.exerciseName}>{findGymExercise(entry.exerciseId)?.name}</Text>  {formatSets(entry.sets, workout.unit)}</Text>)}</Card>
    <Button title="Done" onPress={onDone}/>
  </ScrollView></Screen>;
}
const Stat = ({ label, value }: { label: string; value: string }) => <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' }, restPadding: { paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, flex: { flex: 1, gap: 2 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 }, title: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  section: { color: colors.ink, fontSize: 18, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 20 }, error: { color: colors.coral },
  clock: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.sage, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  clockText: { color: colors.moss, fontWeight: '800' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.sage, overflow: 'hidden' }, barFill: { height: 8, borderRadius: 4, backgroundColor: colors.moss },
  exercise: { gap: 8, padding: 14, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }, exerciseDone: { borderColor: colors.moss },
  exerciseName: { color: colors.ink, fontSize: 16, fontWeight: '800' }, cue: { color: colors.ink, lineHeight: 20, backgroundColor: colors.sage, padding: 10, borderRadius: 12 },
  last: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  advice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: colors.canvas }, adviceText: { color: colors.ink, flex: 1, lineHeight: 19, fontSize: 13 },
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }, setLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 4 }, setRowDone: { backgroundColor: colors.sage },
  setNumber: { width: 34 }, setIndex: { color: colors.ink, fontWeight: '800', textAlign: 'center' }, inputCell: { flex: 1, minWidth: 0 }, checkCell: { width: 52 },
  input: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, color: colors.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  check: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, checkOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  setActions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 }, link: { color: colors.moss, fontWeight: '800' }, linkMuted: { color: colors.muted, fontWeight: '700' },
  label: { color: colors.ink, fontWeight: '700', marginTop: 4 },
  note: { minHeight: 80, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, padding: 12, textAlignVertical: 'top' },
  rest: { position: 'absolute', left: 12, right: 12, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.ink,
    maxWidth: 736, alignSelf: 'center' },
  restRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: colors.moss, alignItems: 'center', justifyContent: 'center' },
  restTime: { color: colors.canvas, fontSize: 18, fontWeight: '900' }, restTitle: { color: colors.canvas, fontWeight: '800', fontSize: 16 }, restMeta: { color: colors.canvas, opacity: 0.8, fontSize: 12 },
  restAction: { color: colors.canvas, fontWeight: '800', paddingHorizontal: 6 },
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  celebrate: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  stats: { flexDirection: 'row', gap: 10 }, stat: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: colors.sage, gap: 2 },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: '900' }, statLabel: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  best: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
