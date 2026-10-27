import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveUserExerciseSchema, userExerciseSchema, type UserExercise } from '@campusflow/contracts';
import { muscles, searchExercises, type Equipment, type GymExercise, type LoadKind, type Muscle } from '@campusflow/domain';
import { Button, Field, colors } from '@/components/ui';
import { useAction } from './queries';
import { ExerciseThumb } from './exercise-media';
import { SheetModal } from '@/components/sheet-modal';

export const muscleLabels: Record<Muscle, string> = { chest: 'Chest', back: 'Back', traps: 'Traps', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  forearms: 'Forearms', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', adductors: 'Inner thighs', calves: 'Calves', core: 'Core' };
export const equipmentLabels: Record<Equipment, string> = { barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell', band: 'Band', other: 'Other' };
const equipmentOptions: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'];
const loadLabels: Record<LoadKind, string> = { external: 'Weights', added: 'Bodyweight + optional weight', bodyweight: 'Bodyweight only' };

function Chips<T extends string>({ label, values, labels, selected, onToggle }: { label: string; values: readonly T[]; labels: Record<T, string>; selected: readonly T[]; onToggle(value: T): void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} style={styles.chipScroller} contentContainerStyle={styles.chips}>
    {values.map(value => { const on = selected.includes(value);
      return <Pressable key={value} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={labels[value]} onPress={() => onToggle(value)}
        style={[styles.chip, on && styles.chipOn]}><Text style={[styles.chipText, on && styles.chipTextOn]}>{labels[value]}</Text></Pressable>; })}
  </ScrollView>;
}

/** Full-screen search over own, built-in and library exercises (ADR 022). */
export function ExercisePicker({ own, exclude = [], title = 'Add exercise', onPick, onClose }: {
  own: readonly GymExercise[]; exclude?: readonly string[]; title?: string; onPick(exercise: GymExercise): void; onClose(): void;
}) {
  const [query, setQuery] = useState(''); const [muscle, setMuscle] = useState<Muscle>(); const [equipment, setEquipment] = useState<Equipment>();
  const [creating, setCreating] = useState(false);
  const results = useMemo(() => searchExercises({ query, muscle, equipment }, own, 60).filter(item => !exclude.includes(item.id)), [query, muscle, equipment, own, exclude]);
  const ownIds = new Set(own.map(item => item.id));
  return <SheetModal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{creating ? 'New exercise' : title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={creating ? () => setCreating(false) : onClose} hitSlop={10}><Ionicons name="close" size={26} color={colors.ink}/></Pressable></View>
    {creating ? <CreateExercise initialName={query} onCreated={exercise => { setCreating(false); onPick(exercise); }}/> : <>
      <View style={styles.search}><Ionicons name="search" size={18} color={colors.muted}/>
        <TextInput accessibilityLabel="Search exercises" value={query} onChangeText={setQuery} placeholder="Search 870+ exercises" placeholderTextColor={colors.muted}
          autoCorrect={false} style={styles.searchInput}/></View>
      <Chips label="Muscle" values={muscles} labels={muscleLabels} selected={muscle ? [muscle] : []} onToggle={value => setMuscle(current => current === value ? undefined : value)}/>
      <Chips label="Equipment" values={equipmentOptions} labels={equipmentLabels} selected={equipment ? [equipment] : []} onToggle={value => setEquipment(current => current === value ? undefined : value)}/>
      <FlatList data={results} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
        ListHeaderComponent={<Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={styles.create}>
          <Ionicons name="add-circle-outline" size={22} color={colors.moss}/><Text style={styles.createText}>Create your own exercise{query.trim() ? ` “${query.trim()}”` : ''}</Text></Pressable>}
        ListEmptyComponent={<Text style={styles.meta}>No exercise matches. Try fewer words or create your own.</Text>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${item.name}`} onPress={() => onPick(item)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <ExerciseThumb mediaId={item.mediaId} size={52}/>
          <View style={styles.rowText}><Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{equipmentLabels[item.equipment]} · {item.muscles.map(value => muscleLabels[value]).join(', ')}</Text></View>
          {ownIds.has(item.id) && <View style={styles.badge}><Text style={styles.badgeText}>Yours</Text></View>}
        </Pressable>}/>
    </>}
  </SafeAreaView></SheetModal>;
}

function CreateExercise({ initialName, onCreated }: { initialName: string; onCreated(exercise: GymExercise): void }) {
  const action = useAction<UserExercise>();
  const [name, setName] = useState(initialName.trim()); const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  const [load, setLoad] = useState<LoadKind>('external'); const [picked, setPicked] = useState<Muscle[]>([]); const [note, setNote] = useState('');
  const [message, setMessage] = useState<string>();
  const save = async () => {
    setMessage(undefined);
    const body = saveUserExerciseSchema.safeParse({ name, equipment, load, muscles: picked, note: note.trim() || null, mediaId: null });
    if (!body.success) { setMessage(body.error.issues[0].message); return; }
    try {
      const saved = userExerciseSchema.parse(await action.mutateAsync({ path: '/gym/exercises', body: body.data }));
      onCreated({ id: saved.id, name: saved.name, equipment: saved.equipment, load: saved.load, muscles: saved.muscles, cue: saved.note ?? '' });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the exercise.'); }
  };
  return <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Wrist roller"/>
    <Text style={styles.label}>Equipment</Text>
    <Chips label="Equipment" values={equipmentOptions} labels={equipmentLabels} selected={[equipment]} onToggle={value => { setEquipment(value); if (value === 'bodyweight') setLoad('added'); }}/>
    <Text style={styles.label}>How do you log it?</Text>
    <Chips label="Load" values={['external', 'added', 'bodyweight'] as const} labels={loadLabels} selected={[load]} onToggle={setLoad}/>
    <Text style={styles.label}>Muscles worked</Text>
    <Chips label="Muscles" values={muscles} labels={muscleLabels} selected={picked}
      onToggle={value => setPicked(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value].slice(0, 6))}/>
    <Field label="Technique note (optional)" value={note} onChangeText={setNote} multiline placeholder="Cues you want to see while training"/>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={action.isPending ? 'Saving…' : 'Save exercise'} disabled={action.isPending} onPress={() => { void save(); }}/>
  </ScrollView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  searchInput: { flex: 1, color: colors.ink, fontSize: 16, minHeight: 44 },
  chipScroller: { flexGrow: 0, flexShrink: 0, height: 48 }, chips: { gap: 8, paddingHorizontal: 16, alignItems: 'center' },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '600' }, chipTextOn: { color: colors.onAccent },
  list: { padding: 16, gap: 8, paddingBottom: 40 },
  create: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.moss, marginBottom: 4 },
  createText: { color: colors.moss, fontWeight: '800', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  rowText: { flex: 1, gap: 2 }, name: { color: colors.ink, fontWeight: '700', fontSize: 15 }, meta: { color: colors.muted, fontSize: 13 }, pressed: { opacity: 0.75 },
  badge: { backgroundColor: colors.sage, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }, badgeText: { color: colors.moss, fontWeight: '800', fontSize: 12 },
  form: { padding: 16, gap: 10, paddingBottom: 40 }, label: { color: colors.ink, fontWeight: '700', marginTop: 4 }, error: { color: colors.coral },
});
