import { academicOverview } from '../src/features/academic-overview';
import { courseId, essay, missing, now, quiz, submitted, undated } from './academic-fixture';
const zone = 'America/Edmonton';
const filters = { search: '', view: 'open' as const };
describe('Academic overview (ToR 3.1, 9, 17)', () => {
  it('groups by urgency, excludes finished work from To do and treats missing status as actionable', () => {
    const result = academicOverview([submitted, undated, quiz, essay, missing], filters, zone, now);
    expect(result.groups.map(group => [group.title, group.items.map(item => item.title)])).toEqual([
      ['Needs attention', ['Missing worksheet']], ['Due today', ['Testing report']], ['Next 7 days', ['Graph quiz']], ['No deadline', ['Read chapter five']],
    ]);
    expect(result).toMatchObject({ visibleCount: 4, matchedCount: 5, attention: 1, dueSoon: 2, finished: 1 });
  });
  it('keeps submitted and graded past deadlines out of overdue counts', () => {
    const result = academicOverview([submitted, { ...essay, submissionState: 'graded', due: { kind: 'date', date: '2025-01-01' } }], { ...filters, view: 'finished' }, zone, now);
    expect(result.attention).toBe(0); expect(result.groups[0].title).toBe('Finished'); expect(result.finished).toBe(2);
  });
  it('searches trimmed case-insensitive titles within the selected course', () => {
    const result = academicOverview([quiz, essay, submitted], { ...filters, search: '  REPORT ', courseId }, zone, now);
    expect(result.visibleCount).toBe(1); expect(result.groups[0].items).toEqual([essay]);
  });
  it('includes completed work in All work without changing its submission state', () => {
    const result = academicOverview([essay, submitted], { ...filters, view: 'all' }, zone, now);
    expect(result.visibleCount).toBe(2); expect(result.groups.map(group => group.title)).toEqual(['Due today', 'Finished']);
    expect(submitted.submissionState).toBe('submitted');
  });
  it('treats a date-only deadline as actionable for the whole local day', () => {
    expect(academicOverview([essay], filters, zone, '2025-03-10T05:59:59Z').attention).toBe(0);
    expect(academicOverview([essay], filters, zone, '2025-03-10T06:00:00Z').attention).toBe(1);
  });
  it('uses the account-local date for a UTC-midnight deadline', () => {
    const item = { ...essay, due: { kind: 'instant' as const, at: '2025-03-10T00:00:00Z' } };
    expect(academicOverview([item], filters, zone, now).groups[0].title).toBe('Due today');
    expect(academicOverview([item], filters, 'UTC', now).groups[0].title).toBe('Next 7 days');
  });
  it.each([
    ['2025-03-09T08:30:00Z', '2025-03-09T09:30:00Z'],
    ['2025-11-02T07:30:00Z', '2025-11-02T08:30:00Z'],
  ])('compares absolute deadlines through a DST transition (%s)', (before, deadline) => {
    const item = { ...essay, due: { kind: 'instant' as const, at: deadline } };
    expect(academicOverview([item], filters, zone, before).attention).toBe(0);
    expect(academicOverview([item], filters, zone, new Date(Date.parse(deadline) + 1).toISOString()).attention).toBe(1);
  });
  it('bounds coming deadlines by calendar days and keeps later/undated work distinct', () => {
    const result = academicOverview([
      { ...essay, id: 'one', due: { kind: 'date', date: '2025-03-16' } },
      { ...quiz, id: 'two', due: { kind: 'date', date: '2025-03-17' } }, undated,
    ], filters, zone, now);
    expect(result.groups.map(group => group.title)).toEqual(['Next 7 days', 'Later', 'No deadline']);
    expect(result.dueSoon).toBe(1);
  });
  it('orders same-day timed deadlines before all-day deadlines and stabilizes undated ties', () => {
    const early = { ...essay, id: 'early', title: 'Timed', due: { kind: 'instant' as const, at: '2025-03-10T01:00:00Z' } };
    const result = academicOverview([essay, early, { ...undated, id: 'z', title: 'Same' }, { ...undated, id: 'a', title: 'Same' }], filters, zone, now);
    expect(result.groups[0].items.map(item => item.id)).toEqual(['early', essay.id]);
    expect(result.groups[1].items.map(item => item.id)).toEqual(['a', 'z']);
  });
});
