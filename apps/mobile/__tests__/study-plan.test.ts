import { studyAfterDeadline, studyPlanRequest, studyPlanSchema, studySteps, studyTaskTitle } from '../src/features/study-plan';
import { essay, quiz, undated } from './academic-fixture';

const values = { title: 'Draft the introduction', notes: 'Write three key points.', date: '2025-03-09', time: '', minutes: '25' as const };
describe('Coursework study planning', () => {
  it('creates a separate, scheduled university task without duplicating the coursework deadline', () => {
    const original = JSON.stringify(essay);
    const request = studyPlanRequest(essay, 'AUCSC 325', values, 'America/Edmonton');
    expect(request).toMatchObject({ path: '/tasks', method: 'POST', body: { title: values.title, category: 'university', priority: 'medium',
      due: null, scheduled: { kind: 'date', date: values.date }, estimatedMinutes: 25 } });
    expect(request.body.description).toContain('Course: AUCSC 325');
    expect(request.body.description).toContain('Deadline when planned: 2025-03-09');
    expect(request.body.description).toContain(values.notes);
    expect(JSON.stringify(essay)).toBe(original);
  });
  it('converts a start time using the account zone across the DST transition', () => {
    expect(studyPlanRequest(quiz, undefined, { ...values, time: '03:30', minutes: '50' }, 'America/Edmonton').body)
      .toMatchObject({ scheduled: { kind: 'instant', at: '2025-03-09T09:30:00Z' }, estimatedMinutes: 50 });
  });
  it.each([
    ['2025-03-09', '02:30'], ['2025-11-02', '01:30'], ['2025-02-30', '12:00'], ['2025-03-09', '25:00'],
  ])('rejects impossible dates or local times (%s %s)', (date, time) => {
    expect(studyPlanSchema('America/Edmonton').safeParse({ ...values, date, time }).success).toBe(false);
  });
  it.each([{ title: ' ' }, { minutes: '0' }, { minutes: '26' }, { notes: 'a'.repeat(8001) }])('rejects invalid editable input %j', invalid => {
    expect(studyPlanSchema('UTC').safeParse({ ...values, ...invalid }).success).toBe(false);
  });
  it('allows undated coursework and bounds imported titles and course names', () => {
    const item = { ...undated, title: 'a'.repeat(20000) };
    expect(studyTaskTitle(item, studySteps[0])).toHaveLength(240);
    const request = studyPlanRequest(item, 'b'.repeat(2000), { ...values, notes: 'c'.repeat(8000) }, 'UTC');
    expect(request.body.description!.length).toBeLessThanOrEqual(10000);
    expect(request.body.description).toContain('No deadline');
    expect(studyAfterDeadline(undated, '2099-01-01', 'UTC')).toBe(false);
  });
  it('compares deadline days in the account zone, preserving catch-up planning', () => {
    const timed = { ...essay, due: { kind: 'instant' as const, at: '2025-03-10T01:00:00Z' } };
    expect(studyAfterDeadline(timed, '2025-03-09', 'America/Edmonton')).toBe(false);
    expect(studyAfterDeadline(timed, '2025-03-10', 'America/Edmonton')).toBe(true);
    expect(studyPlanRequest(timed, undefined, { ...values, date: '2025-03-10' }, 'America/Edmonton').body.scheduled)
      .toEqual({ kind: 'date', date: '2025-03-10' });
  });
});
