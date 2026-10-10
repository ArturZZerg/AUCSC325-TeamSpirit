import { filterStudyPlans, sessionNeedsMoving, studyPlanProgress } from '../src/features/preparation-progress';
import { preparationFixture } from './preparation-fixture';
const zone = 'America/Edmonton', now = '2025-03-09T18:00:00Z';
it('derives completion and estimates from current member tasks', () => {
  const plan = preparationFixture();
  expect(studyPlanProgress(plan, zone, now)).toMatchObject({ total: 2, completed: 0, remainingMinutes: 100, percentage: 0, finished: false });
  plan.tasks[0].completedAt = now;
  expect(studyPlanProgress(plan, zone, now)).toMatchObject({ total: 2, completed: 1, remainingMinutes: 50, percentage: 50, unestimated: 0, needsMoving: [] });
  plan.tasks[1].estimatedMinutes = null; expect(studyPlanProgress(plan, zone, now).unestimated).toBe(1);
});
it('keeps an empty group distinct from completed preparation and handles deleted sessions', () => {
  expect(studyPlanProgress(preparationFixture({ tasks: [] }), zone, now)).toMatchObject({ finished: false, percentage: 0, total: 0, next: undefined });
  const plan = preparationFixture(); plan.tasks = [{ ...plan.tasks[0], completedAt: now }];
  expect(studyPlanProgress(plan, zone, now)).toMatchObject({ finished: true, percentage: 100, total: 1, completed: 1, remainingMinutes: 0 });
});
it('chooses the earliest open session and leaves unscheduled work available', () => {
  const plan = preparationFixture(); plan.tasks[0].scheduled = null;
  expect(studyPlanProgress(plan, zone, now).next?.title).toBe('Practise graphs');
  plan.tasks[1].completedAt = now; expect(studyPlanProgress(plan, zone, now).next?.title).toBe('Recall key topics');
});
it('uses account midnight and estimated ends to flag earlier sessions, across both DST transitions', () => {
  const task = preparationFixture().tasks[0];
  expect(sessionNeedsMoving({ ...task, scheduled: { kind: 'date', date: '2025-03-08' } }, '2025-03-08', '2025-03-09T06:30:00Z')).toBe(false);
  const timed = { ...task, scheduled: { kind: 'instant' as const, at: '2025-03-09T08:45:00Z' } };
  expect(sessionNeedsMoving(timed, '2025-03-09', '2025-03-09T09:30:00Z')).toBe(false);
  expect(sessionNeedsMoving(timed, '2025-03-09', '2025-03-09T09:35:00Z')).toBe(true);
  const fall = { ...timed, scheduled: { kind: 'instant' as const, at: '2025-11-02T07:45:00Z' } };
  expect(sessionNeedsMoving(fall, '2025-11-02', '2025-11-02T08:35:00Z')).toBe(true);
  expect(sessionNeedsMoving({ ...fall, completedAt: now }, '2025-11-03', now)).toBe(false);
  expect(studyPlanProgress(preparationFixture(), zone, '2025-03-09T06:30:00Z').needsMoving).toHaveLength(0);
});
it('honors live changed and removed deadlines while keeping captured context for a deleted source', () => {
  const plan = preparationFixture(); plan.academicItem = { ...plan.academicItem!, due: null };
  expect(studyPlanProgress(plan, zone, now)).toMatchObject({ deadline: null, deadlineChanged: true });
  plan.academicItem = null; plan.academicItemId = null;
  expect(studyPlanProgress(plan, zone, now)).toMatchObject({ deadline: plan.deadlineWhenPlanned, deadlineChanged: false });
});
it('filters active, finished, archived and session search independently', () => {
  const active = preparationFixture(), finished = preparationFixture({ id: '60000000-0000-4000-8000-000000000002', tasks: preparationFixture().tasks.map(task => ({ ...task, completedAt: now })) });
  const archived = preparationFixture({ id: '60000000-0000-4000-8000-000000000003', archivedAt: now });
  expect(filterStudyPlans([active, finished, archived], 'graphs', 'active', zone, now)).toEqual([active]);
  expect(filterStudyPlans([active, finished, archived], '', 'finished', zone, now)).toEqual([finished]);
  expect(filterStudyPlans([active, finished, archived], '', 'archived', zone, now)).toEqual([archived]);
  expect(filterStudyPlans([active], 'no match', 'active', zone, now)).toEqual([]);
});
