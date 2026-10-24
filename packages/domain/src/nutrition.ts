/** Nutrition rules (ADR 023). Pure: no food table, no I/O. */
export interface Nutrients { kcal: number; protein: number; fat: number; carbs: number; fiber: number }
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Sex = 'female' | 'male';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very';
export type NutritionGoal = 'lose' | 'maintain' | 'gain';
export interface NutritionProfile { sex: Sex | null; birthYear: number; heightCm: number; activity: Activity; goal: NutritionGoal; overrides: Partial<Nutrients> | null }

export const nutrientKeys = ['kcal', 'protein', 'fat', 'carbs', 'fiber'] as const;
export const zeroNutrients = (): Nutrients => ({ kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
const tenth = (value: number) => Math.round(value * 10) / 10;
export const roundNutrients = (value: Nutrients): Nutrients => ({ kcal: Math.round(value.kcal), protein: tenth(value.protein), fat: tenth(value.fat), carbs: tenth(value.carbs), fiber: tenth(value.fiber) });
export const addNutrients = (a: Nutrients, b: Nutrients): Nutrients => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, fat: a.fat + b.fat, carbs: a.carbs + b.carbs, fiber: a.fiber + b.fiber });
export const scaleNutrients = (value: Nutrients, factor: number): Nutrients =>
  ({ kcal: value.kcal * factor, protein: value.protein * factor, fat: value.fat * factor, carbs: value.carbs * factor, fiber: value.fiber * factor });
/** Nutrients of `grams` of a food given per 100 g. */
export const portionNutrients = (per100: Nutrients, grams: number): Nutrients => roundNutrients(scaleNutrients(per100, grams / 100));
export const sumNutrients = (items: readonly Nutrients[]): Nutrients => roundNutrients(items.reduce(addNutrients, zeroNutrients()));

const activityFactor: Record<Activity, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };
/**
 * Daily targets: Mifflin–St Jeor resting energy × activity, −15 % to lose or
 * +10 % to gain; protein 1.8 g/kg, fat 25 % of energy, fiber 14 g per 1000 kcal,
 * carbs the rest. Overrides win per nutrient. Without a sex the two formulas are averaged.
 */
export function nutritionGoals(profile: NutritionProfile, weightKg: number | null, year: number): Nutrients | null {
  if (weightKg === null || weightKg < 20) return null;
  const age = Math.max(14, Math.min(100, year - profile.birthYear));
  const base = 10 * weightKg + 6.25 * profile.heightCm - 5 * age + (profile.sex === 'male' ? 5 : profile.sex === 'female' ? -161 : -78);
  const kcal = Math.round(base * activityFactor[profile.activity] * (profile.goal === 'lose' ? 0.85 : profile.goal === 'gain' ? 1.1 : 1) / 10) * 10;
  const target = profile.overrides?.kcal ?? kcal;
  const protein = profile.overrides?.protein ?? Math.round(1.8 * weightKg);
  const fat = profile.overrides?.fat ?? Math.round(target * 0.25 / 9);
  const carbs = profile.overrides?.carbs ?? Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
  return { kcal: target, protein, fat, carbs, fiber: profile.overrides?.fiber ?? Math.round(target / 1000 * 14) };
}

/** Share of each goal eaten, capped at 1 for drawing; missing goals count as unfilled. */
export const goalProgress = (eaten: Nutrients, goals: Nutrients | null): Nutrients =>
  Object.fromEntries(nutrientKeys.map(key => [key, goals && goals[key] > 0 ? Math.min(1, eaten[key] / goals[key]) : 0])) as unknown as Nutrients;

/** Augustana Campus course codes start with AU and a subject, e.g. "AUCSC 325" or "AUPAD210" (ADR 023). */
export const isAugustanaCourse = (code: string | null | undefined) => /^AU[A-Z]{2,6}\s*-?\s*\d{3}/.test((code ?? '').trim().toUpperCase());
export type DiningSetting = 'auto' | 'on' | 'off';
export const diningVisible = (setting: DiningSetting, courseCodes: readonly (string | null | undefined)[]) =>
  setting === 'on' || (setting === 'auto' && courseCodes.some(isAugustanaCourse));

/** The meal a log time most likely belongs to, in account-local minutes since midnight. */
export const mealAt = (minutes: number): Meal => minutes < 10 * 60 + 30 ? 'breakfast' : minutes < 15 * 60 ? 'lunch' : minutes < 21 * 60 ? 'dinner' : 'snack';
