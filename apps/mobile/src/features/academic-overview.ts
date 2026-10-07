import { addCalendarDays, dayBounds, isOverdue, localDateAt } from '@campusflow/domain';
import type { AcademicItem } from '@/lib/types';

export type AcademicView = 'open' | 'finished' | 'all';
export type AcademicFilters = { search: string; courseId?: string; view: AcademicView };
export const academicFinished = (item: AcademicItem) => item.submissionState === 'submitted' || item.submissionState === 'graded';
export const academicDueDate = (item: AcademicItem, timeZone: string) => item.due?.kind === 'date'
  ? item.due.date : item.due?.kind === 'instant' ? localDateAt(item.due.at, timeZone) : undefined;
export const academicAttention = (item: AcademicItem, timeZone: string, now: string) => !academicFinished(item)
  && (item.submissionState === 'missing' || isOverdue(item.due ?? undefined, now, timeZone));

const sectionNames = ['Needs attention', 'Due today', 'Next 7 days', 'Later', 'No deadline', 'Finished'] as const;
type Section = (typeof sectionNames)[number];
export function academicOverview(items: AcademicItem[], filters: AcademicFilters, timeZone: string, now: string) {
  const today = localDateAt(now, timeZone);
  const through = addCalendarDays(today, 7);
  const search = filters.search.trim().toLocaleLowerCase();
  const matched = items.filter(item => (!filters.courseId || item.courseId === filters.courseId)
    && (!search || item.title.toLocaleLowerCase().includes(search)));
  const sectionFor = (item: AcademicItem): Section => {
    if (academicFinished(item)) return 'Finished';
    if (academicAttention(item, timeZone, now)) return 'Needs attention';
    const dueDate = academicDueDate(item, timeZone);
    if (!dueDate) return 'No deadline';
    if (dueDate === today) return 'Due today';
    if (dueDate <= through) return 'Next 7 days';
    return 'Later';
  };
  const dueOrder = (item: AcademicItem) => item.due?.kind === 'instant' ? Date.parse(item.due.at)
    : item.due?.kind === 'date' ? Date.parse(dayBounds(item.due.date, timeZone).end) - 1 : Infinity;
  const visible = matched.filter(item => filters.view === 'all'
    || (filters.view === 'finished' ? academicFinished(item) : !academicFinished(item)));
  const groups = sectionNames.map(title => ({ title, items: visible.filter(item => sectionFor(item) === title)
    .sort((a, b) => (dueOrder(a) - dueOrder(b)) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)) }))
    .filter(group => group.items.length > 0);
  return { groups, visibleCount: visible.length, matchedCount: matched.length,
    attention: matched.filter(item => sectionFor(item) === 'Needs attention').length,
    dueSoon: matched.filter(item => ['Due today', 'Next 7 days'].includes(sectionFor(item))).length,
    finished: matched.filter(academicFinished).length };
}
