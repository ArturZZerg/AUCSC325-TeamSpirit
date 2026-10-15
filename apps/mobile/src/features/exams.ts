import { localClockAt, localDateAt } from '@campusflow/domain';
import type { AcademicItem, Course } from '@/lib/types';

export type UpcomingExam = { id: string; title: string; date: string; time?: string; daysLeft: number; course?: Pick<Course, 'name' | 'code' | 'color'> };

const dayIndex = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/**
 * Unfinished exams due from today through `days` ahead in the account zone, soonest first.
 * A timed exam that already started today is excluded; date-only exams stay until the day ends.
 */
export function upcomingExams(items: readonly AcademicItem[] | undefined, courses: readonly Course[] | undefined, today: string, timeZone: string, now: number, days = 14): UpcomingExam[] {
  const byId = new Map(courses?.map(course => [course.id, course]) ?? []);
  return (items ?? []).flatMap(item => {
    if (item.kind !== 'exam' || !item.due || item.submissionState === 'submitted' || item.submissionState === 'graded') return [];
    if (item.due.kind === 'instant' && Date.parse(item.due.at) <= now) return [];
    const date = item.due.kind === 'date' ? item.due.date : localDateAt(item.due.at, timeZone);
    const daysLeft = dayIndex(date) - dayIndex(today);
    if (daysLeft < 0 || daysLeft > days) return [];
    const course = item.courseId ? byId.get(item.courseId) : undefined;
    return [{ id: item.id, title: item.title, date, daysLeft, ...(item.due.kind === 'instant' ? { time: localClockAt(item.due.at, timeZone).time } : {}),
      ...(course ? { course: { name: course.name, code: course.code, color: course.color } } : {}) }];
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title));
}

export const countdownLabel = (daysLeft: number) => daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`;
