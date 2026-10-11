import { filterWorkload, workloadInbox } from '../src/features/workload-inbox';
import { preparationFixture, planId } from './preparation-fixture';
import { quiz } from './academic-fixture';
import type { PersonalTask } from '../src/lib/types';
const zone = 'America/Edmonton', now = '2025-03-09T18:00:00Z';
const task = (values: Partial<PersonalTask> = {}): PersonalTask => ({ ...preparationFixture().tasks[0], studyPlanId: null, scheduled: null, due: null, ...values });
const inbox = (tasks: PersonalTask[] = [], academic = [quiz], plans = [preparationFixture()], plansCurrent = true, at = now) =>
  workloadInbox({ tasks, academic, plans, plansCurrent }, zone, at);
it('places every open nonrecurring task in exactly one actionable section', () => {
  const tasks = [task({ id: '1', due: { kind: 'date', date: '2025-03-08' }, scheduled: { kind: 'date', date: '2025-03-09' } }),
    task({ id: '2' }), task({ id: '3', scheduled: { kind: 'date', date: '2025-03-09' } }), task({ id: '4', scheduled: { kind: 'date', date: '2025-03-10' } })];
  const result = inbox(tasks, []); expect(result.rows.map(row => row.section)).toEqual(['attention', 'unscheduled', 'today', 'later']);
  expect(new Set(result.rows.map(row => row.kind === 'task' && row.task.id)).size).toBe(4);
});
it('keeps date-only deadlines open for their whole local day and midnight instants exact', () => {
  expect(inbox([task({ due: { kind: 'date', date: '2025-03-09' } })], [], [], true, '2025-03-10T05:59:59Z').attention).toBe(0);
  expect(inbox([task({ due: { kind: 'date', date: '2025-03-09' } })], [], [], true, '2025-03-10T06:00:00Z').attention).toBe(1);
  expect(inbox([task({ due: { kind: 'instant', at: '2025-03-09T07:00:00Z' } })], [], [], true, '2025-03-09T07:00:00Z').attention).toBe(0);
  expect(inbox([task({ due: { kind: 'instant', at: '2025-03-09T07:00:00Z' } })], [], [], true, '2025-03-09T07:00:01Z').attention).toBe(1);
});
it('revisits timed sessions after their estimated end, including sessions crossing midnight', () => {
  const session = task({ scheduled: { kind: 'instant', at: '2025-03-09T06:30:00Z' }, estimatedMinutes: 60 });
  expect(inbox([session], [], [], true, '2025-03-09T07:10:00Z').rows[0].section).toBe('today');
  expect(inbox([session], [], [], true, '2025-03-09T07:30:00Z').rows[0].section).toBe('attention');
  expect(inbox([task({ scheduled: session.scheduled, estimatedMinutes: null })], [], [], true, '2025-03-09T07:10:00Z').attention).toBe(1);
});
it('uses historical fall DST day bounds instead of a fixed-length day', () => {
  const tasks = [task({ scheduled: { kind: 'date', date: '2025-11-02' } })];
  expect(inbox(tasks, [], [], true, '2025-11-03T06:59:59Z').rows[0].section).toBe('today');
  expect(inbox(tasks, [], [], true, '2025-11-03T07:00:00Z').rows[0].section).toBe('attention');
});
it('does not fabricate repeating occurrence state or include completed one-off tasks', () => {
  const repeating = task({ recurrence: { frequency: 'daily', interval: 1 } });
  const result = inbox([repeating, { ...repeating, completedAt: now }, task({ completedAt: now })], []);
  expect(result.rows).toEqual([]); expect(result.recurring).toBe(2);
});
it('defers snoozed work but retains overdue deadlines and returns work when snooze expires', () => {
  const snoozed = task({ snoozedUntil: '2025-03-09T19:00:00Z' });
  const result = inbox([snoozed, { ...snoozed, id: '2', due: { kind: 'date', date: '2025-03-08' } }], []);
  expect(result.deferred).toBe(1); expect(result.rows).toMatchObject([{ kind: 'task', overdue: true, snoozed: true }]);
  expect(inbox([snoozed], [], [], true, '2025-03-09T19:00:00Z').rows).toHaveLength(1);
});
it('uses authoritative task membership and current completion instead of older embedded plan tasks', () => {
  const plan = preparationFixture(); const result = inbox([{ ...plan.tasks[0], completedAt: now }], [], [plan]);
  expect(result.rows).toEqual([]);
  const edited = inbox([{ ...plan.tasks[0], title: 'Changed session' }], [], [plan]);
  expect(edited.rows).toMatchObject([{ task: { title: 'Changed session', studyPlanId: planId }, plan: { id: planId } }]);
});
it('links archived and finished preparation without offering duplicate plan creation', () => {
  for (const plan of [preparationFixture({ archivedAt: now }), { ...preparationFixture(), tasks: preparationFixture().tasks.map(task => ({ ...task, completedAt: now })) }]) {
    expect(inbox([], [quiz], [plan]).rows).toMatchObject([{ kind: 'academic', plan: { id: planId }, canPrepare: false }]);
    expect(inbox([], [quiz], [plan]).coursework).toBe(0);
  }
});
it('prefers a current unarchived plan over a newer archived group', () => {
  const active = preparationFixture(), archived = preparationFixture({ id: 'other', createdAt: '2025-03-09T18:00:00Z', archivedAt: now });
  expect(inbox([], [quiz], [archived, active]).rows).toMatchObject([{ plan: { id: planId } }]);
});
it('excludes submitted/graded coursework but preserves missing/overdue and undated work', () => {
  const result = inbox([], [{ ...quiz, id: '1', submissionState: 'submitted' }, { ...quiz, id: '2', submissionState: 'graded' },
    { ...quiz, id: '3', due: null, submissionState: 'missing' }, { ...quiz, id: '4', due: null, submissionState: null }], []);
  expect(result.rows.map(row => row.section)).toEqual(['attention', 'coursework']); expect(result.coursework).toBe(2);
});
it('requires current plan data to prove absence but keeps known cached links usable', () => {
  expect(inbox([], [quiz], [], false).rows).toMatchObject([{ canPrepare: false }]);
  expect(workloadInbox({ academic: [quiz], plansCurrent: false }, zone, now).complete).toBe(false);
  expect(inbox([], [quiz], [preparationFixture()], false).rows).toMatchObject([{ canPrepare: false, plan: { id: planId } }]);
  expect(inbox([], [quiz], [], true).rows).toMatchObject([{ canPrepare: true }]);
});
it('keeps unknown reads distinct from a confirmed empty workload', () => {
  expect(workloadInbox({ plansCurrent: false }, zone, now)).toMatchObject({ complete: false, rows: [] });
  expect(inbox([], [], [])).toMatchObject({ complete: true, rows: [] });
});
it('includes today deadlines and chosen Main Goals even before scheduling or preparation', () => {
  const result = inbox([task({ id: '1', due: { kind: 'date', date: '2025-03-09' } }), task({ id: '2', mainGoalDate: '2025-03-09' })],
    [{ ...quiz, due: { kind: 'date', date: '2025-03-09' } }], []);
  expect(filterWorkload(result.rows, 'today', '', zone)[0].rows).toHaveLength(3);
  expect(filterWorkload(result.rows, 'queue', '', zone).flatMap(group => group.rows)).toHaveLength(3);
  expect(result.rows).toHaveLength(3);
});
it('filters the three views, searches plan/session content and sorts by deadline deterministically', () => {
  const tasks = [task({ id: '1', title: 'Z task', due: { kind: 'date', date: '2025-03-08' } }),
    task({ id: '2', title: 'A task', due: { kind: 'date', date: '2025-03-07' } }), preparationFixture().tasks[1]];
  const result = inbox(tasks, []);
  expect(filterWorkload(result.rows, 'queue', '', zone)[0].rows.map(row => row.kind === 'task' && row.task.title)).toEqual(['A task', 'Z task']);
  expect(filterWorkload(result.rows, 'later', 'revision', zone)[0].rows).toHaveLength(1);
  expect(filterWorkload(result.rows, 'today', '', zone)).toEqual([]);
  expect(filterWorkload(result.rows, 'queue', 'not found', zone)).toEqual([]);
});
