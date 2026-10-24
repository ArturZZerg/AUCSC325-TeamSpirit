import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DiningDish, DiningMenu, SaveFoodEntry } from '@campusflow/contracts';
import type { Meal } from '@campusflow/domain';
import { Button, Card, colors } from '@/components/ui';
import { diningEntry, diningPortion, formatNumber, mealLabels, servingSteps } from './nutrition';

const clock = (minutes: number) => { const hour = Math.floor(minutes / 60), suffix = hour >= 12 ? 'pm' : 'am';
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')}${suffix}`; };
/** The meal now being served, the next one, or the last one of the day. */
export function currentDiningMeal(menu: DiningMenu, minutes: number) {
  return menu.meals.find(meal => meal.end !== null && minutes <= meal.end) ?? menu.meals[menu.meals.length - 1];
}

/** Wagner dining hall (ADR 023): only for Augustana students, and only when they keep it on. */
export function DiningHall({ menu, minutes, date, saving, onAdd }: { menu: DiningMenu; minutes: number; date: string; saving: boolean; onAdd(entry: SaveFoodEntry): Promise<boolean> }) {
  const [chosen, setChosen] = useState<string>(); const [dish, setDish] = useState<DiningDish>();
  const meal = menu.meals.find(item => item.meal === chosen) ?? currentDiningMeal(menu, minutes);
  if (!menu.published || !meal) return <Card><View style={styles.head}><Ionicons name="restaurant-outline" size={20} color={colors.moss}/><Text style={styles.title}>Dining hall</Text></View>
    <Text style={styles.meta}>{menu.error ? 'The menu could not be read right now. Try again later.' : 'The menu for this day is not published yet.'}</Text></Card>;
  return <Card>
    <View style={styles.head}><Ionicons name="restaurant-outline" size={20} color={colors.moss}/><Text style={styles.title}>Dining hall</Text>
      {meal.start !== null && meal.end !== null && <Text style={styles.time}>{clock(meal.start)}–{clock(meal.end)}</Text>}</View>
    <View accessibilityRole="tablist" style={styles.tabs}>{menu.meals.map(item => <Pressable key={item.meal} accessibilityRole="tab" accessibilityState={{ selected: item.meal === meal.meal }}
      onPress={() => setChosen(item.meal)} style={[styles.tab, item.meal === meal.meal && styles.tabOn]}>
      <Text style={[styles.tabText, item.meal === meal.meal && styles.tabTextOn]}>{item.label}</Text></Pressable>)}</View>
    {meal.stations.map(station => <View key={station.label} style={styles.station}>
      <Text style={styles.stationLabel}>{station.label.toUpperCase()}</Text>
      {station.dishes.map(item => <Pressable key={`${station.label}:${item.key}`} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} onPress={() => setDish(item)}
        style={({ pressed }) => [styles.dish, pressed && styles.pressed]}>
        <View style={styles.flex}><Text style={styles.dishName}>{item.name}</Text>
          <Text style={styles.meta}>{formatNumber(item.serving.nutrients.kcal)} kcal · P {Math.round(item.serving.nutrients.protein)} g · ~{item.serving.grams} g{item.siteKcal === null ? ' · typical portion' : ''}</Text></View>
        <Ionicons name="add-circle-outline" size={24} color={colors.moss}/></Pressable>)}
    </View>)}
    <Text style={styles.note}>Calories come from the dining hall. Protein, carbs, fat and fiber are estimates from similar foods.</Text>
    {dish && <DishSheet dish={dish} meal={meal.meal} date={date} saving={saving} onClose={() => setDish(undefined)}
      onAdd={async entry => { const added = await onAdd(entry); if (added) setDish(undefined); return added; }}/>}
  </Card>;
}

function DishSheet({ dish, meal, date, saving, onAdd, onClose }: { dish: DiningDish; meal: Meal; date: string; saving: boolean; onAdd(entry: SaveFoodEntry): Promise<boolean>; onClose(): void }) {
  const [servings, setServings] = useState(1); const [extra, setExtra] = useState(false);
  const portion = diningPortion(dish, servings, extra), hasMeat = dish.meat.grams > 0;
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.scrim}>
    <View style={styles.sheet}>
      <View style={styles.head}><Text style={[styles.title, styles.flex]}>{dish.name}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink}/></Pressable></View>
      <Text style={styles.meta}>One serving ≈ {dish.serving.grams} g · {formatNumber(dish.serving.nutrients.kcal)} kcal{dish.siteKcal !== null ? ' (from the menu)' : ' (typical portion)'}</Text>
      <Text style={styles.label}>Servings</Text>
      <View accessibilityRole="radiogroup" style={styles.steps}>{servingSteps.map(step => <Pressable key={step} accessibilityRole="radio" accessibilityState={{ checked: servings === step }}
        accessibilityLabel={`${step} servings`} onPress={() => setServings(step)} style={[styles.step, servings === step && styles.stepOn]}>
        <Text style={[styles.stepText, servings === step && styles.stepTextOn]}>{step === 0.5 ? '½' : step === 1.5 ? '1½' : step}</Text></Pressable>)}</View>
      {hasMeat && <View style={styles.extra}><View style={styles.flex}><Text style={styles.label}>Extra protein</Text>
        <Text style={styles.meta}>Double the meat ({dish.meat.grams} g per serving), sides unchanged.</Text></View>
        <Switch accessibilityLabel="Extra protein" value={extra} onValueChange={setExtra} trackColor={{ true: colors.moss, false: colors.line }}/></View>}
      <View style={styles.preview}><Text style={styles.previewText}><Text style={styles.bold}>{formatNumber(portion.nutrients.kcal)} kcal</Text> · {portion.grams} g</Text>
        <Text style={styles.previewText}>Protein {Math.round(portion.nutrients.protein)} g · Carbs {Math.round(portion.nutrients.carbs)} g · Fat {Math.round(portion.nutrients.fat)} g · Fiber {Math.round(portion.nutrients.fiber)} g</Text></View>
      <Button title={saving ? 'Adding…' : `Add to ${mealLabels[meal].toLowerCase()}`} disabled={saving} onPress={() => { void onAdd(diningEntry(dish, servings, extra, meal, date)); }}/>
    </View>
  </SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { color: colors.ink, fontSize: 18, fontWeight: '800' }, flex: { flex: 1, gap: 2 },
  time: { color: colors.muted, fontWeight: '700', marginLeft: 'auto' }, meta: { color: colors.muted, fontSize: 13, lineHeight: 18 }, pressed: { opacity: 0.75 },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 4 }, tab: { flex: 1, minHeight: 36, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.moss, borderColor: colors.moss }, tabText: { color: colors.ink, fontWeight: '700' }, tabTextOn: { color: colors.onAccent },
  station: { gap: 4, marginTop: 6 }, stationLabel: { color: colors.moss, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  dish: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }, dishName: { color: colors.ink, fontWeight: '700' },
  note: { color: colors.muted, fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: { gap: 10, padding: 20, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.card },
  label: { color: colors.ink, fontWeight: '700' }, steps: { flexDirection: 'row', gap: 8 },
  step: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepOn: { backgroundColor: colors.moss, borderColor: colors.moss }, stepText: { color: colors.ink, fontWeight: '800', fontSize: 16 }, stepTextOn: { color: colors.onAccent },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 12 }, preview: { padding: 12, borderRadius: 14, backgroundColor: colors.sage, gap: 2 },
  previewText: { color: colors.ink, fontSize: 14 }, bold: { fontWeight: '900' },
});
