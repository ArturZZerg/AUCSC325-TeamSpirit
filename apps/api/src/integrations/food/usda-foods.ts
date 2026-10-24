import type { Food } from '@campusflow/contracts';
import { readDataFile } from '../../data-files';

/**
 * USDA FoodData Central (Foundation + SR Legacy, public domain), per 100 g with
 * household portions (ADR 023). Loaded once and searched in memory.
 */
type Row = { id: string; n: string; kcal: number; p: number; f: number; c: number; fib: number; por?: { d: string; g: number }[] };
interface Indexed { food: Food; words: string[]; head: string[]; brand: boolean }
let index: Indexed[] | undefined;
const words = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const clamp = (value: number, max: number) => Math.min(max, Math.max(0, +value || 0));
const toFood = (row: Row): Food => ({ id: row.id, name: row.n, source: 'usda',
  // Carbohydrate "by difference" can be slightly negative in the source; clamp every value to a sane range.
  per100: { kcal: clamp(row.kcal, 1000), protein: clamp(row.p, 100), fat: clamp(row.f, 100), carbs: clamp(row.c, 100), fiber: clamp(row.fib, 100) },
  portions: (row.por ?? []).filter(item => item.g > 0 && item.d).slice(0, 8).map(item => ({ label: item.d.slice(0, 60), grams: Math.min(5000, item.g) })) });
function foods(): Indexed[] {
  if (!index) {
    const data = JSON.parse(readDataFile('usda-foods.json')) as { foods: Row[] };
    index = data.foods.filter(row => row.id && row.n).map(row => ({ food: toFood(row), words: words(row.n), head: words(row.n.split(',')[0]),
      brand: /\b[A-Z][A-Z'&.]{2,}\b/.test(row.n) }));
  }
  return index;
}
export const usdaFood = (id: string): Food | undefined => foods().find(item => item.food.id === id)?.food;

// Variants a plain query did not ask for, and staples people eat cooked.
const variants = new Set(['breaded', 'fried', 'dried', 'dehydrated', 'flour', 'powder', 'canned', 'frozen', 'raw', 'deli', 'babyfood', 'baby', 'infant', 'formula',
  'prepared', 'mix', 'sweetened', 'fast', 'restaurant', 'brand', 'imitation', 'salted', 'smoked', 'cured', 'concentrate']);
const cookedStaples = /^(rice|pasta|spaghetti|noodles|quinoa|oats?|chicken|beef|pork|turkey|salmon|fish|egg|eggs|lentils|beans|potato|potatoes)$/;
// Everyday searches where the plain food is not the shortest name in the table.
const pinned: Record<string, string> = {
  milk: 'Milk, whole, 3.25% milkfat, with added vitamin D', rice: 'Rice, white, long-grain, regular, enriched, cooked', egg: 'Egg, whole, cooked, hard-boiled',
  eggs: 'Egg, whole, cooked, hard-boiled', chicken: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
  'chicken breast': 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', oatmeal: 'Cereals, oats, regular and quick, not fortified, dry',
  bread: 'Bread, whole-wheat, commercially prepared', pasta: 'Pasta, cooked, enriched, without added salt', potato: 'Potatoes, baked, flesh and skin, without salt',
  apple: 'Apples, raw, with skin', salmon: 'Fish, salmon, Atlantic, farmed, cooked, dry heat', tuna: 'Fish, tuna, light, canned in water, drained solids',
  yogurt: 'Yogurt, Greek, plain, nonfat', cheese: 'Cheese, cheddar', avocado: 'Avocados, raw, all commercial varieties', beef: 'Beef, ground, 85% lean meat / 15% fat, patty, cooked, broiled',
};
const plural = (word: string, term: string) => word === term || word === `${term}s` || word === `${term}es` || `${word}s` === term;

/** Every query word must prefix a word of the name; the food's head noun, short names and cooked staples rank first. */
export function searchUsda(query: string, limit = 25): Food[] {
  const terms = words(query).slice(0, 8);
  if (!terms.length) return [];
  const staple = terms.length === 1 && cookedStaples.test(terms[0]);
  return foods().flatMap(item => {
    const isPinned = pinned[terms.join(' ')] === item.food.name;
    if (!isPinned && !terms.every(term => item.words.some(word => word.startsWith(term)))) return [];
    let score = item.words.length * 2;
    if (isPinned) score -= 1000;
    if (terms.every(term => item.head.some(word => plural(word, term)))) score -= 40;
    else if (terms.every(term => item.head.some(word => word.startsWith(term)))) score -= 15;
    score += Math.max(0, item.head.length - terms.length) * 8;
    score -= terms.filter(term => item.words.some(word => plural(word, term))).length * 10;
    if (item.brand) score += 25;
    score += item.words.filter(word => variants.has(word) && !terms.includes(word)).length * 12;
    if (staple && item.words.includes('cooked')) score -= 20;
    return [{ food: item.food, score }];
  }).sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name)).slice(0, limit).map(item => item.food);
}
