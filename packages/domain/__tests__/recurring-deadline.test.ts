import { composeToday, type PersonalTask, type TodayInput } from '../src';

// Today must include tasks scheduled OR due on the selected day.
// Requirement: docs/architecture/overview.md, Today read model.
const task: PersonalTask = {
  id: 'weekly-report', title: 'Weekly report', priority: 'medium',
  scheduled: { kind: 'date', date: '2026-11-09' },
  due: { kind: 'date', date: '2026-11-10' },
  recurrence: { frequency: 'weekly', interval: 1, weekdays: [1] },
};
const base: TodayInput = {
  date: '2026-11-10', timeZone: 'America/Regina', now: '2026-11-10T18:00:00Z',
  personalTasks: [task], academicItems: [], goals: [], goalCompletions: [], events: [], savedEvents: [],
};

describe('recurring tasks with a deadline after their scheduled day', () => {
  it('retains a shifted midnight deadline and occurrence identity after spring DST', () => {
    const timed: PersonalTask = { ...task,
      scheduled: { kind: 'instant', at: '2026-03-07T14:00:00Z' }, // Saturday 09:00 EST
      due: { kind: 'instant', at: '2026-03-08T05:00:00Z' }, // Sunday 00:00 EST
      recurrence: { frequency: 'weekly', weekdays: [6] } };
    const input = { ...base, timeZone: 'America/New_York', personalTasks: [timed] };
    const scheduled = composeToday({ ...input, date: '2026-03-14', now: '2026-03-14T12:00:00Z' });
    const deadline = composeToday({ ...input, date: '2026-03-15', now: '2026-03-15T04:00:01Z' });
    const expected = { key: 'personalTask:weekly-report:2026-03-14', occurrenceKey: '2026-03-14',
      schedule: { kind: 'instant', at: '2026-03-14T13:00:00Z' }, // Saturday 09:00 EDT
      due: { kind: 'instant', at: '2026-03-15T04:00:00Z' } }; // Sunday 00:00 EDT
    expect(scheduled.items).toEqual([expect.objectContaining(expected)]);
    expect(deadline.items).toEqual([expect.objectContaining({ ...expected, state: 'overdue' })]);
    expect(deadline.upcoming.some(item => item.key === expected.key)).toBe(false);
  });

  it('shows the weekly occurrence on its scheduled Monday', () => {
    const plan = composeToday({ ...base, date: '2026-11-09', now: '2026-11-09T18:00:00Z' });
    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityId: task.id, occurrenceKey: '2026-11-09', due: task.due }),
    ]));
  });

  it('shows a nonrecurring task on its Tuesday deadline despite a Monday schedule', () => {
    const plan = composeToday({ ...base, personalTasks: [{ ...task, recurrence: undefined }] });
    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityId: task.id, due: task.due }),
    ]));
  });

  it('keeps the incomplete Monday occurrence visible on its Tuesday deadline', () => {
    const plan = composeToday(base);
    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'personalTask:weekly-report:2026-11-09', entityId: task.id,
        occurrenceKey: '2026-11-09', schedule: task.scheduled, due: task.due }),
    ]));
  });

  it('lists each occurrence once and never in both Today and Coming up', () => {
    const plan = composeToday(base);
    const mondayKey = 'personalTask:weekly-report:2026-11-09';
    expect(plan.items.filter(item => item.key === mondayKey)).toHaveLength(1);
    expect(plan.upcoming.some(item => item.key === mondayKey)).toBe(false);
    const keys = [...plan.items, ...plan.upcoming].map(item => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses Monday completion in Tuesday\'s plan without completing next week', () => {
    const open = composeToday(base);
    const occurrence = open.items.find(item => item.entityId === task.id)!;
    expect(occurrence.occurrenceKey).toBe('2026-11-09');
    expect(occurrence.state).not.toBe('completed');

    // Replay the saved occurrence key supplied by Tuesday's displayed item.
    const completedTask = { ...task, completedOccurrenceKeys: [occurrence.occurrenceKey!] };
    const completed = composeToday({ ...base, personalTasks: [completedTask] });
    expect(completed.items).toEqual([
      expect.objectContaining({ occurrenceKey: '2026-11-09', state: 'completed' }),
    ]);
    expect(completed.upcoming).toEqual([
      expect.objectContaining({ occurrenceKey: '2026-11-16', state: 'upcoming' }),
    ]);
  });
});
