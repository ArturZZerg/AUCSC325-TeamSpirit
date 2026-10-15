import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { countdownLabel, upcomingExams } from '../src/features/exams';
import { ExamCountdown } from '../src/features/exam-countdown';
import { preparationDefaults } from '../src/features/preparation-plan';
import type { AcademicItem, Course } from '../src/lib/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const zone = 'America/Edmonton', today = '2026-10-15', now = Date.parse('2026-10-15T18:00:00Z');
const course: Course = { id: '60000000-0000-4000-8000-000000000001', externalId: 'c', name: 'Cognitive Psychology', code: 'PSY 223', active: true, source: 'manual', color: 'plum' };
let n = 0;
const exam = (due: AcademicItem['due'], patch: Partial<AcademicItem> = {}): AcademicItem => ({ id: `50000000-0000-4000-8000-0000000000${String(++n).padStart(2, '0')}`,
  courseId: course.id, title: `Exam ${n}`, kind: 'exam', due, submissionState: 'unsubmitted', source: 'manual', externalId: 'x', mainGoalDate: null, updatedAt: '2026-10-01T00:00:00Z', ...patch });

describe('upcoming exams (account zone)', () => {
  it('keeps unfinished exams due from today through two weeks, soonest first, with course details', () => {
    const later = exam({ kind: 'date', date: '2026-10-29' }), soon = exam({ kind: 'instant', at: '2026-10-16T15:00:00Z' });
    const tonight = exam({ kind: 'instant', at: '2026-10-16T03:00:00Z' }); // 21:00 on the 15th in Edmonton
    const rows = upcomingExams([later, soon, tonight, exam({ kind: 'date', date: '2026-10-30' }), exam({ kind: 'date', date: '2026-10-14' }),
      exam({ kind: 'date', date: today }, { submissionState: 'submitted' }), exam(null), exam({ kind: 'date', date: today }, { kind: 'quiz' }),
      exam({ kind: 'instant', at: '2026-10-15T17:00:00Z' })], [course], today, zone, now);
    expect(rows.map(row => [row.title, row.date, row.time, row.daysLeft])).toEqual([
      [tonight.title, today, '21:00', 0], [soon.title, '2026-10-16', '09:00', 1], [later.title, '2026-10-29', undefined, 14]]);
    expect(rows[0].course).toEqual({ name: course.name, code: 'PSY 223', color: 'plum' });
    expect(upcomingExams(undefined, undefined, today, zone, now)).toEqual([]);
  });
  it('labels the countdown', () => {
    expect([0, 1, 5].map(countdownLabel)).toEqual(['Today', 'Tomorrow', 'In 5 days']);
  });
});

it('plans two weeks of revision for an exam, ending the day before', () => {
  const config = preparationDefaults(exam({ kind: 'date', date: '2026-10-22' }, { title: 'Midterm' }), today, zone);
  expect(config).toMatchObject({ title: 'Prepare for: Midterm', from: today, through: '2026-10-21', count: 5, template: 'revision' });
  expect(preparationDefaults(exam({ kind: 'date', date: '2026-12-01' }), today, zone).through).toBe('2026-10-28');
});

it('shows up to three exams with urgency and opens Coursework', () => {
  const rows = upcomingExams([exam({ kind: 'date', date: today }, { title: 'Stats final' }), exam({ kind: 'date', date: '2026-10-20' }, { title: 'Ethics midterm', courseId: null }),
    exam({ kind: 'date', date: '2026-10-21' }), exam({ kind: 'date', date: '2026-10-22' })], [course], today, zone, now);
  render(<ExamCountdown exams={rows}/>);
  expect(screen.getByText('Exams ahead')).toBeOnTheScreen(); expect(screen.getByText(/^PSY 223 · Today · /)).toBeOnTheScreen();
  expect(screen.getByText(/^In 5 days · /)).toBeOnTheScreen(); expect(screen.getByText('+1 more in the next two weeks')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: /^Stats final, PSY 223, today\./ }));
  expect(router.push).toHaveBeenCalledWith('/academics');
  render(<ExamCountdown exams={[]}/>); expect(screen.queryByText('Exams ahead')).toBeNull();
});
