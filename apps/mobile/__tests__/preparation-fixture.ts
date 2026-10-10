import type { StudyPlan } from '@campusflow/contracts';
import { snapshotFixture } from './snapshot-fixture';
import { quiz } from './academic-fixture';
export const planId = '60000000-0000-4000-8000-000000000001';
export function preparationFixture(overrides: Partial<StudyPlan> = {}): StudyPlan {
  const task = { ...snapshotFixture().personalTasks[0], studyPlanId: planId, recurrence: null, due: null, completedAt: null, estimatedMinutes: 50, category: 'university' as const };
  return { id: planId, title: 'My graph revision', academicItemId: quiz.id, academicItem: quiz, deadlineWhenPlanned: quiz.due,
    createdAt: '2025-03-08T18:00:00Z', archivedAt: null, tasks: [
      { ...task, title: 'Recall key topics', scheduled: { kind: 'date', date: '2025-03-08' } },
      { ...task, id: '20000000-0000-4000-8000-000000000002', title: 'Practise graphs', scheduled: { kind: 'instant', at: '2025-03-10T20:00:00Z' } },
    ], ...overrides };
}
