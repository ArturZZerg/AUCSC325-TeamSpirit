import { z } from 'zod';
import { dateSchema, idSchema, instantSchema, timeZoneSchema } from './index';

/** Nutrition diary, goals and the Augustana dining hall (ADR 023). */
const amount = (max: number) => z.number().min(0).max(max);
export const nutrientsSchema = z.object({ kcal: amount(20000), protein: amount(2000), fat: amount(2000), carbs: amount(3000), fiber: amount(500) }).strict();
export const mealSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const foodSourceSchema = z.enum(['usda', 'own', 'dining', 'quick']);
export const portionSchema = z.object({ label: z.string().trim().min(1).max(60), grams: z.number().min(0.1).max(5000) }).strict();

export const nutritionProfileSchema = z.object({
  sex: z.enum(['female', 'male']).nullable(), birthYear: z.number().int().min(1920).max(2020), heightCm: z.number().min(100).max(250),
  activity: z.enum(['sedentary', 'light', 'moderate', 'active', 'very']), goal: z.enum(['lose', 'maintain', 'gain']),
  overrides: nutrientsSchema.partial().strict().nullable(), diningHall: z.enum(['auto', 'on', 'off']),
}).strict();

/** A searchable food: per-100 g values and household portions. */
export const foodSchema = z.object({ id: z.string().min(1).max(120), name: z.string().min(1).max(200), source: foodSourceSchema,
  per100: nutrientsSchema, portions: portionSchema.array().max(12) }).strict();
export const foodSearchSchema = z.object({ query: z.string(), foods: foodSchema.array().max(40) }).strict();
export const saveUserFoodSchema = z.object({ name: z.string().trim().min(1, 'Name the food.').max(120), per100: nutrientsSchema,
  portions: portionSchema.array().max(6) }).strict();

const entryFields = z.object({ date: dateSchema, meal: mealSchema, name: z.string().trim().min(1).max(200), grams: z.number().min(0.1).max(5000),
  nutrients: nutrientsSchema, source: foodSourceSchema, sourceRef: z.string().max(160).nullable() });
/** A diary line keeps a snapshot of the food, so later food-table changes never rewrite history. */
export const saveFoodEntrySchema = entryFields.extend({ requestKey: z.string().min(8).max(120) }).strict();
export const foodEntrySchema = entryFields.extend({ id: idSchema, createdAt: instantSchema }).strict();
export const updateFoodEntrySchema = z.object({ meal: mealSchema.optional(), grams: z.number().min(0.1).max(5000).optional(), nutrients: nutrientsSchema.optional() }).strict()
  .refine(value => value.meal !== undefined || value.grams !== undefined, 'Change the meal or the amount.')
  .refine(value => (value.grams === undefined) === (value.nutrients === undefined), 'Send the new amount with its nutrients.');
export const copyMealSchema = z.object({ fromDate: dateSchema, fromMeal: mealSchema, toDate: dateSchema, toMeal: mealSchema }).strict();

export const nutritionDaySchema = z.object({
  accountId: idSchema, timeZone: timeZoneSchema, date: dateSchema, capturedAt: instantSchema,
  profile: nutritionProfileSchema.nullable(), latestWeightKg: z.number().nullable(), diningAvailable: z.boolean(),
  entries: foodEntrySchema.array().max(300), recent: foodSchema.array().max(20),
}).strict();

/** One dining-hall dish: site calories are the truth, the macros are USDA-analog estimates per serving. */
export const diningPartSchema = z.object({ grams: z.number().min(0), nutrients: nutrientsSchema }).strict();
export const diningDishSchema = z.object({ key: z.string().min(1).max(120), name: z.string().min(1).max(200), siteKcal: z.number().nullable(),
  kind: z.enum(['meat', 'mixed', 'side', 'sweet', 'other']), serving: diningPartSchema, meat: diningPartSchema, rest: diningPartSchema,
  estimated: z.boolean() }).strict();
export const diningMenuSchema = z.object({
  date: dateSchema, published: z.boolean(), fetchedAt: instantSchema.nullable(), error: z.string().nullable(),
  meals: z.object({ meal: z.enum(['breakfast', 'lunch', 'dinner']), label: z.string(), start: z.number().int().nullable(), end: z.number().int().nullable(),
    stations: z.object({ label: z.string(), dishes: diningDishSchema.array().max(40) }).strict().array().max(12) }).strict().array().max(3),
}).strict();

export type Nutrients = z.infer<typeof nutrientsSchema>;
export type NutritionProfileDto = z.infer<typeof nutritionProfileSchema>;
export type Food = z.infer<typeof foodSchema>;
export type SaveUserFood = z.infer<typeof saveUserFoodSchema>;
export type SaveFoodEntry = z.infer<typeof saveFoodEntrySchema>;
export type FoodEntry = z.infer<typeof foodEntrySchema>;
export type NutritionDay = z.infer<typeof nutritionDaySchema>;
export type DiningDish = z.infer<typeof diningDishSchema>;
export type DiningMenu = z.infer<typeof diningMenuSchema>;
