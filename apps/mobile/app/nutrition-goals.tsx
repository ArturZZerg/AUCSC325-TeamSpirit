import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { nutritionProfileSchema, type NutritionProfileDto } from '@campusflow/contracts';
import { nutritionGoals, type Nutrients } from '@campusflow/domain';
import { BackLink, Button, Card, Screen, colors } from '@/components/ui';
import { useAction, useNutritionDay } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { useSessionStore } from '@/store/session';

const activities = [['sedentary', 'Mostly sitting'], ['light', 'Light: 1–2 workouts a week'], ['moderate', 'Moderate: 3–4 a week'], ['active', 'Active: 5–6 a week'], ['very', 'Very active: daily hard training']] as const;
const goalsList = [['lose', 'Lose fat'], ['maintain', 'Maintain'], ['gain', 'Build muscle']] as const;
const diningOptions = [['auto', 'Automatic'], ['on', 'Always show'], ['off', 'Hide']] as const;
const macroFields: [keyof Nutrients, string][] = [['kcal', 'Calories'], ['protein', 'Protein g'], ['carbs', 'Carbs g'], ['fat', 'Fat g'], ['fiber', 'Fiber g']];

function Choice<T extends string>({ options, value, onChange }: { options: readonly (readonly [T, string])[]; value: T | null; onChange(value: T): void }) {
  return <View accessibilityRole="radiogroup" style={styles.choices}>{options.map(([key, label]) => <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: value === key }}
    onPress={() => onChange(key)} style={[styles.chip, value === key && styles.chipOn]}><Text style={[styles.chipText, value === key && styles.chipTextOn]}>{label}</Text></Pressable>)}</View>;
}

/** Goals from Mifflin–St Jeor that the student can override, and the dining-hall setting (ADR 023). */
export default function NutritionGoalsScreen() {
  const router = useRouter(); const action = useAction();
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date: today } = useTodayClock(timeZone);
  const day = useNutritionDay(today);
  if (!day.data) return <Screen safeArea><View style={styles.content}><BackLink to="food" onPress={() => router.replace('/nutrition')}/><Text style={styles.meta}>Loading your settings…</Text></View></Screen>;
  return <Form key={day.data.accountId} initial={day.data.profile} weightKg={day.data.latestWeightKg} augustana={day.data.diningAvailable} year={Number(today.slice(0, 4))}
    saving={action.isPending} onSave={async profile => { await action.mutateAsync({ path: '/nutrition/profile', method: 'PUT', body: profile }); router.replace('/nutrition'); }}/>;
}

function Form({ initial, weightKg, augustana, year, saving, onSave }: { initial: NutritionProfileDto | null; weightKg: number | null; augustana: boolean; year: number; saving: boolean; onSave(profile: NutritionProfileDto): Promise<void> }) {
  const router = useRouter();
  const [profile, setProfile] = useState<NutritionProfileDto>(initial ?? { sex: null, birthYear: year - 20, heightCm: 170, activity: 'moderate', goal: 'maintain', overrides: null, diningHall: 'auto' });
  const [text, setText] = useState({ birthYear: String(profile.birthYear), heightCm: String(profile.heightCm) });
  const [overrides, setOverrides] = useState<Record<string, string>>(Object.fromEntries(Object.entries(profile.overrides ?? {}).map(([key, value]) => [key, String(value)])));
  const [message, setMessage] = useState<string>();
  const change = (next: Partial<NutritionProfileDto>) => setProfile(current => ({ ...current, ...next }));
  const parsedOverrides = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value.trim()).map(([key, value]) => [key, Number(value.replace(',', '.'))]));
  const draft = { ...profile, birthYear: Number(text.birthYear), heightCm: Number(text.heightCm.replace(',', '.')), overrides: Object.keys(parsedOverrides).length ? parsedOverrides : null };
  const preview = nutritionProfileSchema.safeParse(draft).success ? nutritionGoals(draft as NutritionProfileDto, weightKg, year) : null;
  const save = async () => {
    setMessage(undefined);
    const parsed = nutritionProfileSchema.safeParse(draft);
    if (!parsed.success) { setMessage('Check your year of birth, height and any custom numbers.'); return; }
    try { await onSave(parsed.data); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your goals.'); }
  };
  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <BackLink to="food" onPress={() => router.replace('/nutrition')}/>
    <Text style={styles.kicker}>FOOD</Text><Text accessibilityRole="header" style={styles.title}>Goals & settings</Text>
    <Card><Text style={styles.section}>About you</Text>
      <Text style={styles.label}>Formula</Text><Choice options={[['female', 'Female'], ['male', 'Male']] as const} value={profile.sex} onChange={sex => change({ sex })}/>
      <View style={styles.inputs}>
        <View style={styles.inputBox}><Text style={styles.metaSmall}>Year of birth</Text><TextInput accessibilityLabel="Year of birth" value={text.birthYear} keyboardType="number-pad" maxLength={4}
          onChangeText={birthYear => setText(current => ({ ...current, birthYear }))} style={styles.input}/></View>
        <View style={styles.inputBox}><Text style={styles.metaSmall}>Height (cm)</Text><TextInput accessibilityLabel="Height in centimetres" value={text.heightCm} keyboardType="decimal-pad" maxLength={5}
          onChangeText={heightCm => setText(current => ({ ...current, heightCm }))} style={styles.input}/></View>
      </View>
      <Text style={styles.meta}>{weightKg !== null ? `Weight: ${weightKg} kg from your latest weigh-in.` : 'Add a weigh-in in Gym → Progress; goals use your latest weight.'}</Text>
      <Text style={styles.label}>Activity</Text><Choice options={activities} value={profile.activity} onChange={activity => change({ activity })}/>
      <Text style={styles.label}>Goal</Text><Choice options={goalsList} value={profile.goal} onChange={goal => change({ goal })}/>
    </Card>
    <Card><Text style={styles.section}>Daily targets</Text>
      <Text style={styles.meta}>Calculated with the Mifflin–St Jeor formula; protein 1.8 g per kg. Type a number to set your own.</Text>
      <View style={styles.inputs}>{macroFields.map(([key, label]) => <View key={key} style={styles.inputBox}><Text style={styles.metaSmall}>{label}</Text>
        <TextInput accessibilityLabel={`Custom ${label}`} value={overrides[key] ?? ''} placeholder={preview ? String(preview[key]) : '–'} placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={5}
          onChangeText={value => setOverrides(current => ({ ...current, [key]: value }))} style={styles.input}/></View>)}</View>
    </Card>
    <Card><Text style={styles.section}>Augustana dining hall</Text>
      <Text style={styles.meta}>Shows the Wagner menu with calories and portion estimates. Automatic shows it when your courses are at Augustana (codes like AUCSC 325){augustana ? ' — it is on for you now' : ''}.</Text>
      <Choice options={diningOptions} value={profile.diningHall} onChange={diningHall => change({ diningHall })}/></Card>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={saving ? 'Saving…' : 'Save'} disabled={saving} onPress={() => { void save(); }}/>
    <Text style={styles.small}>For general guidance only, not medical advice.</Text>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
  kicker: { color: colors.moss, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 }, title: { color: colors.ink, fontSize: 28, fontWeight: '900', marginTop: -6 },
  section: { color: colors.ink, fontSize: 17, fontWeight: '800' }, label: { color: colors.ink, fontWeight: '700', marginTop: 4 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 18 }, metaSmall: { color: colors.muted, fontSize: 12, fontWeight: '600' }, small: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  error: { color: colors.coral }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '600' }, chipTextOn: { color: colors.onAccent },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, inputBox: { gap: 4, minWidth: 96, flexGrow: 1 },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, color: colors.ink, fontSize: 16, fontWeight: '700', paddingHorizontal: 12 },
});
