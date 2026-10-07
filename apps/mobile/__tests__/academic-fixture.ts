import type { AcademicItem } from '../src/lib/types';

export const now = '2025-03-09T18:00:00Z';
export const courseId = '20000000-0000-4000-8000-000000000001';
export const otherCourseId = '20000000-0000-4000-8000-000000000002';
export const courses = [
  { id: courseId, externalId: '325', name: 'Software Engineering', code: 'AUCSC 325', active: true },
  { id: otherCourseId, externalId: '210', name: 'Algorithms', code: 'AUCSC 210', active: true },
];
export const essay: AcademicItem = { id: '50000000-0000-4000-8000-000000000001', courseId, title: 'Testing report', kind: 'assignment',
  due: { kind: 'date', date: '2025-03-09' }, submissionState: 'unsubmitted', source: 'canvas:fixture', externalId: '1', mainGoalDate: null, updatedAt: now };
export const quiz: AcademicItem = { ...essay, id: '50000000-0000-4000-8000-000000000002', courseId: otherCourseId, title: 'Graph quiz', kind: 'quiz', due: { kind: 'date', date: '2025-03-11' } };
export const submitted: AcademicItem = { ...essay, id: '50000000-0000-4000-8000-000000000003', title: 'Submitted essay', submissionState: 'submitted', due: { kind: 'date', date: '2025-03-08' } };
export const undated: AcademicItem = { ...essay, id: '50000000-0000-4000-8000-000000000004', courseId: null, title: 'Read chapter five', due: null, submissionState: null };
export const missing: AcademicItem = { ...essay, id: '50000000-0000-4000-8000-000000000005', title: 'Missing worksheet', submissionState: 'missing', due: { kind: 'date', date: '2025-03-12' } };
