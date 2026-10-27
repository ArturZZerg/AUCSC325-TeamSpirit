import { BadRequestException } from '@nestjs/common';
import { gradeSummary } from '@campusflow/domain';
import { checkGrades, Grades } from '../src/course-grades';
import { mergeCanvasGrades } from '../src/integrations/canvas/canvas-grades';
import { CanvasCourseGrades, normalizeCanvasSnapshot } from '../src/integrations/canvas/canvas-provider';

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
beforeEach(() => { counter = 0; });
const empty: Grades = { assessments: [], groups: [] };
const canvas = (fields: Partial<CanvasCourseGrades> = {}): CanvasCourseGrades => ({ courseExternalId: '1', complete: true,
  groups: [{ externalId: '10', name: 'Assignments', weight: 60 }, { externalId: '20', name: 'Exams', weight: 40 }],
  items: [{ externalId: '101', title: 'Essay', groupExternalId: '10', pointsPossible: 20, score: 85 },
    { externalId: '201', title: 'Midterm', groupExternalId: '20', pointsPossible: 50, score: null }], ...fields });
const manual = { id: '10000000-0000-4000-8000-000000000001', title: 'Participation', weight: 10, score: 100 };

describe('merging Canvas grades into a course', () => {
  it('imports groups and graded assignments with points as their in-group weight', () => {
    const merged = mergeCanvasGrades(empty, canvas(), newId);
    expect(merged.groups).toEqual([
      { id: newIdAt(1), title: 'Assignments', weight: 60, canvas: { externalId: '10', weight: 60, weightEdited: false } },
      { id: newIdAt(2), title: 'Exams', weight: 40, canvas: { externalId: '20', weight: 40, weightEdited: false } }]);
    expect(merged.assessments).toEqual([
      { id: newIdAt(3), title: 'Essay', weight: 20, score: 85, groupId: newIdAt(1), canvas: { externalId: '101', pointsPossible: 20, weightEdited: false } },
      { id: newIdAt(4), title: 'Midterm', weight: 50, score: null, groupId: newIdAt(2), canvas: { externalId: '201', pointsPossible: 50, weightEdited: false } }]);
    expect(gradeSummary(merged.assessments, null, merged.groups)).toMatchObject({ current: 85, totalWeight: 100, floor: 51 });
  });
  it('returns the same outline when Canvas has not changed, so repeated syncs write nothing', () => {
    const once = mergeCanvasGrades(empty, canvas(), newId);
    expect(mergeCanvasGrades(once, canvas(), newId)).toBe(once);
    // JSONB reorders keys; a reordered copy is still unchanged.
    const reverse = <T extends object>(row: T) => Object.fromEntries(Object.entries(row).reverse()) as T;
    const reordered: Grades = { groups: once.groups.map(reverse), assessments: once.assessments.map(reverse) };
    expect(mergeCanvasGrades(reordered, canvas(), newId)).toBe(reordered);
  });
  it('updates titles, scores and default weights but keeps weights the student edited', () => {
    const once = mergeCanvasGrades(empty, canvas(), newId);
    const edited: Grades = { groups: once.groups.map(group => group.title === 'Exams' ? { ...group, weight: 30, canvas: { ...group.canvas!, weightEdited: true } } : group),
      assessments: once.assessments.map(row => row.title === 'Essay' ? { ...row, weight: 5, canvas: { ...row.canvas!, weightEdited: true } } : row) };
    const next = mergeCanvasGrades(edited, canvas({ groups: [{ externalId: '10', name: 'Homework', weight: 50 }, { externalId: '20', name: 'Exams', weight: 50 }],
      items: [{ externalId: '101', title: 'Essay 1', groupExternalId: '10', pointsPossible: 25, score: 90 },
        { externalId: '201', title: 'Midterm', groupExternalId: '20', pointsPossible: 60, score: 72 }] }), newId);
    expect(next.groups.map(group => [group.title, group.weight, group.canvas?.weight])).toEqual([['Homework', 50, 50], ['Exams', 30, 50]]);
    expect(next.assessments.map(row => [row.title, row.weight, row.score, row.canvas?.pointsPossible])).toEqual([['Essay 1', 5, 90, 25], ['Midterm', 60, 72, 60]]);
    expect(next.assessments.map(row => row.id)).toEqual(once.assessments.map(row => row.id));
  });
  it('never touches assessments and groups the student added', () => {
    const own = { id: '10000000-0000-4000-8000-000000000002', title: 'Labs', weight: null };
    const start: Grades = { assessments: [manual, { ...manual, id: '10000000-0000-4000-8000-000000000003', title: 'Lab 1', weight: 1, groupId: own.id }], groups: [own] };
    const merged = mergeCanvasGrades(start, canvas(), newId);
    expect(merged.assessments.slice(0, 2)).toEqual(start.assessments);
    expect(merged.groups[0]).toEqual(own);
    expect(mergeCanvasGrades(merged, canvas({ items: [], groups: [] }), newId)).toEqual(start);
  });
  it('drops Canvas rows removed in Canvas only after a complete read', () => {
    const once = mergeCanvasGrades(empty, canvas(), newId);
    const partial = mergeCanvasGrades(once, canvas({ complete: false, items: [canvas().items[0]] }), newId);
    expect(partial).toBe(once);
    const removed = mergeCanvasGrades(once, canvas({ items: [canvas().items[0]], groups: [canvas().groups[0]] }), newId);
    expect(removed.assessments.map(row => row.title)).toEqual(['Essay']);
    expect(removed.groups.map(group => group.title)).toEqual(['Assignments']);
  });
  it('keeps a removed Canvas group while the student’s own assessments still use it', () => {
    const once = mergeCanvasGrades(empty, canvas(), newId), exams = once.groups[1];
    const withOwn: Grades = { ...once, assessments: [...once.assessments, { ...manual, weight: 5, groupId: exams.id }] };
    const next = mergeCanvasGrades(withOwn, canvas({ groups: [canvas().groups[0]], items: [canvas().items[0]] }), newId);
    expect(next.groups.map(group => group.title)).toEqual(['Assignments', 'Exams']);
    expect(next.assessments.map(row => row.title)).toEqual(['Essay', 'Participation']);
  });
});

describe('normalizing Canvas grades', () => {
  const snapshot = (course: Record<string, unknown>, assignments: unknown[], groups: unknown[] | undefined, complete = true) =>
    normalizeCanvasSnapshot({ courses: [{ course: { id: 1, name: 'Course', ...course }, assignments, ...(groups && { assignment_groups: groups }), complete }] });
  const groups = [{ id: 10, name: 'Assignments', group_weight: 70 }, { id: 20, name: 'Exams', group_weight: 30 }];

  it('converts points to percents and keeps only work that counts', () => {
    const result = snapshot({ apply_assignment_group_weights: true }, [
      { id: 1, name: 'Essay', points_possible: 20, assignment_group_id: 10, submission: { score: 17, workflow_state: 'graded' } },
      { id: 2, name: 'Bonus', points_possible: 10, assignment_group_id: 10, submission: { score: 18 } },
      { id: 3, name: 'Not yet', points_possible: 50, assignment_group_id: 20, submission: { workflow_state: 'unsubmitted' } },
      { id: 4, name: 'Excused', points_possible: 10, assignment_group_id: 10, submission: { score: 0, excused: true } },
      { id: 5, name: 'Omitted', points_possible: 10, assignment_group_id: 10, omit_from_final_grade: true },
      { id: 6, name: 'Ungraded', points_possible: 10, assignment_group_id: 10, grading_type: 'not_graded' },
      { id: 7, name: 'No points', points_possible: 0, assignment_group_id: 10 },
    ], groups);
    expect(result.grades).toEqual([{ courseExternalId: '1', complete: true,
      groups: [{ externalId: '10', name: 'Assignments', weight: 70 }, { externalId: '20', name: 'Exams', weight: 30 }],
      items: [{ externalId: '1', title: 'Essay', groupExternalId: '10', pointsPossible: 20, score: 85 },
        { externalId: '2', title: 'Bonus', groupExternalId: '10', pointsPossible: 10, score: 150 },
        { externalId: '3', title: 'Not yet', groupExternalId: '20', pointsPossible: 50, score: null }] }]);
    // Deadlines are unchanged: every assignment is still coursework.
    expect(result.academicItems).toHaveLength(7);
  });
  it('grades by points when the course does not weight its groups', () => {
    expect(snapshot({}, [], groups).grades?.[0].groups.map(group => group.weight)).toEqual([null, null]);
  });
  it('pools assignments with an unknown group by points and passes on an incomplete read', () => {
    const result = snapshot({ apply_assignment_group_weights: true }, [{ id: 1, name: 'Lab', points_possible: 5, assignment_group_id: 99 }], []);
    expect(result.grades?.[0]).toMatchObject({ complete: true, groups: [{ externalId: 'other', name: 'Other Canvas work', weight: null }],
      items: [{ groupExternalId: 'other' }] });
    expect(snapshot({}, [], groups, false).grades?.[0].complete).toBe(false);
  });
  it('leaves courses without group data out of grades', () => {
    expect(snapshot({}, [{ id: 1, name: 'Essay', points_possible: 10 }], undefined).grades).toBeUndefined();
  });
});

describe('course grade checks', () => {
  const group = { id: '20000000-0000-4000-8000-000000000001', title: 'Quizzes', weight: 30 };
  const quiz = { id: '20000000-0000-4000-8000-000000000002', title: 'Quiz', weight: 400, score: null, groupId: group.id };

  it('accepts in-group shares above 100 and refuses out-of-range ungrouped weights', () => {
    expect(() => checkGrades({ assessments: [quiz, manual], groups: [group] }, empty)).not.toThrow();
    expect(() => checkGrades({ assessments: [{ ...quiz, groupId: null }], groups: [group] }, empty)).toThrow('100% or less');
    expect(() => checkGrades({ assessments: [{ ...manual, weight: 0 }], groups: [] }, empty)).toThrow('above 0%');
    expect(() => checkGrades({ assessments: [quiz], groups: [] }, empty)).toThrow('doesn’t exist');
  });
  it('counts weighted groups toward 100% and lets an over-full Canvas outline still be edited down', () => {
    expect(() => checkGrades({ assessments: [{ ...manual, weight: 71 }], groups: [group] }, empty)).toThrow(BadRequestException);
    expect(() => checkGrades({ assessments: [{ ...manual, weight: 71 }], groups: [group] }, empty)).toThrow('total 101%');
    const over: Grades = { assessments: [], groups: [{ ...group, weight: 80 }, { ...group, id: '20000000-0000-4000-8000-000000000003', weight: 40 }] };
    expect(() => checkGrades({ ...over, groups: [over.groups[0], { ...over.groups[1], weight: 30 }] }, over)).not.toThrow();
    expect(() => checkGrades({ ...over, groups: [over.groups[0], { ...over.groups[1], weight: 50 }] }, over)).toThrow('total 130%');
  });
});

function newIdAt(index: number) { return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`; }
