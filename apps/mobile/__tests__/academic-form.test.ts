import { academicFormDefaults, academicFormRequest, academicFormSchema } from '../src/features/academic-form';
import { essay } from './academic-fixture';
const zone = 'America/Edmonton'; const today = '2025-03-09';
const defaults = () => ({ ...academicFormDefaults(null, zone, today), title: '  Essay  ' });
it('creates independent coursework with a date-only deadline in the account calendar', () => {
  expect(academicFormRequest(defaults(), null, zone)).toEqual({ path: '/academic-items', method: 'POST', body: { title: 'Essay', kind: 'assignment', courseId: null, due: { kind: 'date', date: today } } });
});
it('supports an undated quiz without Canvas or course metadata', () => {
  expect(academicFormRequest({ ...defaults(), kind: 'quiz', dueMode: 'none' }, null, zone).body).toMatchObject({ kind: 'quiz', due: null, courseId: null });
});
it('converts an exact local midnight to UTC', () => {
  expect(academicFormRequest({ ...defaults(), dueMode: 'instant', dueTime: '00:00' }, null, zone).body.due).toEqual({ kind: 'instant', at: '2025-03-09T07:00:00Z' });
});
it.each(['', '2025-02-29', '2025-04-31', 'tomorrow'])('rejects invalid dates %s', dueDate => {
  expect(academicFormSchema(null, zone).safeParse({ ...defaults(), dueDate }).success).toBe(false);
});
it.each([{ dueDate: today, dueTime: '02:30' }, { dueDate: '2025-11-02', dueTime: '01:30' }, { dueDate: today, dueTime: '24:00' }])('rejects DST gaps/folds and invalid clocks %j', timing => {
  expect(academicFormSchema(null, zone).safeParse({ ...defaults(), dueMode: 'instant', ...timing }).success).toBe(false);
});
it('preserves exact folded instants and seconds during a title edit', () => {
  const item = { ...essay, source: 'manual', due: { kind: 'instant' as const, at: '2025-11-02T08:30:42Z' } };
  expect(academicFormRequest({ ...academicFormDefaults(item, zone, today), title: 'Changed' }, item, zone).body.due).toEqual(item.due);
});
it('edits course and clears the deadline without changing submission state', () => {
  const request = academicFormRequest({ ...academicFormDefaults(essay, zone, today), courseId: '', dueMode: 'none' }, essay, zone);
  expect(request.path).toBe(`/academic-items/${essay.id}`); expect(request.method).toBe('PATCH');
  expect(request.body).toEqual({ title: essay.title, kind: 'assignment', courseId: null, due: null });
});
