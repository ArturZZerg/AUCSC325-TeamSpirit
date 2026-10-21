import { parseQuickAdd } from '../src/features/quick-add';
import { courses } from './academic-fixture';

describe('Quick-add task input', () => {
  describe('equivalence class partitioning', () => {
    it.each([
      ['university alias', 'Study notes #uni', 'university'],
      ['personal alias', 'Buy groceries #errand', 'personal'],
      ['known course code', 'Testing report #AUCSC325', 'university'],
    ])('recognises the %s class', (_label, input, category) => {
      const result = parseQuickAdd(input, '2025-03-09', undefined, courses);
      expect(result.values.category).toBe(category);
    });
  });

  describe('boundary value analysis', () => {
    it.each([
      ['minimum estimate', 'Task 1m', '1'],
      ['maximum accepted estimate', 'Task 999m', '999'],
      ['above parser digit boundary remains title text', 'Task 1000m', undefined],
    ])('%s', (_label, input, minutes) => {
      expect(parseQuickAdd(input, '2025-03-09').values.estimatedMinutes).toBe(minutes);
    });
  });

  describe('combinatorial testing', () => {
    it('combines date, time, priority, course and estimate', () => {
      const result = parseQuickAdd('Essay due fri 5pm #AUCSC325 !high 45m', '2025-03-09', '2025-03-09', courses);
      expect(result.values).toEqual(expect.objectContaining({
        category: 'university', priority: 'high', courseId: courses[0].id,
        dueDate: '2025-03-14', dueTime: '17:00', estimatedMinutes: '45',
      }));
    });
  });
});
