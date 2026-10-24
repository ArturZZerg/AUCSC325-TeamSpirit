import type { DiningDish, Food, FoodEntry, NutritionDay, SaveFoodEntry } from '@campusflow/contracts';
import { addNutrients, nutritionGoals, portionNutrients, roundNutrients, scaleNutrients, sumNutrients, type Meal, type Nutrients } from '@campusflow/domain';

export const meals: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const mealLabels: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
export const servingSteps = [0.5, 1, 1.5, 2, 3] as const;
const requestKey = () => `food-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** Goals from the saved profile and the latest body weight; null until both exist. */
export const dayGoals = (day: NutritionDay | undefined, year: number) => day?.profile ? nutritionGoals(day.profile, day.latestWeightKg, year) : null;
export const dayTotals = (entries: readonly FoodEntry[]) => sumNutrients(entries.map(entry => entry.nutrients));
export const mealEntries = (entries: readonly FoodEntry[], meal: Meal) => entries.filter(entry => entry.meal === meal);

/** A diary line for `grams` of a searched food; the nutrients are a snapshot (ADR 023). */
export function foodEntry(food: Food, grams: number, meal: Meal, date: string): SaveFoodEntry {
  return { requestKey: requestKey(), date, meal, name: food.name.slice(0, 200), grams: Math.round(grams * 10) / 10, nutrients: portionNutrients(food.per100, grams),
    source: food.source === 'quick' ? 'quick' : food.source === 'dining' ? 'dining' : food.source, sourceRef: food.source === 'quick' ? null : food.id };
}
/** A typed-in food without a table entry: calories and any macros the student knows. */
export function quickEntry(name: string, nutrients: Nutrients, meal: Meal, date: string): SaveFoodEntry {
  return { requestKey: requestKey(), date, meal, name: name.trim().slice(0, 200) || 'Quick add', grams: 100, nutrients: roundNutrients(nutrients), source: 'quick', sourceRef: null };
}

/** A dining-hall portion: the whole dish × servings, with the meat part optionally doubled for extra protein. */
export function diningPortion(dish: DiningDish, servings: number, extraMeat: boolean) {
  const meatFactor = servings * (extraMeat ? 2 : 1);
  const grams = dish.rest.grams * servings + dish.meat.grams * meatFactor;
  const nutrients = roundNutrients(addNutrients(scaleNutrients(dish.rest.nutrients, servings), scaleNutrients(dish.meat.nutrients, meatFactor)));
  return { grams: Math.max(1, Math.round(grams)), nutrients };
}
export function diningEntry(dish: DiningDish, servings: number, extraMeat: boolean, meal: Meal, date: string): SaveFoodEntry {
  const portion = diningPortion(dish, servings, extraMeat);
  const label = `${dish.name}${servings !== 1 ? ` ×${servings}` : ''}${extraMeat ? ' (extra protein)' : ''}`;
  return { requestKey: requestKey(), date, meal, name: label.slice(0, 200), grams: portion.grams, nutrients: portion.nutrients, source: 'dining', sourceRef: `dining:${dish.key}`.slice(0, 160) };
}
/** Rescales a saved line to a new amount, keeping its per-gram values. */
export const rescaleEntry = (entry: FoodEntry, grams: number) => ({ grams, nutrients: roundNutrients(scaleNutrients(entry.nutrients, grams / entry.grams)) });
export const formatNumber = (value: number) => Math.round(value).toLocaleString();
