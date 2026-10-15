import { studyTimeByCourse } from '../src/features/study-report';

const psy = { id: 'c1', name: 'Cognitive Psychology', code: 'PSY 223', color: 'plum' }, stats = { id: 'c2', name: 'Statistics', code: null, color: null };
const tasks = [{ id: 't1', courseId: 'c1' }, { id: 't2', courseId: null, studyPlanId: 'p1' }, { id: 't3', courseId: null }, { id: 't4', courseId: 'gone' }];
const plans = [{ id: 'p1', academicItem: { courseId: 'c2' } }];

it('rolls task time up to the task course, then the study plan course, leaving the rest as other', () => {
  const rows = [{ taskId: 't1', seconds: 1500 }, { taskId: 't2', seconds: 3000 }, { taskId: 't1', seconds: 600 }, { taskId: 't3', seconds: 300 },
    { taskId: null, seconds: 200 }, { taskId: 't4', seconds: 100 }, { taskId: 'unknown', seconds: 50 }];
  expect(studyTimeByCourse(rows, tasks, plans, [psy, stats])).toEqual({ courses: [{ course: stats, seconds: 3000 }, { course: psy, seconds: 2100 }], other: 650 });
});
it('treats every row as other while lists are unavailable', () => {
  expect(studyTimeByCourse([{ taskId: 't1', seconds: 60 }], undefined, undefined, undefined)).toEqual({ courses: [], other: 60 });
  expect(studyTimeByCourse([], tasks, plans, [psy])).toEqual({ courses: [], other: 0 });
});
