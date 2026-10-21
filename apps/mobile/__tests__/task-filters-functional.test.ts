import { filterPersonalTasks } from '../src/features/task-filters';
import type { PersonalTask } from '../src/lib/types';
import { now } from './academic-fixture';

const task = (overrides: Partial<PersonalTask> = {}): PersonalTask => ({
  id: '60000000-0000-4000-8000-000000000001',
  title: 'Read testing notes',
  description: 'Review boundary examples',
  category: 'university',
  priority: 'medium',
  completedAt: null,
  due: null,
  reminder: null,
  snoozedUntil: null,
  mainGoalDate: null,
  scheduled: null,
  recurrence: null,
  estimatedMinutes: null,
  courseId: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('Personal-task filters', () => {
  const tasks = [
    task({ description: 'Read notes' }),
    task({ id: '60000000-0000-4000-8000-000000000002', title: 'Submit report', description: 'Write summary', category: 'work', completedAt: now }),
    task({ id: '60000000-0000-4000-8000-000000000003', title: 'Gym session', description: 'Exercise', category: 'fitness' }),
  ];

  describe('equivalence class partitioning', () => {
    it.each([
      ['all categories', { category: 'all' as const, completion: 'all' as const, search: '' }, 3],
      ['completed only', { category: 'all' as const, completion: 'completed' as const, search: '' }, 1],
      ['open only', { category: 'all' as const, completion: 'open' as const, search: '' }, 2],
    ])('selects the %s class', (_label, filters, count) => {
      expect(filterPersonalTasks(tasks, filters)).toHaveLength(count);
    });
  });

  describe('boundary value analysis', () => {
    it.each([
      ['empty search', '', 3],
      ['exact one-character search', 'P', 1],
      ['no matching boundary', 'Z', 0],
    ])('%s', (_label, search, count) => {
      expect(filterPersonalTasks(tasks, { category: 'all', completion: 'all', search })).toHaveLength(count);
    });
  });

  describe('combinatorial testing', () => {
    it.each([
      ['fitness + open + title', { category: 'fitness' as const, completion: 'open' as const, search: 'gym' }, 1],
      ['university + completed + title', { category: 'university' as const, completion: 'completed' as const, search: 'report' }, 0],
    ])('%s', (_label, filters, count) => {
      expect(filterPersonalTasks(tasks, filters)).toHaveLength(count);
    });
  });
});
