import { groupTasks, taskBucket, taskSummary } from '../src/features/task-groups';
import type { PersonalTask } from '../src/lib/types';
import { snapshotFixture } from './snapshot-fixture';

const zone = 'America/Edmonton', today = '2026-10-14', now = Date.parse('2026-10-14T18:00:00Z');
const base: PersonalTask = { ...snapshotFixture().personalTasks[0], due: null, scheduled: null, recurrence: null, completedAt: null, priority: 'medium' };
let id = 0;
const task = (patch: Partial<PersonalTask>): PersonalTask => ({ ...base, id: `20000000-0000-4000-8000-${String(++id).padStart(12, '0')}`, ...patch });

describe('task due buckets (account zone)', () => {
  it('classifies by passed deadline first, then the earlier of schedule and deadline', () => {
    expect(taskBucket(task({ due: { kind: 'date', date: '2026-10-13' } }), today, zone, now)).toBe('overdue');
    expect(taskBucket(task({ due: { kind: 'date', date: today } }), today, zone, now)).toBe('today');
    // A timed deadline earlier today has passed; a later one has not.
    expect(taskBucket(task({ due: { kind: 'instant', at: '2026-10-14T17:00:00Z' } }), today, zone, now)).toBe('overdue');
    expect(taskBucket(task({ due: { kind: 'instant', at: '2026-10-15T05:59:00Z' } }), today, zone, now)).toBe('today');
    expect(taskBucket(task({ scheduled: { kind: 'date', date: '2026-10-15' }, due: { kind: 'date', date: '2026-10-30' } }), today, zone, now)).toBe('tomorrow');
    expect(taskBucket(task({ scheduled: { kind: 'date', date: '2026-10-10' } }), today, zone, now)).toBe('today');
    expect(taskBucket(task({ due: { kind: 'date', date: '2026-10-21' } }), today, zone, now)).toBe('week');
    expect(taskBucket(task({ due: { kind: 'date', date: '2026-10-22' } }), today, zone, now)).toBe('later');
    expect(taskBucket(task({}), today, zone, now)).toBe('someday');
    expect(taskBucket(task({ recurrence: { frequency: 'daily', interval: 1 } }), today, zone, now)).toBe('repeating');
    expect(taskBucket(task({ completedAt: '2026-10-14T10:00:00Z', due: { kind: 'date', date: '2026-10-01' } }), today, zone, now)).toBe('completed');
  });

  it('orders buckets, sorts by timing then priority, and never mutates input', () => {
    const later = task({ title: 'B', due: { kind: 'date', date: today }, priority: 'low' });
    const urgent = task({ title: 'A', due: { kind: 'date', date: today }, priority: 'high' });
    const old = task({ title: 'Old', due: { kind: 'date', date: '2026-10-01' } });
    const first = task({ title: 'Done first', completedAt: '2026-10-13T10:00:00Z' }), second = task({ title: 'Done second', completedAt: '2026-10-14T10:00:00Z' });
    const input = Object.freeze([later, first, urgent, old, second]);
    const groups = groupTasks(input, today, zone, now);
    expect(groups.map(group => group.bucket)).toEqual(['overdue', 'today', 'completed']);
    expect(groups[1].tasks.map(row => row.title)).toEqual(['A', 'B']);
    expect(groups[2].tasks.map(row => row.title)).toEqual(['Done second', 'Done first']);
    expect(groupTasks([], today, zone, now)).toEqual([]);
  });

  it('summarises open and overdue work', () => {
    expect(taskSummary([task({ due: { kind: 'date', date: '2026-10-01' } }), task({}), task({ completedAt: '2026-10-14T10:00:00Z' })], today, zone, now))
      .toEqual({ open: 2, overdue: 1 });
  });
});
