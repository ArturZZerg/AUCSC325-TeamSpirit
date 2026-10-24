import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { bodyWeightTrend, exerciseHistory, gymWeek, muscles, personalRecords, trainingHeatmap, weeklyMuscleSets } from '@campusflow/domain';
import { BackLink, Button, Card, Screen, State, colors } from '@/components/ui';
import { useAction, useGym } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { ownGym, toLogged } from '@/features/gym';
import { muscleLabels } from '@/features/exercise-picker';
import { Heatmap, LineChart, MuscleBars } from '@/features/charts';
import { useSessionStore } from '@/store/session';

const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value)}`;

/** Statistics derived on the device from saved workouts and weigh-ins (ADR 022). */
export default function GymStatsScreen() {
  const router = useRouter(); const gym = useGym(); const action = useAction();
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date: today } = useTodayClock(timeZone);
  const unit = gym.data?.enrollment?.unit ?? 'kg';
  const own = useMemo(() => ownGym(gym.data), [gym.data]);
  const logged = useMemo(() => toLogged(gym.data?.workouts ?? []), [gym.data?.workouts]);
  const records = useMemo(() => personalRecords(logged, unit, timeZone, own.exercises), [logged, unit, timeZone, own.exercises]);
  const [chosen, setChosen] = useState<string>(); const exerciseId = chosen ?? records[0]?.exerciseId;
  const history = useMemo(() => exerciseId ? exerciseHistory(logged, exerciseId, unit, timeZone) : [], [logged, exerciseId, unit, timeZone]);
  const week = gymWeek(logged, today, timeZone, gym.data?.enrollment?.weeklyTarget ?? 3);
  const sets = weeklyMuscleSets(logged, week.from, timeZone, own.exercises);
  const trend = bodyWeightTrend(gym.data?.bodyWeights ?? [], unit);
  const todayWeight = gym.data?.bodyWeights.find(entry => entry.date === today);
  const [weight, setWeight] = useState(''); const [message, setMessage] = useState<string>();
  const recent = logged.filter(workout => Date.parse(workout.endedAt) >= Date.now() - 30 * 86400_000).length;
  // Estimated 1RM needs loaded sets; sessions without load are skipped, and fewer than two loaded sessions fall back to reps.
  const loadedPoints = history.filter(point => point.bestOneRepMax !== null);
  const loaded = loadedPoints.length >= 2;
  const record = records.find(item => item.exerciseId === exerciseId);

  const saveWeight = async () => {
    setMessage(undefined);
    const value = Number(weight.replace(',', '.'));
    if (!Number.isFinite(value) || value < 20 || value > 1000) { setMessage('Enter your weight, for example 72.4.'); return; }
    try { await action.mutateAsync({ path: `/gym/body-weight/${today}`, method: 'PUT', body: { weight: Math.round(value * 10) / 10, unit } }); setWeight(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your weight.'); }
  };

  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <BackLink to="gym" onPress={() => router.replace('/gym')}/>
    <Text style={styles.kicker}>YOUR TRAINING</Text><Text accessibilityRole="header" style={styles.title}>Progress</Text>
    <State loading={gym.isLoading} error={gym.error}/>
    <View style={styles.tiles}>
      <Tile value={String(recent)} label="Workouts · 30 days"/><Tile value={String(week.days.reduce((sum, day) => sum + day.workouts, 0))} label="This week"/>
      <Tile value={String(week.streakWeeks)} label="Week streak" icon/>
    </View>

    <Card><Text style={styles.section}>Body weight</Text>
      {trend.latest !== null ? <Text style={styles.meta}>Latest {trend.latest} {unit}{trend.change30 !== null ? ` · ${signed(trend.change30)} ${unit} over 30 days (7-day average)` : ''}</Text>
        : <Text style={styles.meta}>Log your weight a few mornings a week; the 7-day average smooths out daily swings.</Text>}
      <LineChart points={trend.points.slice(-90).map(point => ({ date: point.date, value: point.average, secondary: point.weight }))} unit={unit}
        label="7-day average" secondaryLabel="Weigh-in"/>
      <View style={styles.weightRow}>
        <TextInput accessibilityLabel={`Today's weight in ${unit}`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={6}
          placeholder={todayWeight ? `${todayWeight.weight}` : `Today's weight`} placeholderTextColor={colors.muted} style={styles.weightInput}/>
        <Text style={styles.unit}>{unit}</Text>
        <Pressable accessibilityRole="button" disabled={action.isPending || !weight.trim()} onPress={() => { void saveWeight(); }}
          style={[styles.save, (action.isPending || !weight.trim()) && styles.dim]}><Text style={styles.saveText}>{todayWeight ? 'Update' : 'Save'}</Text></Pressable>
      </View>
      {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    </Card>

    <Card><Text style={styles.section}>Training calendar</Text><Text style={styles.meta}>Last 16 weeks · darker means more sets</Text>
      <Heatmap weeks={trainingHeatmap(logged, today, timeZone, 16)} today={today}/></Card>

    <Card><Text style={styles.section}>This week by muscle</Text>
      <Text style={styles.meta}>Sets per muscle since Monday. Most people grow well with about 10–20 a week (shaded zone).</Text>
      {Object.keys(sets).length ? <MuscleBars rows={muscles.filter(muscle => sets[muscle]).map(muscle => ({ label: muscleLabels[muscle], value: sets[muscle]! }))
        .sort((a, b) => b.value - a.value)}/> : <Text style={styles.meta}>No sets yet this week.</Text>}
    </Card>

    <Card><Text style={styles.section}>Exercise progress</Text>
      {!records.length && <Text style={styles.meta}>Finish a workout to start tracking your lifts.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chips}>
        {records.slice(0, 20).map(item => { const on = item.exerciseId === exerciseId;
          return <Pressable key={item.exerciseId} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setChosen(item.exerciseId)}
            style={[styles.chip, on && styles.chipOn]}><Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{item.name}</Text></Pressable>; })}
      </ScrollView>
      {record && <Text style={styles.meta}>Best set: {record.weight !== null ? `${record.weight} ${unit} × ${record.reps}` : `${record.reps} reps`}
        {record.oneRepMax !== null ? ` · estimated 1RM ${record.oneRepMax} ${unit}` : ''} · {shortDate(record.date)}</Text>}
      {history.length > 0 && <LineChart points={loaded ? loadedPoints.map(point => ({ date: point.date, value: point.bestOneRepMax! }))
        : history.map(point => ({ date: point.date, value: point.bestReps }))} unit={loaded ? unit : 'reps'} label={loaded ? 'Estimated 1RM' : 'Most reps in a set'}/>}
      {history.length > 0 && <Text style={styles.meta}>{loaded ? 'Estimated one-rep max from your best set each session.' : 'Most reps in one set each session.'}</Text>}
      {history.length === 1 && <Text style={styles.meta}>One more session and the trend line appears.</Text>}
    </Card>

    {records.length > 0 && <Card><Text style={styles.section}>Personal records</Text>
      {records.slice(0, 12).map(item => <Pressable key={item.exerciseId} accessibilityRole="button" onPress={() => setChosen(item.exerciseId)} style={styles.record}>
        <Ionicons name="medal-outline" size={18} color={colors.gold}/><Text style={styles.recordName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.recordValue}>{item.weight !== null && item.weight > 0 ? `${item.weight} × ${item.reps}` : `${item.reps} reps`}</Text></Pressable>)}
    </Card>}
    {!gym.data && !gym.isLoading && <Button title="Try again" onPress={() => { void gym.refetch(); }}/>}
  </ScrollView></Screen>;
}

const Tile = ({ value, label, icon }: { value: string; label: string; icon?: boolean }) => <View style={styles.tile}>
  <View style={styles.tileValueRow}>{icon && <Ionicons name="flame" size={18} color={colors.streak}/>}<Text style={styles.tileValue}>{value}</Text></View>
  <Text style={styles.tileLabel}>{label}</Text></View>;

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 }, title: { color: colors.ink, fontSize: 30, fontWeight: '900', marginTop: -6 },
  section: { color: colors.ink, fontSize: 18, fontWeight: '800' }, meta: { color: colors.muted, lineHeight: 19, fontSize: 13 }, error: { color: colors.coral },
  tiles: { flexDirection: 'row', gap: 10 }, tile: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 2 },
  tileValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, tileValue: { color: colors.ink, fontSize: 24, fontWeight: '900' }, tileLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  weightInput: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, color: colors.ink, fontSize: 16, paddingHorizontal: 12 },
  unit: { color: colors.muted, fontWeight: '700' }, save: { backgroundColor: colors.moss, borderRadius: 12, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  saveText: { color: colors.onAccent, fontWeight: '800' }, dim: { opacity: 0.5 },
  chipScroller: { flexGrow: 0, flexShrink: 0, height: 44 }, chips: { gap: 8, alignItems: 'center' },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', maxWidth: 220 },
  chipOn: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '600' }, chipTextOn: { color: colors.onAccent },
  record: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
  recordName: { color: colors.ink, flex: 1, fontWeight: '600' }, recordValue: { color: colors.ink, fontWeight: '800' },
});
