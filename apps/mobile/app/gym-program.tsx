import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { GymUnit } from '@campusflow/contracts';
import { activeDays, estimateDayMinutes, estimateProgramMinutes, findGymProgram, resolveExercise, type GymExercise, type GymProgram, type TrainingProgram } from '@campusflow/domain';
import { BackLink, Button, Card, Screen, colors } from '@/components/ui';
import { useAction, useGym } from '@/features/queries';
import { audienceLabels, exerciseName, formatClock, goalLabels, levelText, ownGym, settingLabels } from '@/features/gym';
import { ExerciseAnimation, ExerciseThumb } from '@/features/exercise-media';

export default function GymProgramScreen() {
  const router = useRouter(); const { id } = useLocalSearchParams<{ id?: string }>(); const gym = useGym();
  const own = ownGym(gym.data);
  const catalog = typeof id === 'string' ? findGymProgram(id) : undefined;
  const program = catalog ?? own.programs.find(item => item.id === id);
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content}>
    <BackLink to="gym" onPress={() => router.replace('/gym')}/>
    {program ? <ProgramDetail key={program.id} program={program} catalog={catalog} own={own.exercises}/> : <Card>
      <Text style={styles.section}>{gym.isLoading ? 'Loading your program…' : 'This program is not available.'}</Text>
      {!gym.isLoading && <Button title="Browse programs" onPress={() => router.replace('/gym')}/>}</Card>}
  </ScrollView></Screen>;
}

function ProgramDetail({ program, catalog, own }: { program: TrainingProgram; catalog?: GymProgram; own: readonly GymExercise[] }) {
  const router = useRouter(); const gym = useGym(); const action = useAction();
  const enrollment = gym.data?.enrollment, current = enrollment?.programId === program.id;
  const days = activeDays(program);
  const [unit, setUnit] = useState<GymUnit>(enrollment?.unit ?? 'lb');
  const [target, setTarget] = useState(current ? enrollment.weeklyTarget : catalog?.daysPerWeek ?? Math.min(7, days.length));
  const [trackRir, setTrackRir] = useState(enrollment?.trackRir ?? false);
  const [open, setOpen] = useState<string>(); const [message, setMessage] = useState<string>();
  const run = async (request: Parameters<typeof action.mutateAsync>[0], done: () => void) => {
    setMessage(undefined);
    try { await action.mutateAsync(request); done(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save. Please try again.'); }
  };
  const save = () => run({ path: '/gym/enrollment', method: 'PUT', body: { programId: program.id, unit, weeklyTarget: target, trackRir } }, () => router.replace('/gym'));
  const leave = () => run({ path: '/gym/enrollment', method: 'DELETE' }, () => router.replace('/gym'));
  return <>
    <Text style={styles.kicker}>{catalog ? `${levelText(catalog).toUpperCase()} · ${audienceLabels[catalog.audience].toUpperCase()}` : 'YOUR PROGRAM'}</Text>
    <Text accessibilityRole="header" style={styles.title}>{program.name}</Text>
    {catalog && <Text style={styles.copy}>{catalog.description}</Text>}
    <View style={styles.facts}>
      <Fact label="Per week" value={`${catalog?.daysPerWeek ?? days.length} days`}/><Fact label="Session" value={`~${estimateProgramMinutes(program)} min`}/>
      {catalog && <><Fact label="Goal" value={goalLabels[catalog.goal]}/><Fact label="Where" value={settingLabels[catalog.setting]}/></>}
    </View>
    <Text style={styles.meta}>{catalog ? `Suggested schedule: ${catalog.schedule}. ` : ''}Missed a day? The next workout simply waits for you.</Text>
    {catalog ? <Button title="Customize as my own program" tone="plain" onPress={() => router.push({ pathname: '/program-editor', params: { from: catalog.id } })}/>
      : <Button title="Edit program" tone="plain" onPress={() => router.push({ pathname: '/program-editor', params: { id: program.id } })}/>}

    <Text accessibilityRole="header" style={styles.section}>Workouts</Text>
    {program.days.filter(day => !day.archived).map(day => <Card key={day.id}>
      <View style={styles.row}><Text style={styles.dayName}>{day.name}</Text><Text style={styles.meta}>~{estimateDayMinutes(day)} min</Text></View>
      {!!day.focus && <Text style={styles.meta}>{day.focus}</Text>}
      {!day.exercises.length && <Text style={styles.meta}>No exercises yet. Edit the program to add some.</Text>}
      {day.exercises.map(item => { const exercise = resolveExercise(item.exerciseId, own); const key = `${day.id}:${item.exerciseId}`;
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ expanded: open === key }}
          accessibilityLabel={`${exerciseName(item.exerciseId, own)}, ${item.sets} sets of ${item.repMin} to ${item.repMax}`}
          onPress={() => setOpen(value => value === key ? undefined : key)} style={styles.exercise}>
          <View style={styles.exerciseRow}><ExerciseThumb mediaId={exercise?.mediaId} size={40}/>
            <Text style={styles.exerciseName}>{exerciseName(item.exerciseId, own)}</Text>
            <Text style={styles.prescription}>{item.sets} × {item.repMin === item.repMax ? item.repMax : `${item.repMin}–${item.repMax}`}{exercise?.perSide ? ' / side' : ''}</Text></View>
          {open === key && <View style={styles.more}>
            <ExerciseAnimation mediaId={exercise?.mediaId} height={180}/>
            <Text style={styles.cue}>{[item.note, exercise?.cue].filter(Boolean).join(' ')} Rest {formatClock(item.restSeconds)} between sets.</Text>
          </View>}
        </Pressable>; })}
    </Card>)}

    {catalog && <Card><Text style={styles.section}>Good to know</Text>
      {catalog.tips.map(tip => <View key={tip} style={styles.tip}><Ionicons name="checkmark-circle-outline" size={18} color={colors.moss}/><Text style={styles.tipText}>{tip}</Text></View>)}
    </Card>}

    <Card><Text style={styles.section}>{current ? 'Your settings' : 'Set up your program'}</Text>
      <Text style={styles.label}>Weights in</Text>
      <View accessibilityRole="radiogroup" style={styles.segment}>{(['lb', 'kg'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: unit === value }}
        accessibilityLabel={value === 'lb' ? 'Pounds' : 'Kilograms'} onPress={() => setUnit(value)} style={[styles.segmentItem, unit === value && styles.segmentOn]}>
        <Text style={[styles.segmentText, unit === value && styles.segmentTextOn]}>{value === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</Text></Pressable>)}</View>
      <Text style={styles.label}>Weekly goal</Text>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fewer workouts per week" disabled={target <= 1} onPress={() => setTarget(value => Math.max(1, value - 1))} style={[styles.step, target <= 1 && styles.dim]}><Ionicons name="remove" size={20} color={colors.moss}/></Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.target}>{target} {target === 1 ? 'workout' : 'workouts'} / week</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="More workouts per week" disabled={target >= 7} onPress={() => setTarget(value => Math.min(7, value + 1))} style={[styles.step, target >= 7 && styles.dim]}><Ionicons name="add" size={20} color={colors.moss}/></Pressable>
      </View>
      <View style={styles.switchRow}><View style={styles.flex}><Text style={styles.label}>Track effort (RIR)</Text>
        <Text style={styles.meta}>Log reps in reserve per set: 0 means nothing left, 3 means three more were possible.</Text></View>
        <Switch accessibilityLabel="Track effort (RIR)" value={trackRir} onValueChange={setTrackRir} trackColor={{ true: colors.moss, false: colors.line }}/></View>
      {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
      {!gym.data && <Text style={styles.meta}>{gym.isLoading ? 'Loading your gym profile…' : 'Connect to choose a program.'}</Text>}
      <Button title={action.isPending ? 'Saving…' : current ? 'Save settings' : enrollment ? 'Switch to this program' : 'Start this program'} disabled={action.isPending || !gym.data} onPress={() => { void save(); }}/>
      {enrollment && !current && <Text style={styles.meta}>Your workout history stays. Only the upcoming plan changes.</Text>}
      {current && <Button title="Stop following this program" tone="plain" disabled={action.isPending} onPress={() => { void leave(); }}/>}
    </Card>
  </>;
}
const Fact = ({ label, value }: { label: string; value: string }) => <View style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>;

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 }, title: { color: colors.ink, fontSize: 30, fontWeight: '900', marginTop: -6 },
  copy: { color: colors.ink, lineHeight: 22, fontSize: 15 }, meta: { color: colors.muted, lineHeight: 20 }, section: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, flex: { flex: 1 },
  fact: { flexGrow: 1, flexBasis: '40%', padding: 12, borderRadius: 14, backgroundColor: colors.sage, gap: 2 },
  factLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' }, factValue: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, dayName: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  exercise: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, gap: 8 }, exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseName: { color: colors.ink, fontWeight: '600', flex: 1 }, prescription: { color: colors.moss, fontWeight: '800' },
  more: { gap: 8 }, cue: { color: colors.muted, lineHeight: 20 },
  tip: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, tipText: { color: colors.ink, flex: 1, lineHeight: 20 },
  label: { color: colors.ink, fontWeight: '700', marginTop: 4 },
  segment: { flexDirection: 'row', gap: 8 }, segmentItem: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.moss, borderColor: colors.moss }, segmentText: { color: colors.ink, fontWeight: '700' }, segmentTextOn: { color: colors.onAccent },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  target: { color: colors.ink, fontWeight: '800', fontSize: 16, flex: 1, textAlign: 'center' }, dim: { opacity: 0.4 }, error: { color: colors.coral },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
