import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { saveUserProgramSchema, userProgramSchema, type SaveUserProgram, type UserProgram } from '@campusflow/contracts';
import { findGymProgram, resolveExercise, type GymExercise } from '@campusflow/domain';
import { BackLink, Button, Card, Field, Screen, colors } from '@/components/ui';
import { useAction, useGym } from '@/features/queries';
import { exerciseName, formatClock, ownGym } from '@/features/gym';
import { ExercisePicker } from '@/features/exercise-picker';
import { ExerciseThumb } from '@/features/exercise-media';

type Draft = SaveUserProgram;
type Day = Draft['days'][number];
const dayId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blankDay = (index: number): Day => ({ id: dayId(), name: `Day ${index + 1}`, focus: '', exercises: [] });
const move = <T,>(list: readonly T[], from: number, to: number) => {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
};

export default function ProgramEditorScreen() {
  const router = useRouter(); const gym = useGym();
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const existing = gym.data?.programs.find(program => program.id === id);
  if (id && !existing) return <Screen safeArea><View style={styles.content}><BackLink to="gym" onPress={() => router.replace('/gym')}/>
    <Card><Text style={styles.section}>{gym.isLoading ? 'Loading your program…' : 'This program is not available.'}</Text></Card></View></Screen>;
  const template = typeof from === 'string' ? findGymProgram(from) : undefined;
  const initial: Draft = existing ? { name: existing.name, days: existing.days }
    : template ? { name: `My ${template.name}`, days: template.days.map(day => ({ ...day, exercises: day.exercises.map(item => ({ ...item })) })) }
    : { name: '', days: [blankDay(0)] };
  return <Editor key={existing?.id ?? template?.id ?? 'new'} programId={existing?.id} initial={initial} own={ownGym(gym.data).exercises}/>;
}

function Editor({ programId, initial, own }: { programId?: string; initial: Draft; own: readonly GymExercise[] }) {
  const router = useRouter(); const action = useAction<UserProgram>();
  const [draft, setDraft] = useState<Draft>(initial); const [open, setOpen] = useState<string>();
  const [picking, setPicking] = useState<{ day: number; replace?: number }>(); const [message, setMessage] = useState<string>(); const [confirm, setConfirm] = useState(false);
  const [known, setKnown] = useState<GymExercise[]>([]);
  const all = [...own, ...known];
  const editDay = (index: number, change: (day: Day) => Day) => setDraft(current => ({ ...current, days: current.days.map((day, position) => position === index ? change(day) : day) }));
  const editExercise = (day: number, index: number, change: Partial<Day['exercises'][number]>) =>
    editDay(day, current => ({ ...current, exercises: current.exercises.map((item, position) => position === index ? { ...item, ...change } : item) }));
  const activeCount = draft.days.filter(day => !day.archived).length;
  const save = async () => {
    setMessage(undefined);
    const body = saveUserProgramSchema.safeParse({ ...draft, name: draft.name.trim() });
    if (!body.success) { setMessage(body.error.issues[0].message); return; }
    try {
      const saved = userProgramSchema.parse(await action.mutateAsync({ path: programId ? `/gym/programs/${programId}` : '/gym/programs', method: programId ? 'PUT' : 'POST', body: body.data }));
      router.replace({ pathname: '/gym-program', params: { id: saved.id } });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the program.'); }
  };
  const remove = async () => {
    try { await action.mutateAsync({ path: `/gym/programs/${programId}`, method: 'DELETE' }); router.replace('/gym'); }
    catch (error) { setConfirm(false); setMessage(error instanceof Error ? error.message : 'Could not delete the program.'); }
  };

  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <BackLink to="gym" onPress={() => router.replace('/gym')}/>
    <Text style={styles.kicker}>{programId ? 'EDIT PROGRAM' : 'NEW PROGRAM'}</Text>
    <Field label="Program name" value={draft.name} onChangeText={name => setDraft(current => ({ ...current, name }))} placeholder="e.g. My Push / Pull / Legs"/>
    <Text style={styles.meta}>Days run in order: after your last workout, the next active day comes up. Archived days stay in your history.</Text>
    {draft.days.map((day, dayIndex) => <Card key={day.id}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayNumber}>{day.archived ? 'ARCHIVED' : `DAY ${draft.days.slice(0, dayIndex + 1).filter(item => !item.archived).length}`}</Text>
        <View style={styles.icons}>
          <Icon name="arrow-up" label={`Move ${day.name} up`} disabled={dayIndex === 0} onPress={() => setDraft(current => ({ ...current, days: move(current.days, dayIndex, dayIndex - 1) }))}/>
          <Icon name="arrow-down" label={`Move ${day.name} down`} disabled={dayIndex === draft.days.length - 1} onPress={() => setDraft(current => ({ ...current, days: move(current.days, dayIndex, dayIndex + 1) }))}/>
          <Icon name={day.archived ? 'archive' : 'archive-outline'} label={day.archived ? `Restore ${day.name}` : `Archive ${day.name}`}
            disabled={!day.archived && activeCount <= 1} onPress={() => editDay(dayIndex, current => ({ ...current, archived: !current.archived || undefined }))}/>
          <Icon name="trash-outline" label={`Delete ${day.name}`} disabled={draft.days.length <= 1 || (!day.archived && activeCount <= 1)}
            onPress={() => setDraft(current => ({ ...current, days: current.days.filter((_, position) => position !== dayIndex) }))}/>
        </View>
      </View>
      <Field label="Day name" value={day.name} onChangeText={name => editDay(dayIndex, current => ({ ...current, name }))}/>
      <Field label="Focus (optional)" value={day.focus} onChangeText={focus => editDay(dayIndex, current => ({ ...current, focus }))} placeholder="e.g. Chest, shoulders and triceps"/>
      {day.exercises.map((item, index) => { const key = `${day.id}:${index}`, expanded = open === key, exercise = resolveExercise(item.exerciseId, all);
        return <View key={key} style={styles.exercise}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`Edit ${exerciseName(item.exerciseId, all)}`}
            onPress={() => setOpen(current => current === key ? undefined : key)} style={styles.exerciseRow}>
            <ExerciseThumb mediaId={exercise?.mediaId} size={44}/>
            <View style={styles.flex}><Text style={styles.exerciseName}>{exerciseName(item.exerciseId, all)}</Text>
              <Text style={styles.meta}>{item.sets} × {item.repMin === item.repMax ? item.repMax : `${item.repMin}–${item.repMax}`} · rest {formatClock(item.restSeconds)}</Text></View>
            <Ionicons name={expanded ? 'chevron-up' : 'create-outline'} size={20} color={colors.moss}/>
          </Pressable>
          {expanded && <View style={styles.settings}>
            <Stepper label="Sets" value={item.sets} min={1} max={10} onChange={sets => editExercise(dayIndex, index, { sets })}/>
            <Stepper label="Reps from" value={item.repMin} min={1} max={item.repMax} onChange={repMin => editExercise(dayIndex, index, { repMin })}/>
            <Stepper label="Reps to" value={item.repMax} min={item.repMin} max={100} onChange={repMax => editExercise(dayIndex, index, { repMax })}/>
            <Stepper label="Rest" value={item.restSeconds} min={0} max={600} step={15} format={formatClock} onChange={restSeconds => editExercise(dayIndex, index, { restSeconds })}/>
            <Field label="Note for this day (optional)" value={item.note ?? ''} multiline onChangeText={note => editExercise(dayIndex, index, { note: note || null })}/>
            <View style={styles.links}>
              <Link label="Move up" disabled={index === 0} onPress={() => editDay(dayIndex, current => ({ ...current, exercises: move(current.exercises, index, index - 1) }))}/>
              <Link label="Move down" disabled={index === day.exercises.length - 1} onPress={() => editDay(dayIndex, current => ({ ...current, exercises: move(current.exercises, index, index + 1) }))}/>
              <Link label="Swap" onPress={() => setPicking({ day: dayIndex, replace: index })}/>
              <Link label="Remove" danger onPress={() => { setOpen(undefined); editDay(dayIndex, current => ({ ...current, exercises: current.exercises.filter((_, position) => position !== index) })); }}/>
            </View>
          </View>}
        </View>; })}
      <Pressable accessibilityRole="button" disabled={day.exercises.length >= 20} onPress={() => setPicking({ day: dayIndex })} style={styles.add}>
        <Ionicons name="add" size={20} color={colors.moss}/><Text style={styles.addText}>Add exercise</Text></Pressable>
    </Card>)}
    <Button title="Add a day" tone="plain" disabled={draft.days.length >= 14} onPress={() => setDraft(current => ({ ...current, days: [...current.days, blankDay(current.days.length)] }))}/>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={action.isPending ? 'Saving…' : 'Save program'} disabled={action.isPending} onPress={() => { void save(); }}/>
    {programId && <Button title="Delete program" tone="plain" disabled={action.isPending} onPress={() => setConfirm(true)}/>}
  </ScrollView>
    {picking && <ExercisePicker own={all} title={picking.replace === undefined ? 'Add exercise' : 'Swap exercise'}
      exclude={draft.days[picking.day].exercises.map(item => item.exerciseId)} onClose={() => setPicking(undefined)} onPick={exercise => {
        setKnown(current => current.some(item => item.id === exercise.id) || own.some(item => item.id === exercise.id) ? current : [...current, exercise]);
        editDay(picking.day, current => picking.replace === undefined
          ? { ...current, exercises: [...current.exercises, { exerciseId: exercise.id, sets: 3, repMin: 8, repMax: 12, restSeconds: 90 }] }
          : { ...current, exercises: current.exercises.map((item, position) => position === picking.replace ? { ...item, exerciseId: exercise.id } : item) });
        setPicking(undefined);
      }}/>}
    {confirm && <Modal visible transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
      <SafeAreaView style={styles.scrim}><Card><Text style={styles.section}>Delete this program?</Text>
        <Text style={styles.meta}>Your saved workouts stay in your history and statistics. Only the plan is removed.</Text>
        <Button title={action.isPending ? 'Deleting…' : 'Delete program'} tone="danger" disabled={action.isPending} onPress={() => { void remove(); }}/>
        <Button title="Keep program" tone="plain" onPress={() => setConfirm(false)}/></Card></SafeAreaView>
    </Modal>}
  </Screen>;
}

function Icon({ name, label, disabled, onPress }: { name: React.ComponentProps<typeof Ionicons>['name']; label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={6}
    style={[styles.icon, disabled && styles.dim]}><Ionicons name={name} size={18} color={colors.moss}/></Pressable>;
}
function Link({ label, danger, disabled, onPress }: { label: string; danger?: boolean; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} hitSlop={6}><Text style={[styles.link, danger && styles.danger, disabled && styles.dim]}>{label}</Text></Pressable>;
}
function Stepper({ label, value, min, max, step = 1, format = String, onChange }: { label: string; value: number; min: number; max: number; step?: number; format?: (value: number) => string; onChange(value: number): void }) {
  return <View style={styles.stepper}><Text style={styles.stepLabel}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - step))} style={[styles.stepButton, value <= min && styles.dim]}>
      <Ionicons name="remove" size={18} color={colors.moss}/></Pressable>
    <Text accessibilityLabel={`${label} ${format(value)}`} style={styles.stepValue}>{format(value)}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} disabled={value >= max} onPress={() => onChange(Math.min(max, value + step))} style={[styles.stepButton, value >= max && styles.dim]}>
      <Ionicons name="add" size={18} color={colors.moss}/></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 }, section: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  meta: { color: colors.muted, lineHeight: 19, fontSize: 13 }, flex: { flex: 1, gap: 2 }, error: { color: colors.coral },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dayNumber: { color: colors.moss, fontWeight: '900', letterSpacing: 0.6, fontSize: 12 },
  icons: { flexDirection: 'row', gap: 6 }, icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  exercise: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }, exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseName: { color: colors.ink, fontWeight: '700' }, settings: { gap: 8, paddingTop: 10 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 2 }, link: { color: colors.moss, fontWeight: '800' }, danger: { color: colors.danger },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 }, addText: { color: colors.moss, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 }, stepLabel: { color: colors.ink, fontWeight: '600', flex: 1 },
  stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepValue: { color: colors.ink, fontWeight: '800', minWidth: 48, textAlign: 'center', fontSize: 16 }, dim: { opacity: 0.35 },
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
});
