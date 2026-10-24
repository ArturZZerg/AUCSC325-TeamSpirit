import { roundNutrients, scaleNutrients, sumNutrients, zeroNutrients, type Nutrients } from '@campusflow/domain';

/**
 * Dining-hall dish estimates, ported from the owner's openGym overlay (ADR 023).
 * The site publishes calories per serving only. Calories are the truth; protein,
 * fat, carbs and fiber come from USDA analogs (SR Legacy values per 100 g) mixed
 * by the dish name and scaled to the site's calories.
 */
type Ref = [kcal: number, protein: number, fat: number, carbs: number, fiber: number];
const ref: Record<string, Ref> = {
  chicken_breast: [165, 31.02, 3.57, 0, 0], chicken_thigh: [179, 24.76, 8.15, 0, 0], chicken_sausage: [183, 21.43, 4.46, 14.25, 0], turkey: [136, 29.51, 1.97, 0, 0],
  turkey_deli: [109, 21.81, 0.83, 3.51, 0.5], pork: [180, 26.76, 7.29, 0, 0], pork_pulled: [317, 23.47, 24.01, 0, 0], pork_sausage: [325, 18.53, 27.25, 1.42, 0],
  bacon: [548, 35.73, 43.27, 1.35, 0], ham: [178, 22.62, 9.02, 0, 0], beef_ground: [250, 25.93, 15.41, 0, 0], beef_roast: [164, 28.45, 4.67, 0, 0],
  lamb: [283, 24.75, 19.65, 0, 0], salmon: [206, 22.1, 12.35, 0, 0], fish: [105, 22.83, 0.86, 0, 0], shrimp: [99, 23.98, 0.28, 0.2, 0], crab: [83, 17.88, 0.74, 0, 0],
  egg: [143, 12.51, 9.47, 0.71, 0], egg_boiled: [155, 12.58, 10.61, 1.12, 0], tofu: [78, 9.04, 4.17, 2.85, 0.9], mozzarella: [299, 22.17, 22.14, 2.4, 0],
  cheddar: [408, 23.3, 34, 2.44, 0], swiss: [393, 27, 31, 1.44, 0], feta: [265, 14.21, 21.49, 3.88, 0], rice: [130, 2.69, 0.28, 28.17, 0.4],
  black_beans: [132, 8.86, 0.54, 23.71, 8.7], chickpeas: [164, 8.86, 2.59, 27.42, 7.6], pasta: [158, 5.8, 0.93, 30.86, 1.8], noodles: [138, 4.54, 2.07, 25.16, 1.2],
  quinoa: [120, 4.4, 1.92, 21.3, 2.8], bread: [270, 9.43, 3.59, 49.2, 2.3], roll: [310, 10.86, 6.47, 52.04, 2], tortilla: [306, 8.2, 7.99, 49.38, 3.5],
  cornbread: [266, 6.7, 7.1, 43.5, 2.4], hash_brown: [219, 2.65, 11.59, 28.51, 3.2], mashed: [113, 1.86, 4.22, 16.81, 1.5], potato: [93, 2.5, 0.13, 21.15, 2.2],
  sweet_potato: [90, 2.01, 0.15, 20.71, 3.3], fries: [219, 2.65, 11.59, 28.51, 3.2], pizza: [268, 10.36, 12.28, 29.02, 2.2], pancakes: [227, 6.4, 9.7, 28.3, 0.9],
  waffles: [291, 7.9, 14.1, 32.9, 0.9], french_toast: [229, 7.7, 10.8, 25, 0.9], oatmeal: [71, 2.54, 1.52, 12, 1.7], farina: [55, 1.82, 0.34, 10.92, 0.8],
  lettuce: [15, 1.36, 0.15, 2.87, 1.3], vegetables: [65, 2.86, 0.15, 13.09, 4.4], spinach: [23, 2.97, 0.26, 3.75, 2.4], mushrooms: [28, 2.17, 0.47, 5.29, 2.2],
  peppers: [28, 0.92, 0.2, 6.7, 1.2], pineapple: [50, 0.54, 0.12, 13.12, 1.4], strawberries: [36, 0.64, 0.22, 7.96, 2], marinara: [45, 1.41, 1.48, 8.05, 1.8],
  ranch: [430, 1.32, 44.54, 5.9, 0], oil: [884, 0, 100, 0, 0], soup_cream: [55, 2.42, 1.24, 9.82, 0.5], jam: [278, 0.37, 0.07, 68.86, 1.1], honey: [304, 0.3, 0, 82.4, 0.2],
  peanut_butter: [597, 22.5, 51.1, 22.3, 4.8], nutella: [539, 5.41, 29.73, 62.36, 5.4], muffin: [375, 4.49, 16.07, 53, 1.1], cookie: [492, 5.1, 24.72, 65.36, 2],
  ice_cream: [207, 3.5, 11, 23.6, 0.7], cake: [389, 3.48, 20.05, 52.84, 2.2], yogurt: [102, 4.37, 1.08, 19.05, 0], apple: [52, 0.26, 0.17, 13.81, 2.4],
  orange: [47, 0.94, 0.12, 11.75, 2.4], banana: [89, 1.09, 0.33, 22.84, 2.6], fruit: [50, 0.51, 0.03, 13.05, 1],
};
const generic: Ref = [180, 9, 7, 20.25, 1.5];
const per100 = ([kcal, protein, fat, carbs, fiber]: Ref): Nutrients => ({ kcal, protein, fat, carbs, fiber });

type Role = 'meat' | 'side';
interface Part { ref: string; share: number; role: Role }
export type DishKind = 'meat' | 'mixed' | 'side' | 'sweet' | 'other';
const part = (name: string, share: number, role: Role = 'side'): Part => ({ ref: name, share, role });

const whole: [RegExp, Part[], DishKind][] = [
  [/^(jam|jams|jelly|preserves)( honey)?$|^jam honey$/, [part('jam', 0.5), part('honey', 0.5)], 'sweet'], [/^honey$/, [part('honey', 1)], 'sweet'],
  [/^(peanut butter|pb)$/, [part('peanut_butter', 1)], 'other'], [/nutella|hazelnut spread/, [part('nutella', 1)], 'sweet'], [/muffin/, [part('muffin', 1)], 'sweet'],
  [/cookie/, [part('cookie', 1)], 'sweet'], [/ice cream|gelato|sundae/, [part('ice_cream', 1)], 'sweet'],
  [/\bcake\b|cupcake|brownie|\bpie\b|tart|donut|doughnut|pastry|danish|cinnamon bun|square/, [part('cake', 1)], 'sweet'],
  [/yogurt|yoghurt|parfait/, [part('yogurt', 1)], 'other'], [/^(whole )?fruit$|fruit salad|fruit cup/, [part('fruit', 1)], 'other'],
  [/^apple/, [part('apple', 1)], 'other'], [/^orange/, [part('orange', 1)], 'other'], [/^banana/, [part('banana', 1)], 'other'],
  [/^cheese$|^cheese (slice|cube)/, [part('cheddar', 1)], 'other'], [/^(bread|toast)$/, [part('bread', 1)], 'side'], [/^(warm )?(bun|roll|dinner roll)s?$/, [part('roll', 1)], 'side'],
  [/corn ?bread/, [part('cornbread', 1)], 'side'], [/oatmeal|porridge/, [part('oatmeal', 1)], 'side'], [/cream of wheat|farina/, [part('farina', 1)], 'side'],
  [/^(rose|marinara|tomato|pasta|alfredo)?( or [a-z]+)? ?sauce$|^(rose|marinara)( or [a-z]+)?( sauce)?$/, [part('marinara', 1)], 'other'],
  [/soup|chowder|bisque|^cream of /, [part('soup_cream', 1)], 'side'],
  [/^(made to order|sandwich|deli sandwich)$/, [part('bread', 0.45), part('turkey_deli', 0.35, 'meat'), part('cheddar', 0.1), part('lettuce', 0.1)], 'mixed'],
];
const protein: [RegExp, string][] = [
  [/\bbacon\b/, 'bacon'], [/\bham\b|prosciutto|pancetta/, 'ham'], [/pepperoni|salami|chorizo/, 'pork_sausage'], [/(chicken|turkey) sausage|sausage (chicken|turkey)/, 'chicken_sausage'],
  [/sausage|bratwurst|hot dog|wiener|frankfurter|kielbasa|banger/, 'pork_sausage'], [/pulled pork|carnitas|pork shoulder/, 'pork_pulled'], [/\bpork\b|\bribs?\b|schnitzel|tonkatsu/, 'pork'],
  [/chicken breast/, 'chicken_breast'], [/chicken|poultry|coq au vin|butter chicken|wings?\b|nuggets?|tenders?/, 'chicken_thigh'], [/turkey/, 'turkey'],
  [/\bbeef\b|burger|messy joe|sloppy joe|meatball|bolognese|lasagna|chili con carne|taco meat/, 'beef_ground'], [/steak|brisket|roast beef|pot roast|beef stew/, 'beef_roast'],
  [/lamb|gyro/, 'lamb'], [/salmon/, 'salmon'], [/\bcod\b|haddock|pollock|tilapia|\bfish\b|basa/, 'fish'], [/shrimp|prawn/, 'shrimp'], [/\bcrab\b/, 'crab'],
];
const otherProtein: [RegExp, string][] = [[/soft boiled|hard boiled|boiled eggs?/, 'egg_boiled'], [/\beggs?\b|poached|omelet|omelette|scrambled|frittata|quiche/, 'egg'],
  [/tofu/, 'tofu'], [/paneer|cheese curd|mozzarella/, 'mozzarella'], [/swiss/, 'swiss'], [/feta/, 'feta']];
const starch: [RegExp, string][] = [
  [/pizza/, 'pizza'], [/ravioli|tortellini|pasta|spaghetti|penne|macaroni|\bmac\b|lasagna|linguine|fettuccine|rigatoni|gnocchi/, 'pasta'], [/noodle|lo mein|chow mein|ramen|pad thai/, 'noodles'],
  [/rice|pilaf|risotto|biryani/, 'rice'], [/quinoa|couscous/, 'quinoa'], [/corn ?bread/, 'cornbread'], [/wrap|tortilla|burrito|taco|quesadilla|fajita|enchilada/, 'tortilla'],
  [/\bbun\b|\broll\b|slider|burger/, 'roll'], [/bread|toast|sandwich|\bsub\b|panini|grilled cheese|messy joe|sloppy joe|croissant|bagel|biscuit|\bmelt\b|\bclub\b|\bblt\b/, 'bread'],
  [/hash ?brown/, 'hash_brown'], [/mashed/, 'mashed'], [/sweet potato/, 'sweet_potato'], [/fries|onion rings|wedges|tots/, 'fries'], [/potato/, 'potato'],
  [/pancake/, 'pancakes'], [/waffle/, 'waffles'], [/french toast/, 'french_toast'],
];
const legume: [RegExp, string][] = [[/black beans?/, 'black_beans'], [/chickpea|garbanzo|chana|hummus|lentil|\bbeans?\b|dal\b/, 'chickpeas']];
const veg: [RegExp, string][] = [[/spinach/, 'spinach'], [/mushroom/, 'mushrooms'], [/pepper(?!oni)/, 'peppers'], [/pineapple|al pastor/, 'pineapple'],
  [/strawberr/, 'strawberries'], [/salad|lettuce|greens|caesar/, 'lettuce'], [/vegetable|veggie|broccoli|carrot|green beans|stir fry|coq au vin/, 'vegetables']];
const first = (list: [RegExp, string][], text: string) => list.find(([pattern]) => pattern.test(text))?.[1];

/** Pizza-station toppings become "<toppings> Pizza" so "Cheese" is not breakfast cheese. */
export const dishName = (name: string, station = '') => /pizza/i.test(station) && !/pizza/i.test(name) ? `${name} Pizza` : name;
/** One identity per dish name: lower case, no filler words or plurals. */
export const dishKey = (name: string) => name.toLowerCase().replace(/&/g, ' and ').normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
  .filter(word => word && !['and', 'or', 'with', 'of', 'the', 'a', 'on', 'in', 'to', 'choice'].includes(word))
  .map(word => word.length <= 3 || word.endsWith('ss') ? word : word.replace(/ies$/, 'y').replace(/oes$/, 'o').replace(/s$/, '')).join(' ').slice(0, 80) || 'dish';

/** The analog composition of a dish by its name. */
export function composeDish(name: string): { parts: Part[]; kind: DishKind } {
  const text = ` ${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()} `, trimmed = text.trim();
  const known = whole.find(([pattern]) => pattern.test(trimmed));
  if (known) return { parts: known[1], kind: known[2] };
  const meat = first(protein, text), other = first(otherProtein, text), base = first(starch, text), beans = first(legume, text), plant = first(veg, text);
  const breaded = /breaded|battered|crispy|fried|nuggets?|tenders?|fingers|schnitzel|katsu|curds/.test(text);
  const sauteed = /saut|stir fry|roasted vegetable|grilled vegetable/.test(text);
  const parts: Part[] = [];
  if (base === 'pizza') {
    parts.push(part('pizza', meat || other ? 0.8 : 1));
    if (meat) parts.push(part(meat, other ? 0.1 : 0.2, 'meat'));
    if (other) parts.push(part(other, meat ? 0.1 : 0.2));
  } else if (meat && (base || beans)) {
    const sandwich = ['bread', 'roll', 'tortilla'].includes(base ?? '');
    parts.push(part(meat, sandwich ? 0.4 : 0.35, 'meat'));
    if (base) parts.push(part(base, beans ? 0.4 : sandwich && other ? 0.45 : 0.65 - (plant ? 0.1 : 0)));
    if (beans) parts.push(part(beans, base ? 0.25 : 0.65 - (plant ? 0.1 : 0)));
    if (other && sandwich) parts.push(part(other, 0.15));
    if (plant && !(other && sandwich)) parts.push(part(plant, 0.1));
  } else if (meat) {
    const sauce = /coq au vin|stew|curry|stroganoff|teriyaki|bbq|sauce|gravy|chili|marsala|cacciatore/.test(text);
    if (breaded) parts.push(part(meat, 0.75, 'meat'), part('bread', 0.15), part('oil', 0.1));
    else if (sauce) parts.push(part(meat, 0.65, 'meat'), part(plant ?? 'marinara', 0.35));
    else if (plant) parts.push(part(meat, 0.85, 'meat'), part(plant, 0.15));
    else parts.push(part(meat, 1, 'meat'));
  } else if (other) {
    if (breaded) parts.push(part(other, 0.65), part('bread', 0.2), part('oil', 0.15));
    else if (base) parts.push(part(other, 0.3), part(base, 0.7));
    else if (plant) parts.push(part(other, 0.25), part(plant, 0.7), part('oil', 0.05));
    else if (/chili|curry|masala|tikka/.test(text)) parts.push(part(other, 0.5), part('peppers', 0.4), part('oil', 0.1));
    else parts.push(part(other, 1));
  } else if (base && beans) parts.push(part(base, 0.7), part(beans, 0.3));
  else if (base) { parts.push(part(base, plant ? 0.85 : 1)); if (plant) parts.push(part(plant, 0.15)); }
  else if (beans) { const oily = sauteed || /roasted/.test(text); parts.push(part(beans, oily ? 0.92 : 1)); if (oily) parts.push(part('oil', 0.08)); }
  else if (plant) {
    const dressed = plant === 'lettuce' && /tossed|garden|caesar|house/.test(text);
    parts.push(part(plant, dressed ? 0.85 : sauteed ? 0.95 : 1));
    if (dressed) parts.push(part('ranch', 0.15));
    if (sauteed) parts.push(part('oil', 0.05));
  }
  if (!parts.length) return { parts: [], kind: 'other' };
  const meatShare = parts.filter(item => item.role === 'meat').reduce((sum, item) => sum + item.share, 0);
  return { parts, kind: meatShare >= 0.6 ? 'meat' : meatShare > 0 ? 'mixed' : 'side' };
}

// Without a calorie figure a serving is a typical cafeteria portion.
const typicalGrams: Record<DishKind, number> = { meat: 120, mixed: 280, side: 150, sweet: 60, other: 100 };
const typicalByRef: Record<string, number> = { roll: 50, bread: 40, cornbread: 60, mashed: 150, pizza: 110, egg: 50, egg_boiled: 50, pancakes: 80, waffles: 75, muffin: 60,
  cookie: 25, cake: 70, ice_cream: 70, cheddar: 30, jam: 20, honey: 20, peanut_butter: 16, nutella: 20, soup_cream: 250 };
export interface DishEstimate { kind: DishKind; serving: { grams: number; nutrients: Nutrients }; meat: { grams: number; nutrients: Nutrients }; rest: { grams: number; nutrients: Nutrients }; estimated: boolean }

/**
 * One serving: grams from the site's calories (or a typical portion), every
 * nutrient scaled so energy matches the site exactly; split into the meat part
 * and the rest so a student can take extra protein or a smaller side.
 */
export function estimateDish(name: string, siteKcal: number | null): DishEstimate {
  const { parts, kind } = composeDish(name);
  const rows = parts.length ? parts.map(item => ({ ...item, per100: per100(ref[item.ref] ?? generic) })) : [{ ref: 'generic', share: 1, role: 'side' as Role, per100: per100(generic) }];
  const mix = sumNutrients(rows.map(row => scaleNutrients(row.per100, row.share)));
  const main = [...rows].sort((a, b) => b.share - a.share)[0];
  const grams = siteKcal && mix.kcal > 0 ? siteKcal / (mix.kcal / 100) : typicalByRef[main.ref] ?? typicalGrams[kind];
  let pieces = rows.map(row => ({ role: row.role, grams: grams * row.share, nutrients: scaleNutrients(row.per100, grams * row.share / 100) }));
  const energy = pieces.reduce((sum, piece) => sum + piece.nutrients.kcal, 0);
  if (siteKcal && energy > 0) pieces = pieces.map(piece => ({ ...piece, nutrients: scaleNutrients(piece.nutrients, siteKcal / energy) }));
  const group = (role: Role) => { const chosen = pieces.filter(piece => piece.role === role);
    return { grams: Math.round(chosen.reduce((sum, piece) => sum + piece.grams, 0)), nutrients: chosen.length ? sumNutrients(chosen.map(piece => piece.nutrients)) : zeroNutrients() }; };
  return { kind, serving: { grams: Math.round(grams), nutrients: roundNutrients(pieces.reduce((sum, piece) => ({ kcal: sum.kcal + piece.nutrients.kcal, protein: sum.protein + piece.nutrients.protein,
    fat: sum.fat + piece.nutrients.fat, carbs: sum.carbs + piece.nutrients.carbs, fiber: sum.fiber + piece.nutrients.fiber }), zeroNutrients())) },
    meat: group('meat'), rest: group('side'), estimated: true };
}
