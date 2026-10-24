import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Food, SaveFoodEntry } from '@campusflow/contracts';
import { portionNutrients, type Meal } from '@campusflow/domain';
import { Button, colors } from '@/components/ui';
import { useFoodSearch } from './queries';
import { foodEntry, formatNumber, mealLabels, meals, quickEntry } from './nutrition';

function MealChips({ value, onChange }: { value: Meal; onChange(meal: Meal): void }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="Meal" style={styles.row}>{meals.map(meal => <Pressable key={meal} accessibilityRole="radio"
    accessibilityState={{ checked: value === meal }} onPress={() => onChange(meal)} style={[styles.chip, value === meal && styles.chipOn]}>
    <Text style={[styles.chipText, value === meal && styles.chipTextOn]}>{mealLabels[meal]}</Text></Pressable>)}</View>;
}
const Macros = ({ values }: { values: { kcal: number; protein: number; fat: number; carbs: number } }) =>
  <Text style={styles.macros}><Text style={styles.kcal}>{formatNumber(values.kcal)} kcal</Text>  ·  P {Math.round(values.protein)} g  ·  C {Math.round(values.carbs)} g  ·  F {Math.round(values.fat)} g</Text>;

/** Search → portion → add, in as few taps as possible (ADR 023). */
export function FoodSheet({ date, meal: initialMeal, recent, saving, onAdd, onClose }: {
  date: string; meal: Meal; recent: readonly Food[]; saving: boolean; onAdd(entry: SaveFoodEntry): Promise<boolean>; onClose(): void;
}) {
  const [query, setQuery] = useState(''); const [meal, setMeal] = useState(initialMeal);
  const [food, setFood] = useState<Food>(); const [quick, setQuick] = useState(false);
  const search = useFoodSearch(query);
  const list = query.trim().length >= 2 ? search.data?.foods ?? [] : recent;
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe}>
    <View style={styles.header}>
      {(food || quick) && <Pressable accessibilityRole="button" accessibilityLabel="Back to search" onPress={() => { setFood(undefined); setQuick(false); }} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={colors.ink}/></Pressable>}
      <Text accessibilityRole="header" style={styles.title}>{food ? 'How much?' : quick ? 'Quick add' : `Add to ${mealLabels[meal].toLowerCase()}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={26} color={colors.ink}/></Pressable>
    </View>
    {food ? <Portion food={food} meal={meal} date={date} saving={saving} onMeal={setMeal} onAdd={onAdd}/>
      : quick ? <QuickAdd meal={meal} date={date} saving={saving} onMeal={setMeal} onAdd={onAdd}/> : <>
      <View style={styles.search}><Ionicons name="search" size={18} color={colors.muted}/>
        <TextInput accessibilityLabel="Search foods" value={query} onChangeText={setQuery} placeholder="Search 8,000 foods, e.g. oatmeal" placeholderTextColor={colors.muted}
          autoFocus autoCorrect={false} style={styles.searchInput}/>{search.isFetching && <ActivityIndicator color={colors.moss}/>}</View>
      <FlatList data={list} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
        ListHeaderComponent={<View style={styles.listHeader}>
          {query.trim().length < 2 && <Text style={styles.section}>{recent.length ? 'Your usual foods' : 'Start typing to search'}</Text>}
          <Pressable accessibilityRole="button" onPress={() => setQuick(true)} style={styles.quick}><Ionicons name="flash-outline" size={18} color={colors.moss}/>
            <Text style={styles.quickText}>Quick add calories</Text></Pressable></View>}
        ListEmptyComponent={query.trim().length >= 2 && !search.isFetching ? <Text style={styles.meta}>No food matches. Try a simpler word or use quick add.</Text> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${item.name}`} onPress={() => setFood(item)} style={({ pressed }) => [styles.food, pressed && styles.pressed]}>
          <View style={styles.flex}><Text style={styles.foodName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.meta}>{formatNumber(item.per100.kcal)} kcal · P {Math.round(item.per100.protein)} g per 100 g{item.source === 'own' ? ' · yours' : ''}</Text></View>
          <Ionicons name="add-circle" size={26} color={colors.moss}/></Pressable>}/>
    </>}
  </SafeAreaView></Modal>;
}

function Portion({ food, meal, date, saving, onMeal, onAdd }: { food: Food; meal: Meal; date: string; saving: boolean; onMeal(meal: Meal): void; onAdd(entry: SaveFoodEntry): Promise<boolean> }) {
  const options = [...food.portions, { label: '100 g', grams: 100 }].filter((item, index, all) => all.findIndex(other => other.grams === item.grams) === index).slice(0, 6);
  const [grams, setGrams] = useState(String(options[0].grams));
  const amount = Number(grams.replace(',', '.'));
  const valid = Number.isFinite(amount) && amount > 0 && amount <= 5000;
  const values = portionNutrients(food.per100, valid ? amount : 0);
  return <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <Text style={styles.foodTitle}>{food.name}</Text>
    <Text style={styles.label}>Portion</Text>
    <View style={styles.row}>{options.map(option => <Pressable key={option.label} accessibilityRole="radio" accessibilityState={{ checked: amount === option.grams }}
      onPress={() => setGrams(String(option.grams))} style={[styles.chip, amount === option.grams && styles.chipOn]}>
      <Text style={[styles.chipText, amount === option.grams && styles.chipTextOn]}>{option.label}{option.label.endsWith(' g') ? '' : ` · ${Math.round(option.grams)} g`}</Text></Pressable>)}</View>
    <View style={styles.gramsRow}>
      {[0.5, 2].map(factor => <Pressable key={factor} accessibilityRole="button" accessibilityLabel={factor < 1 ? 'Halve the amount' : 'Double the amount'} disabled={!valid}
        onPress={() => setGrams(String(Math.round(amount * factor * 10) / 10))} style={styles.factor}><Text style={styles.factorText}>{factor < 1 ? '½×' : '2×'}</Text></Pressable>)}
      <TextInput accessibilityLabel="Amount in grams" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" maxLength={6} selectTextOnFocus style={styles.grams}/>
      <Text style={styles.meta}>grams</Text>
    </View>
    <View style={styles.preview}><Macros values={values}/></View>
    <Text style={styles.label}>Meal</Text><MealChips value={meal} onChange={onMeal}/>
    <Button title={saving ? 'Adding…' : `Add ${valid ? `${formatNumber(values.kcal)} kcal` : ''}`} disabled={saving || !valid} onPress={() => { void onAdd(foodEntry(food, amount, meal, date)); }}/>
  </ScrollView>;
}

function QuickAdd({ meal, date, saving, onMeal, onAdd }: { meal: Meal; date: string; saving: boolean; onMeal(meal: Meal): void; onAdd(entry: SaveFoodEntry): Promise<boolean> }) {
  const [name, setName] = useState(''); const [values, setValues] = useState({ kcal: '', protein: '', fat: '', carbs: '', fiber: '' });
  const number = (text: string) => { const value = Number(text.replace(',', '.')); return Number.isFinite(value) && value >= 0 ? value : 0; };
  const kcal = number(values.kcal);
  const field = (key: keyof typeof values, label: string) => <View style={styles.quickField}><Text style={styles.metaSmall}>{label}</Text>
    <TextInput accessibilityLabel={label} value={values[key]} onChangeText={text => setValues(current => ({ ...current, [key]: text }))} keyboardType="decimal-pad" maxLength={6} style={styles.grams}/></View>;
  return <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    <Text style={styles.label}>What was it?</Text>
    <TextInput accessibilityLabel="Food name" value={name} onChangeText={setName} placeholder="e.g. Coffee shop muffin" placeholderTextColor={colors.muted} style={styles.nameInput}/>
    <View style={styles.row}>{field('kcal', 'Calories')}{field('protein', 'Protein g')}{field('carbs', 'Carbs g')}{field('fat', 'Fat g')}</View>
    <Text style={styles.label}>Meal</Text><MealChips value={meal} onChange={onMeal}/>
    <Button title={saving ? 'Adding…' : 'Add'} disabled={saving || kcal <= 0} onPress={() => { void onAdd(quickEntry(name, { kcal, protein: number(values.protein), fat: number(values.fat),
      carbs: number(values.carbs), fiber: number(values.fiber) }, meal, date)); }}/>
  </ScrollView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, flex: { flex: 1, gap: 2 }, pressed: { opacity: 0.75 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900', flex: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  searchInput: { flex: 1, color: colors.ink, fontSize: 16, minHeight: 46 },
  list: { padding: 16, gap: 8, paddingBottom: 40 }, listHeader: { gap: 8, marginBottom: 4 }, section: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }, quickText: { color: colors.moss, fontWeight: '800' },
  food: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  foodName: { color: colors.ink, fontWeight: '700' }, meta: { color: colors.muted, fontSize: 13 }, metaSmall: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  form: { padding: 16, gap: 10, paddingBottom: 40 }, foodTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, label: { color: colors.ink, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.moss, borderColor: colors.moss }, chipText: { color: colors.ink, fontWeight: '600' }, chipTextOn: { color: colors.onAccent },
  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factor: { minWidth: 46, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  factorText: { color: colors.moss, fontWeight: '800' },
  grams: { minWidth: 80, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  preview: { padding: 12, borderRadius: 14, backgroundColor: colors.sage }, macros: { color: colors.ink, fontSize: 14 }, kcal: { fontWeight: '900' },
  nameInput: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, fontSize: 16, paddingHorizontal: 12 },
  quickField: { gap: 4 },
});
