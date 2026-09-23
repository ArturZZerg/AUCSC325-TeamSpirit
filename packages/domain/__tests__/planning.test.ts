import { composeToday, dayBounds, goalOccursOn, isOverdue, overlapsDay, reminderFireAt, temporalState } from '../src';

const base = { date: '2026-03-08', timeZone: 'America/Edmonton', now: '2026-03-08T18:00:00Z', academicItems: [], goals: [], goalCompletions: [], events: [], savedEvents: [] };

describe('timezone-aware planning', () => {
  it('uses the actual length of daylight-saving days', () => {
    const spring = dayBounds('2026-03-08', 'America/Edmonton');
    const fall = dayBounds('2026-11-01', 'America/Edmonton');
    expect(Date.parse(spring.end) - Date.parse(spring.start)).toBe(23 * 60 * 60 * 1000);
    expect(Date.parse(fall.end) - Date.parse(fall.start)).toBe(25 * 60 * 60 * 1000);
  });

  it('treats date-only deadlines as overdue only after their local date', () => {
    expect(isOverdue({ kind: 'date', date: '2026-03-08' }, '2026-03-08T23:59:00Z', 'America/Edmonton')).toBe(false);
    expect(isOverdue({ kind: 'date', date: '2026-03-07' }, '2026-03-08T23:59:00Z', 'America/Edmonton')).toBe(true);
  });

  it('does not mark submitted academic work overdue', () => {
    expect(temporalState({ due: { kind: 'date', date: '2026-03-07' }, submissionState: 'submitted', now: base.now, date: base.date, timeZone: base.timeZone })).toBe('submitted');
  });

  it('keeps a source deadline when a task is snoozed', () => {
    const plan = composeToday({ ...base, personalTasks: [{ id: 't', title: 'Pay bill', priority: 'high', due: { kind: 'date', date: '2026-03-07' }, snoozedUntil: '2026-03-09T18:00:00Z' }] });
    expect(plan.items[0]).toMatchObject({ state: 'overdue', due: { kind: 'date', date: '2026-03-07' } });
  });

  it('puts the selected main goal first and gives stable ordering to ties', () => {
    const plan = composeToday({ ...base, personalTasks: [
      { id: 'b', title: 'B', priority: 'medium', scheduled: { kind: 'date', date: '2026-03-08' } },
      { id: 'a', title: 'A', priority: 'medium', scheduled: { kind: 'date', date: '2026-03-08' } },
      { id: 'z', title: 'Main', priority: 'low', mainGoalDate: '2026-03-08' },
    ] });
    expect(plan.items.map(item => item.key)).toEqual(['personalTask:z', 'personalTask:a', 'personalTask:b']);
  });

  it('creates daily and weekday goal occurrences but not a mandatory weekly target occurrence', () => {
    expect(goalOccursOn({ id: 'd', title: 'Water', schedule: { kind: 'daily' }, timeZone: 'America/Edmonton' }, '2026-03-08')).toBe(true);
    expect(goalOccursOn({ id: 'w', title: 'Study', schedule: { kind: 'weekly', weekdays: [1] }, timeZone: 'America/Edmonton' }, '2026-03-08')).toBe(false);
    expect(goalOccursOn({ id: 't', title: 'Gym', schedule: { kind: 'weeklyTarget', target: 3 }, timeZone: 'America/Edmonton' }, '2026-03-09')).toBe(false);
  });

  it('calculates reminder times from local midnight for date-only targets', () => {
    expect(reminderFireAt({ kind: 'date', date: '2026-03-08' }, 30, 'America/Edmonton')).toBe('2026-03-08T06:30:00Z');
  });

  it('does not include an event that ended at midnight of the selected day', () => {
    expect(overlapsDay('2026-03-08T06:00:00Z', '2026-03-08T07:00:00Z', '2026-03-08', 'America/Edmonton')).toBe(false);
  });

  it('does not project a later overdue task into an earlier historical plan', () => {
    const plan = composeToday({ ...base, date: '2026-03-06', personalTasks: [{ id: 't', title: 'Later', priority: 'high', due: { kind: 'date', date: '2026-03-07' } }] });
    expect(plan.items).toHaveLength(0);
  });

  it('puts timed entries before date-only entries after the main goal and overdue groups', () => {
    const plan = composeToday({ ...base, personalTasks: [{ id: 'date', title: 'Date', priority: 'high', scheduled: { kind: 'date', date: '2026-03-08' } }, { id: 'timed', title: 'Timed', priority: 'low', scheduled: { kind: 'instant', at: '2026-03-08T19:00:00Z' } }] });
    expect(plan.items.map(item => item.key)).toEqual(['personalTask:timed', 'personalTask:date']);
  });

  it('keeps a completed recurring occurrence from completing later occurrences', () => {
    const plan = composeToday({ ...base, date: '2026-03-09', personalTasks: [{ id: 'routine', title: 'Walk', priority: 'low', scheduled: { kind: 'date', date: '2026-03-08' }, recurrence: { frequency: 'daily' }, completedAt: '2026-03-08T20:00:00Z', completedOccurrenceKeys: ['2026-03-08'] }] });
    expect(plan.items[0]).toMatchObject({ occurrenceKey: '2026-03-09', state: 'today' });
  });
});
