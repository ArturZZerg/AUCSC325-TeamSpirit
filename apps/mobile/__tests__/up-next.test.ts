import { upNext } from '../src/features/up-next';
import type { UpcomingExam } from '../src/features/exams';
import type { PlanItem } from '../src/lib/types';

const date = '2026-10-15', zone = 'America/Edmonton', now = Date.parse('2026-10-15T18:00:00Z'); // noon local
let n = 0;
const item = (patch: Partial<PlanItem>): PlanItem => ({ key: `k${++n}`, kind: 'personalTask', entityId: `10000000-0000-4000-8000-00000000000${n % 10}`, occurrenceKey: null,
  title: `Item ${n}`, schedule: { kind: 'date', date }, due: null, state: 'today', isMainGoal: false, priority: 'medium', allowedActions: ['complete'], ...patch });
const exam = (daysLeft: number): UpcomingExam => ({ id: '50000000-0000-4000-8000-000000000001', title: 'Midterm', date: '2026-10-17', daysLeft });

describe('up next', () => {
  it('prefers the oldest overdue work, then the Main Goal', () => {
    const late = item({ state: 'overdue', title: 'Late', due: { kind: 'date', date: '2026-10-13' } });
    const later = item({ state: 'overdue', title: 'Later', due: { kind: 'instant', at: '2026-10-14T20:00:00Z' } });
    const main = item({ isMainGoal: true, title: 'Main' });
    expect(upNext([main, later, late], [], date, zone, now)).toMatchObject({ item: { title: 'Late' }, reason: 'Overdue since Tue, Oct 13' });
    expect(upNext([main, later], [], date, zone, now)).toMatchObject({ item: { title: 'Later' }, reason: 'Overdue since Wed, Oct 14' });
    expect(upNext([main, item({})], [exam(1)], date, zone, now)).toMatchObject({ item: { title: 'Main' }, reason: 'Your Main Goal for today' });
  });
  it('then the next timed deadline today, then a close exam', () => {
    const passed = item({ title: 'Passed', due: { kind: 'instant', at: '2026-10-15T17:00:00Z' } });
    const soon = item({ kind: 'academic', title: 'Lab', due: { kind: 'instant', at: '2026-10-15T23:00:00Z' } });
    const tomorrow = item({ title: 'Tomorrow', due: { kind: 'instant', at: '2026-10-16T18:00:00Z' } });
    expect(upNext([passed, tomorrow, soon], [exam(2)], date, zone, now)).toMatchObject({ item: { title: 'Lab' }, reason: expect.stringMatching(/^Due today at 5:00\sPM$/) });
    expect(upNext([tomorrow], [exam(2)], date, zone, now)).toEqual({ kind: 'exam', exam: exam(2), reason: 'Exam in 2 days' });
    expect(upNext([], [exam(0)], date, zone, now)?.reason).toBe('Exam today');
    expect(upNext([], [exam(4)], date, zone, now)).toBeUndefined();
  });
  it('then due-today work by priority, then planned tasks, never routines, events or finished work', () => {
    const low = item({ title: 'B low', priority: 'low', due: { kind: 'date', date } }), high = item({ title: 'A high', priority: 'high', due: { kind: 'date', date } });
    expect(upNext([low, high], [], date, zone, now)).toMatchObject({ item: { title: 'A high' }, reason: 'High priority, due today' });
    expect(upNext([item({ title: 'Plain' })], [], date, zone, now)).toMatchObject({ reason: 'Next in today’s plan' });
    expect(upNext([item({ kind: 'goal' }), item({ kind: 'event' }), item({ state: 'completed' }), item({ state: 'snoozed' }), item({ kind: 'academic', state: 'submitted' })], [], date, zone, now)).toBeUndefined();
  });
});
