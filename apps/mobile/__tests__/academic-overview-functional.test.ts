import { academicOverview } from '../src/features/academic-overview';
import { essay, missing, now, submitted, undated } from './academic-fixture';

describe('Coursework overview', () => {
  describe('equivalence class partitioning', () => {
    it.each([
      ['open work', 'open', [essay, missing, undated], 3],
      ['finished work', 'finished', [submitted], 1],
      ['all work', 'all', [essay, missing, submitted, undated], 4],
    ] as const)('places %s in the requested view', (_label, view, items, visibleCount) => {
      expect(academicOverview([...items], { search: '', view }, 'America/Edmonton', now).visibleCount).toBe(visibleCount);
    });
  });

  describe('boundary value analysis', () => {
    it.each([
      ['exactly today', '2025-03-09', 'Due today'],
      ['last day of next-seven-day window', '2025-03-16', 'Next 7 days'],
      ['first day after next-seven-day window', '2025-03-17', 'Later'],
    ])('%s is classified correctly', (_label, date, section) => {
      const item = { ...essay, due: { kind: 'date' as const, date }, title: date };
      const result = academicOverview([item], { search: '', view: 'open' }, 'America/Edmonton', now);
      expect(result.groups[0]?.title).toBe(section);
    });
  });

  describe('combinatorial testing', () => {
    it.each([
      ['course + search + open', { courseId: essay.courseId!, search: 'testing', view: 'open' as const }, 1],
      ['other course + search + open', { courseId: essay.courseId!, search: 'graph', view: 'open' as const }, 0],
      ['all courses + finished', { search: '', view: 'finished' as const }, 1],
    ])('%s combines independent filters', (_label, filters, visibleCount) => {
      expect(academicOverview([essay, submitted, undated], filters, 'America/Edmonton', now).visibleCount).toBe(visibleCount);
    });
  });
});
