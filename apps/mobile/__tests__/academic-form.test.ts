import { academicFormDefaults, academicFormRequest, academicFormSchema } from '../src/features/academic-form';
import { essay } from './academic-fixture';
const zone = 'America/Edmonton'; const today = '2025-03-09';
const defaults = () => ({ ...academicFormDefaults(null, zone, today), title: '  Essay  ' });
it('creates independent coursework with a date-only deadline in the account calendar', () => {
  expect(academicFormRequest(defaults(), null, zone)).toEqual({ path: '/academic-items', method: 'POST', body: { title: 'Essay', kind: 'assignment', courseId: null, due: { kind: 'date', date: today } } });
});
it('supports an undated quiz without Canvas or course metadata', () => {
  expect(academicFormRequest({ ...defaults(), kind: 'quiz', dueMode: 'none' }, null, zone)!.body).toMatchObject({ kind: 'quiz', due: null, courseId: null });
});
it('converts an exact local midnight to UTC', () => {
  expect(academicFormRequest({ ...defaults(), dueMode: 'instant', dueTime: '00:00' }, null, zone)!.body.due).toEqual({ kind: 'instant', at: '2025-03-09T07:00:00Z' });
});
it.each(['', '2025-02-29', '2025-04-31', 'tomorrow'])('rejects invalid dates %s', dueDate => {
  expect(academicFormSchema(null, zone).safeParse({ ...defaults(), dueDate }).success).toBe(false);
});
it.each([{ dueDate: today, dueTime: '02:30' }, { dueDate: '2025-11-02', dueTime: '01:30' }, { dueDate: today, dueTime: '24:00' }])('rejects DST gaps/folds and invalid clocks %j', timing => {
  expect(academicFormSchema(null, zone).safeParse({ ...defaults(), dueMode: 'instant', ...timing }).success).toBe(false);
});
it('omits an untouched folded instant with seconds during a title edit', () => {
  const item = { ...essay, source: 'manual', due: { kind: 'instant' as const, at: '2025-11-02T08:30:42Z' } };
  expect(academicFormRequest({ ...academicFormDefaults(item, zone, today), title: 'Changed' }, item, zone)!.body).toEqual({ title: 'Changed' });
});
it('edits course and clears the deadline without changing submission state', () => {
  const request = academicFormRequest({ ...academicFormDefaults(essay, zone, today), courseId: '', dueMode: 'none' }, essay, zone);
  expect(request!.path).toBe(`/academic-items/${essay.id}`); expect(request!.method).toBe('PATCH');
  expect(request!.body).toEqual({ courseId: null, due: null });
});
it('sends only an edited deadline, preserving newer server fields absent from a cached row', () => {
  const request = academicFormRequest({ ...academicFormDefaults(essay, zone, today), dueDate: '2025-03-10' }, essay, zone);
  expect(request).toEqual({ path: `/academic-items/${essay.id}`, method: 'PATCH', body: { due: { kind: 'date', date: '2025-03-10' } } });
});
it('does not submit an unchanged form or whitespace-only title change', () => {
  expect(academicFormRequest(academicFormDefaults(essay, zone, today), essay, zone)).toBeNull();
  expect(academicFormRequest({ ...academicFormDefaults(essay, zone, today), title: ` ${essay.title} ` }, essay, zone)).toBeNull();
});
it.each([
  { draft: { kind: 'quiz' as const }, body: { kind: 'quiz' } },
  { draft: { courseId: '' }, body: { courseId: null } },
  { draft: { dueMode: 'none' as const }, body: { due: null } },
  { draft: { dueMode: 'instant' as const, dueTime: '00:00' }, body: { due: { kind: 'instant', at: '2025-03-09T07:00:00Z' } } },
])('sends only the changed coursework field: $body', ({ draft, body }) => {
  expect(academicFormRequest({ ...academicFormDefaults(essay, zone, today), ...draft }, essay, zone)!.body).toEqual(body);
});
it('compares deadline values independently of JSON key order and inactive date controls', () => {
  const item = { ...essay, due: { date: today, kind: 'date' as const } };
  expect(academicFormRequest({ ...academicFormDefaults(item, zone, today), dueTime: '19:00' }, item, zone)).toBeNull();
  const undated = { ...essay, due: null };
  expect(academicFormRequest({ ...academicFormDefaults(undated, zone, today), dueDate: '2025-03-11' }, undated, zone)).toBeNull();
});
