import { parseQuickAdd } from '../src/features/quick-add';
import { taskFormDefaults, taskFormRequest, type TaskFormValues } from '../src/features/task-form';

// Wednesday 14 October 2026.
const today = '2026-10-14';
const request = (input: string, zone = 'America/Edmonton', planDate = today) =>
  taskFormRequest({ ...taskFormDefaults(null, zone), ...parseQuickAdd(input, today, planDate).values } as TaskFormValues, null, zone).body;

describe('quick add parsing', () => {
  it('plans plain text for the displayed day', () => {
    expect(parseQuickAdd('Buy groceries', today, '2026-10-16')).toEqual({ title: 'Buy groceries', details: [],
      values: { title: 'Buy groceries', scheduledMode: 'date', scheduledDate: '2026-10-16', scheduledTime: '' } });
  });

  it('recognises relative days, weekdays and next-week weekdays', () => {
    expect(parseQuickAdd('Call mom tomorrow', today).values).toMatchObject({ scheduledMode: 'date', scheduledDate: '2026-10-15' });
    expect(parseQuickAdd('Laundry fri', today).values).toMatchObject({ scheduledDate: '2026-10-16' });
    expect(parseQuickAdd('Team sync wednesday', today).values).toMatchObject({ scheduledDate: today });
    expect(parseQuickAdd('Review next monday', today).values).toMatchObject({ scheduledDate: '2026-10-26' });
    expect(parseQuickAdd('Renew card in 2 weeks', today).values).toMatchObject({ scheduledDate: '2026-10-28' });
    expect(parseQuickAdd('Renew card in 2 weeks', today).title).toBe('Renew card');
  });

  it('marks deadlines with due/by and combines date and time', () => {
    const parsed = parseQuickAdd('Essay draft due fri 5pm', today);
    expect(parsed.title).toBe('Essay draft');
    expect(parsed.values).toMatchObject({ dueMode: 'instant', dueDate: '2026-10-16', dueTime: '17:00' });
    expect(parsed.values.scheduledMode).toBeUndefined();
    expect(parsed.details).toEqual([expect.stringMatching(/^Due Fri, Oct 16 · 5:00\sPM$/)]);
    expect(parseQuickAdd('Submit lab by 11:59pm', today).values).toMatchObject({ dueMode: 'instant', dueDate: today, dueTime: '23:59' });
  });

  it('parses month-day dates, rolling past dates into next year and rejecting impossible days', () => {
    expect(parseQuickAdd('Midterm Oct 20', today).values).toMatchObject({ scheduledDate: '2026-10-20' });
    expect(parseQuickAdd('Midterm 20th october', today).values).toMatchObject({ scheduledDate: '2026-10-20' });
    expect(parseQuickAdd('Taxes apr 30', today).values).toMatchObject({ scheduledDate: '2027-04-30' });
    expect(parseQuickAdd('Party feb 30', today).title).toBe('Party feb 30');
  });

  it('reads times, tonight, priority, category and estimates and strips them from the title', () => {
    const parsed = parseQuickAdd('Read chapter 4 tonight #uni !high 45m', today);
    expect(parsed.title).toBe('Read chapter 4');
    expect(parsed.values).toMatchObject({ scheduledMode: 'instant', scheduledDate: today, scheduledTime: '20:00', priority: 'high', category: 'university', estimatedMinutes: '45' });
    expect(parsed.details).toEqual([expect.stringMatching(/^Planned today · 8:00\sPM$/), 'High priority', 'University', '45 min']);
    expect(parseQuickAdd('Gym at 7:30am for 1.5h #gym', today).values).toMatchObject({ scheduledTime: '07:30', estimatedMinutes: '90', category: 'fitness' });
    expect(parseQuickAdd('Lunch noon', today).values).toMatchObject({ scheduledTime: '12:00' });
    expect(parseQuickAdd('Lunch 12am', today).values).toMatchObject({ scheduledTime: '00:00' });
  });

  it('leaves unknown tags, impossible times and long estimates in the title', () => {
    expect(parseQuickAdd('Post #random', today).title).toBe('Post #random');
    expect(parseQuickAdd('Meet 25:00', today).title).toBe('Meet 25:00');
    expect(parseQuickAdd('Marathon 2000m', today).title).toBe('Marathon 2000m');
  });

  it('builds a valid create request in the account zone, including across DST', () => {
    expect(request('Essay due fri 5pm #uni')).toMatchObject({ title: 'Essay', category: 'university', due: { kind: 'instant', at: '2026-10-16T23:00:00Z' } });
    // Edmonton falls back on 1 Nov 2026: 9am is 16:00Z (MST) rather than 15:00Z.
    expect(request('Clocks nov 2 9am')).toMatchObject({ scheduled: { kind: 'instant', at: '2026-11-02T16:00:00Z' } });
    expect(() => request('#uni !high')).toThrow(/Enter a title/);
  });
});
