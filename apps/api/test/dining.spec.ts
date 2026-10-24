import { readFileSync } from 'node:fs';
import path from 'node:path';
import { composeDish, dishKey, dishName, estimateDish } from '../src/integrations/dining/dining-dishes';
import { parseDay, parseServingTime } from '../src/integrations/dining/wagner';

const page = (name: string) => readFileSync(path.join(__dirname, 'fixtures/wagner', name), 'utf8');

describe('Wagner menu parser', () => {
  it('reads every meal, station and calorie from a published day', () => {
    const day = parseDay(page('menu-2026-10-16.html'), '2026-10-16');
    if (!day.ok) throw new Error(day.error);
    expect(day.published).toBe(true);
    expect(day.meals.map(meal => meal.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(day.meals[0]).toMatchObject({ start: 450, end: 570 });
    const items = day.meals[0].stations.flatMap(station => station.items);
    expect(items).toContainEqual({ name: 'Pork Sausage Patty', kcal: 55 });
    expect(items).toContainEqual({ name: 'Poached Egg', kcal: 72 });
    expect(day.meals[0].stations[0].label).toBe('Featured');
  });
  it('treats missing calories as unknown and reports unpublished days without failing', () => {
    const later = parseDay(page('menu-2026-10-19.html'), '2026-10-19');
    expect(later.ok && later.meals.flatMap(meal => meal.stations.flatMap(station => station.items)).some(item => item.kcal === null)).toBe(true);
    const unpublished = parseDay(page('menu-2026-10-20-unpublished.html'), '2026-10-20');
    expect(unpublished).toMatchObject({ ok: true, published: false });
  });
  it('rejects pages that no longer look like the menu or are for another date', () => {
    expect(parseDay('<html>maintenance</html>')).toMatchObject({ ok: false });
    expect(parseDay(page('menu-2026-10-16.html'), '2026-10-17')).toMatchObject({ ok: false, error: expect.stringContaining('2026-10-16') });
    expect(parseDay(page('station-feature-no-meal.html'))).toMatchObject({ ok: false });
  });
  it.each([['7:30-9:30am', 450, 570], ['11:30-2:15pm', 690, 855], ['5:00-7:00pm', 1020, 1140], ['7:30-9:30', 450, 570], ['11:30am - 2:15pm', 690, 855]])('parses %s', (label, start, end) => {
    expect(parseServingTime(label)).toEqual({ start, end });
  });
  it('ignores labels that are not times', () => { expect(parseServingTime('Featured')).toBeNull(); expect(parseServingTime('9:00-8:00am')).toBeNull(); });
});

describe('dining dish estimates', () => {
  it('composes dishes from their names', () => {
    expect(composeDish('Chicken Al Pastor').kind).toBe('meat');
    expect(composeDish('Cilantro Lime Rice with Black Beans').parts.map(part => part.ref)).toEqual(['rice', 'black_beans']);
    expect(composeDish('Beef Ravioli').kind).toBe('mixed');
    expect(composeDish('Jams/Honey').kind).toBe('sweet');
  });
  it('matches the site calories exactly and splits the meat from the rest', () => {
    const estimate = estimateDish('Chicken Burrito with Black Beans', 520);
    expect(estimate.serving.nutrients.kcal).toBe(520);
    expect(estimate.meat.grams).toBeGreaterThan(0);
    expect(Math.round(estimate.meat.nutrients.kcal + estimate.rest.nutrients.kcal)).toBe(520);
    expect(estimate.meat.nutrients.protein).toBeGreaterThan(estimate.rest.nutrients.protein);
  });
  it('uses a typical portion when the site gives no calories', () => {
    expect(estimateDish('Dinner Roll', null).serving.grams).toBe(50);
    expect(estimateDish('Mystery Special', null).serving.nutrients.kcal).toBeGreaterThan(0);
  });
  it('names pizza-station toppings and merges plural spellings', () => {
    expect(dishName('Cheese', 'PIZZA')).toBe('Cheese Pizza');
    expect(dishKey('Soft Boiled Eggs')).toBe(dishKey('Soft-boiled egg'));
  });
});
