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
