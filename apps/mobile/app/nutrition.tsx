import { useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { FoodEntry, SaveFoodEntry } from '@campusflow/contracts';
import { addCalendarDays, localClockAt, type Meal } from '@campusflow/domain';
import { BackLink, Button, Card, Screen, State, colors } from '@/components/ui';
import { useAction, useDiningMenu, useNutritionDay } from '@/features/queries';
import { useTodayClock } from '@/features/today-clock';
import { dayGoals, dayTotals, formatNumber, mealEntries, mealLabels, meals, rescaleEntry } from '@/features/nutrition';
import { PlateChart } from '@/features/plate-chart';
import { FoodSheet } from '@/features/food-sheet';
import { DiningHall } from '@/features/dining-hall';
import { useSessionStore } from '@/store/session';

const dayLabel = (date: string, today: string) => date === today ? 'Today' : date === addCalendarDays(today, -1) ? 'Yesterday'
  : new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

/** Calorie and macro diary (ADR 023). */
export default function NutritionScreen() {
  const router = useRouter(); const action = useAction();
  const timeZone = useSessionStore(state => state.session?.user.timeZone ?? 'UTC');
  const { date: today } = useTodayClock(timeZone);
  const [date, setDate] = useState(today);
  const day = useNutritionDay(date), yesterday = useNutritionDay(addCalendarDays(date, -1));
  const dining = useDiningMenu(date, !!day.data?.diningAvailable);
  const nowMinutes = (() => { const [hour, minute] = localClockAt(new Date().toISOString(), timeZone).time.split(':').map(Number); return hour * 60 + minute; })();
  const [adding, setAdding] = useState<Meal>(); const [editing, setEditing] = useState<FoodEntry>(); const [message, setMessage] = useState<string>();
  const entries = day.data?.entries ?? [], totals = dayTotals(entries), goals = dayGoals(day.data, Number(today.slice(0, 4)));
  const save = async (entry: SaveFoodEntry) => {
    setMessage(undefined);
    try { await action.mutateAsync({ path: '/nutrition/entries', body: entry }); setAdding(undefined); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add the food.'); return false; }
  };
  const run = async (request: Parameters<typeof action.mutateAsync>[0]) => {
    setMessage(undefined);
    try { await action.mutateAsync(request); setEditing(undefined); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the change.'); }
  };

  return <Screen safeArea><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={!!day.isRefetching} onRefresh={() => { void day.refetch(); }}/>}>
    <BackLink to="wellness" onPress={() => router.replace('/wellness')}/>
    <View style={styles.dateRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => setDate(current => addCalendarDays(current, -1))} hitSlop={8} style={styles.arrow}>
        <Ionicons name="chevron-back" size={22} color={colors.moss}/></Pressable>
      <Text accessibilityRole="header" style={styles.title}>{dayLabel(date, today)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next day" disabled={date >= today} onPress={() => setDate(current => addCalendarDays(current, 1))} hitSlop={8}
        style={[styles.arrow, date >= today && styles.dim]}><Ionicons name="chevron-forward" size={22} color={colors.moss}/></Pressable>
    </View>
    <State loading={day.isLoading} error={day.error}/>
    {message && !editing && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Card><PlateChart eaten={totals} goals={goals}/>
      {!goals && <View style={styles.setup}><Text style={styles.meta}>{day.data?.profile ? 'Log your body weight in Gym → Progress to calculate your goals.'
        : 'Set your goals to see how full each part of your plate should be.'}</Text>
        {!day.data?.profile && <Button title="Set my goals" onPress={() => router.push('/nutrition-goals')}/>}</View>}
      {goals && <Pressable accessibilityRole="button" onPress={() => router.push('/nutrition-goals')} hitSlop={6}><Text style={styles.link}>Goals & settings</Text></Pressable>}
    </Card>

    {meals.map(meal => { const items = mealEntries(entries, meal), subtotal = dayTotals(items), previous = mealEntries(yesterday.data?.entries ?? [], meal);
      return <Card key={meal}>
        <View style={styles.mealHead}><Text style={styles.section}>{mealLabels[meal]}</Text>
          {items.length > 0 && <Text style={styles.mealKcal}>{formatNumber(subtotal.kcal)} kcal</Text>}</View>
        {items.map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`Edit ${entry.name}`} onPress={() => setEditing(entry)} style={styles.entry}>
          <View style={styles.flex}><Text style={styles.entryName} numberOfLines={2}>{entry.name}</Text>
            <Text style={styles.meta}>{entry.source === 'quick' ? 'Quick add' : `${Math.round(entry.grams)} g`} · P {Math.round(entry.nutrients.protein)} · C {Math.round(entry.nutrients.carbs)} · F {Math.round(entry.nutrients.fat)}</Text></View>
          <Text style={styles.entryKcal}>{formatNumber(entry.nutrients.kcal)}</Text></Pressable>)}
        <View style={styles.mealActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Add food to ${mealLabels[meal].toLowerCase()}`} disabled={date > today} onPress={() => setAdding(meal)} style={styles.add}>
            <Ionicons name="add" size={18} color={colors.onAccent}/><Text style={styles.addText}>Add food</Text></Pressable>
          {!items.length && previous.length > 0 && <Pressable accessibilityRole="button" disabled={action.isPending}
            onPress={() => { void run({ path: '/nutrition/entries/copy', body: { fromDate: addCalendarDays(date, -1), fromMeal: meal, toDate: date, toMeal: meal } }); }}>
            <Text style={styles.link}>Repeat yesterday ({formatNumber(dayTotals(previous).kcal)} kcal)</Text></Pressable>}
        </View>
      </Card>; })}

    {day.data?.diningAvailable && dining.data && <DiningHall menu={dining.data} minutes={date === today ? nowMinutes : 12 * 60} date={date} saving={action.isPending} onAdd={save}/>}
  </ScrollView>
    {adding && <FoodSheet date={date} meal={adding} recent={day.data?.recent ?? []} saving={action.isPending} onAdd={save} onClose={() => setAdding(undefined)}/>}
    {editing && <EditEntry entry={editing} saving={action.isPending} message={message} onClose={() => setEditing(undefined)}
      onSave={(grams, meal) => { void run({ path: `/nutrition/entries/${editing.id}`, method: 'PATCH', body: { meal, ...(grams !== editing.grams ? rescaleEntry(editing, grams) : {}) } }); }}
      onDelete={() => { void run({ path: `/nutrition/entries/${editing.id}`, method: 'DELETE' }); }}/>}
  </Screen>;
}

function EditEntry({ entry, saving, message, onSave, onDelete, onClose }: { entry: FoodEntry; saving: boolean; message?: string; onSave(grams: number, meal: Meal): void; onDelete(): void; onClose(): void }) {
  const [grams, setGrams] = useState(String(Math.round(entry.grams * 10) / 10)); const [meal, setMeal] = useState<Meal>(entry.meal);
  const amount = Number(grams.replace(',', '.')), valid = Number.isFinite(amount) && amount > 0 && amount <= 5000;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><SafeAreaView style={styles.scrim}><Card>
    <Text style={styles.section}>{entry.name}</Text>
    {entry.source !== 'quick' && <View style={styles.gramsRow}><Text style={styles.meta}>Amount</Text>
      <TextInput accessibilityLabel="Amount in grams" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" maxLength={6} selectTextOnFocus style={styles.grams}/>
      <Text style={styles.meta}>g · {valid ? formatNumber(entry.nutrients.kcal * amount / entry.grams) : '–'} kcal</Text></View>}
    <View style={styles.chips}>{meals.map(item => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: meal === item }} onPress={() => setMeal(item)}
      style={[styles.chip, meal === item && styles.chipOn]}><Text style={[styles.chipText, meal === item && styles.chipTextOn]}>{mealLabels[item]}</Text></Pressable>)}</View>
    {message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={saving ? 'Saving…' : 'Save'} disabled={saving || !valid} onPress={() => onSave(entry.source === 'quick' ? entry.grams : amount, meal)}/>
    <Button title="Remove" tone="danger" disabled={saving} onPress={onDelete}/>
    <Button title="Cancel" tone="plain" onPress={onClose}/>
  </Card></SafeAreaView></Modal>;
}


const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900' }, dim: { opacity: 0.35 }, error: { color: colors.coral },
  section: { color: colors.ink, fontSize: 17, fontWeight: '800' }, meta: { color: colors.muted, fontSize: 13, lineHeight: 18 }, flex: { flex: 1, gap: 2 },
  setup: { gap: 8, marginTop: 8 }, link: { color: colors.moss, fontWeight: '800', marginTop: 6 },
  mealHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, mealKcal: { color: colors.ink, fontWeight: '800' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  entryName: { color: colors.ink, fontWeight: '600' }, entryKcal: { color: colors.ink, fontWeight: '800' },
  mealActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 4 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.moss, borderRadius: 16, paddingHorizontal: 12, minHeight: 34 }, addText: { color: colors.onAccent, fontWeight: '800' },
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grams: { minWidth: 80, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, color: colors.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '600' }, chipTextOn: { color: colors.onAccent },
});
