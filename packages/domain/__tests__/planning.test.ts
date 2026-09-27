import { composeToday, dayBounds, goalOccursOn, isOverdue, overlapsDay, reminderFireAt, temporalState } from '../src';

const base = { date: '2026-03-08', timeZone: 'America/Edmonton', now: '2026-03-08T18:00:00Z', academicItems: [], goals: [], goalCompletions: [], events: [], savedEvents: [] };

describe('timezone-aware planning', () => {
  it('uses the actual length of daylight-saving days', () => {
    const spring = dayBounds('2026-03-08', 'America/Edmonton');
    // Historical transition: newer tzdb versions no longer switch Edmonton in fall 2026.
    const fall = dayBounds('2025-11-02', 'America/Edmonton');
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

describe('recurring task occurrence identity', () => {
  const task = { id: 'weekly', title: 'Study', priority: 'medium' as const,
    scheduled: { kind: 'date' as const, date: '2026-03-02' },
    due: { kind: 'date' as const, date: '2026-03-02' },
    recurrence: { frequency: 'weekly' as const, weekdays: [1] }, completedOccurrenceKeys: ['2026-03-02'] };

  it('does not turn an old template deadline into an off-schedule occurrence', () => {
    const plan = composeToday({ ...base, personalTasks: [task] });
    expect(plan.items).toEqual([]);
    expect(plan.upcoming).toHaveLength(1);
    expect(plan.upcoming[0]).toMatchObject({ key: 'personalTask:weekly:2026-03-09', due: { kind: 'date', date: '2026-03-09' } });
  });

  it('keeps completed occurrences visible and future occurrences incomplete', () => {
    const completed = composeToday({ ...base, date: '2026-03-02', personalTasks: [task] });
    expect(completed.items[0].state).toBe('completed');
    const next = composeToday({ ...base, date: '2026-03-09', now: '2026-03-09T18:00:00Z', personalTasks: [task] });
    expect(next.items[0]).toMatchObject({ state: 'today', occurrenceKey: '2026-03-09', due: { kind: 'date', date: '2026-03-09' } });
  });

  it('restores only the undone occurrence', () => {
    const undone = composeToday({ ...base, date: '2026-03-02', now: '2026-03-02T18:00:00Z', personalTasks: [{ ...task, completedOccurrenceKeys: ['2026-03-09'] }] });
    expect(undone.items[0].state).toBe('today');
  });

  it.each([
    ['2026-03-07', '2026-03-08', '2026-03-07T16:00:00Z', '2026-03-08T15:00:00Z'],
    ['2025-11-01', '2025-11-02', '2025-11-01T15:00:00Z', '2025-11-02T16:00:00Z'],
  ])('preserves the local reminder-free task time across DST from %s', (_anchor, date, at, expected) => {
    const plan = composeToday({ ...base, date, now: `${date}T12:00:00Z`, personalTasks: [{ id: 'timed', title: 'Study', priority: 'low',
      scheduled: { kind: 'instant', at }, due: { kind: 'instant', at }, recurrence: { frequency: 'daily' } }] });
    expect(plan.items[0]).toMatchObject({ schedule: { kind: 'instant', at: expected }, due: { kind: 'instant', at: expected }, state: 'today' });
  });
});

describe('event and deadline boundaries', () => {
  it('filters and orders suggestions, with exclusive ends and no duplicate saved events', () => {
    const events = [
      { id: 'tomorrow', title: 'Tomorrow', timing: { kind: 'timed' as const, startsAt: '2026-03-09T06:00:00Z' } },
      { id: 'late', title: 'Late', timing: { kind: 'timed' as const, startsAt: '2026-03-08T20:00:00Z' } },
      { id: 'overlap', title: 'Overnight', timing: { kind: 'timed' as const, startsAt: '2026-03-08T06:00:00Z', endsAt: '2026-03-08T08:00:00Z' } },
      { id: 'ended', title: 'Ended', timing: { kind: 'timed' as const, startsAt: '2026-03-08T06:00:00Z', endsAt: '2026-03-08T07:00:00Z' } },
      { id: 'all', title: 'All day', timing: { kind: 'allDay' as const, startDate: '2026-03-08', endDateExclusive: '2026-03-09' } },
    ];
    const plan = composeToday({ ...base, personalTasks: [], events, savedEvents: [{ eventId: 'all', includedInPlan: true }] });
    expect(plan.campusEvents.map(event => event.id)).toEqual(['overlap', 'late']);
    expect(plan.items.map(item => item.entityId)).toEqual(['all']);
  });

  it('includes an exact local-midnight deadline on the day starting then', () => {
    const task = { id: 'midnight', title: 'Due', priority: 'low' as const, due: { kind: 'instant' as const, at: '2026-03-08T07:00:00Z' } };
    expect(composeToday({ ...base, personalTasks: [task] }).items[0].entityId).toBe('midnight');
    expect(composeToday({ ...base, date: '2026-03-07', personalTasks: [task] }).items).toEqual([]);
    expect(isOverdue(undefined, base.now, base.timeZone)).toBe(false);
  });

  it('retains both repeated fall-back hours and excludes the next midnight', () => {
    expect(overlapsDay('2025-11-02T07:30:00Z', undefined, '2025-11-02', base.timeZone)).toBe(true);
    expect(overlapsDay('2025-11-02T08:30:00Z', undefined, '2025-11-02', base.timeZone)).toBe(true);
    expect(overlapsDay('2025-11-03T07:00:00Z', undefined, '2025-11-02', base.timeZone)).toBe(false);
  });
});


describe('chronological ordering', () => {
  it('compares instants rather than their fractional-second spelling', () => {
    const plan = composeToday({ ...base, personalTasks: [
      { id: 'z', title: 'Exact', priority: 'medium', scheduled: { kind: 'instant', at: '2026-03-08T20:00:00Z' } },
      { id: 'a', title: 'Fraction', priority: 'medium', scheduled: { kind: 'instant', at: '2026-03-08T20:00:00.001Z' } },
    ], events: [
      { id: 'z', title: 'Exact', timing: { kind: 'timed', startsAt: '2026-03-08T20:00:00Z' } },
      { id: 'a', title: 'Fraction', timing: { kind: 'timed', startsAt: '2026-03-08T20:00:00.001Z' } },
    ] });
    expect(plan.items.map(item => item.entityId)).toEqual(['z', 'a']);
    expect(plan.campusEvents.map(event => event.id)).toEqual(['z', 'a']);
  });
});
