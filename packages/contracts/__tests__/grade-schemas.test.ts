import { courseSchema, createAssessmentGroupSchema, createAssessmentSchema, updateAssessmentGroupSchema, updateAssessmentSchema } from '../src';

const id = '70000000-0000-4000-8000-000000000001', group = '80000000-0000-4000-8000-000000000001';
const message = (result: { success: boolean; error?: { issues: { message: string }[] } }) => result.success ? null : result.error?.issues[0].message;

describe('assessment and group contracts (ADR 024)', () => {
  it('keeps ungrouped weights between 0 and 100% and allows larger shares inside a group', () => {
    expect(message(createAssessmentSchema.safeParse({ id, title: 'Final', weight: 0 }))).toBe('Enter a weight above 0%.');
    expect(message(createAssessmentSchema.safeParse({ id, title: 'Final', weight: 101 }))).toBe('Enter a weight of 100% or less.');
    expect(createAssessmentSchema.parse({ id, title: 'Quiz', weight: 250.04, groupId: group })).toEqual({ id, title: 'Quiz', weight: 250, groupId: group });
    expect(createAssessmentSchema.safeParse({ id, title: 'Quiz', weight: 10001, groupId: group }).success).toBe(false);
  });
  it('resets a weight or sets one, never both', () => {
    expect(updateAssessmentSchema.parse({ resetWeight: true })).toEqual({ resetWeight: true });
    expect(updateAssessmentSchema.safeParse({ resetWeight: true, weight: 5 }).success).toBe(false);
    expect(updateAssessmentGroupSchema.safeParse({ resetWeight: true, weight: 5 }).success).toBe(false);
    expect(updateAssessmentSchema.safeParse({ resetWeight: false }).success).toBe(false);
  });
  it('accepts a group graded by points', () => {
    expect(createAssessmentGroupSchema.parse({ id: group, title: ' Labs ', weight: null })).toEqual({ id: group, title: 'Labs', weight: null });
    expect(message(createAssessmentGroupSchema.safeParse({ id: group, title: '', weight: 10 }))).toBe('Enter a group name.');
  });
  it('still reads courses cached before groups existed, and Canvas rows with their link', () => {
    const base = { id: group, externalId: '1', name: 'Course', code: null, active: true };
    expect(courseSchema.parse({ ...base, assessments: [{ id, title: 'Final', weight: 50, score: null }] }).assessmentGroups).toBeUndefined();
    expect(courseSchema.parse({ ...base, assessmentGroups: [{ id: group, title: 'Exams', weight: 40, canvas: { externalId: '20', weight: 40, weightEdited: true } }],
      assessments: [{ id, title: 'Midterm', weight: 0, score: 70, groupId: group, canvas: { externalId: '201', pointsPossible: 50, weightEdited: true } }] })).toBeTruthy();
  });
});
