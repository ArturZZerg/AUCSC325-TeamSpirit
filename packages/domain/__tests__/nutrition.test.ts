import { diningVisible, goalProgress, isAugustanaCourse, mealAt, nutritionGoals, portionNutrients, sumNutrients } from '../src';

const profile = { sex: 'male' as const, birthYear: 2004, heightCm: 180, activity: 'moderate' as const, goal: 'maintain' as const, overrides: null };
describe('nutrition goals', () => {
  it('uses Mifflin-St Jeor with activity, then protein, fat, fiber and carbs', () => {
    // 10*80 + 6.25*180 - 5*22 + 5 = 1820 resting; x1.55 = 2821 -> 2820.
    expect(nutritionGoals(profile, 80, 2026)).toEqual({ kcal: 2820, protein: 144, fat: 78, carbs: 386, fiber: 39 });
    expect(nutritionGoals({ ...profile, goal: 'lose' }, 80, 2026)?.kcal).toBe(2400);
    expect(nutritionGoals({ ...profile, sex: 'female', goal: 'gain' }, 60, 2026)?.kcal).toBe(Math.round((10 * 60 + 1125 - 110 - 161) * 1.55 * 1.1 / 10) * 10);
  });
  it('lets every nutrient be overridden and needs a body weight', () => {
    expect(nutritionGoals({ ...profile, overrides: { kcal: 2500, protein: 160 } }, 80, 2026)).toMatchObject({ kcal: 2500, protein: 160, fat: 69 });
    expect(nutritionGoals(profile, null, 2026)).toBeNull();
  });
  it('scales foods per 100 g and sums a day, capping progress at the goal', () => {
    const rice = portionNutrients({ kcal: 130, protein: 2.69, fat: 0.28, carbs: 28.17, fiber: 0.4 }, 158);
    expect(rice).toEqual({ kcal: 205, protein: 4.3, fat: 0.4, carbs: 44.5, fiber: 0.6 });
    const day = sumNutrients([rice, rice]);
    expect(day.kcal).toBe(410);
    expect(goalProgress(day, { kcal: 400, protein: 100, fat: 0, carbs: 100, fiber: 10 })).toEqual({ kcal: 1, protein: 0.086, fat: 0, carbs: 0.89, fiber: 0.12 });
  });
});
describe('dining hall visibility', () => {
  it.each([['AUCSC 325', true], ['AUPAD210', true], ['aueng 102 x01', true], ['CMPUT 174', false], ['AU', false], [null, false], ['AUGUSTANA', false]])('%s is Augustana: %s', (code, expected) => {
    expect(isAugustanaCourse(code)).toBe(expected);
  });
  it('follows the student setting and otherwise their courses', () => {
    expect(diningVisible('auto', ['CMPUT 174', 'AUCSC 325'])).toBe(true);
    expect(diningVisible('auto', ['CMPUT 174'])).toBe(false);
    expect(diningVisible('on', [])).toBe(true);
    expect(diningVisible('off', ['AUCSC 325'])).toBe(false);
  });
  it('guesses the meal from the time of day', () => {
    expect([8 * 60, 12 * 60, 18 * 60, 22 * 60].map(mealAt)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });
});
