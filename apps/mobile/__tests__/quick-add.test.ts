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
    expect(parseQuickAdd('Review next monday', today).values).toMatchObject({ scheduledDate: '2026-10-19' });
    expect(parseQuickAdd('Renew card in 2 weeks', today).values).toMatchObject({ scheduledDate: '2026-10-28' });
    expect(parseQuickAdd('Renew card in 2 weeks', today).title).toBe('Renew card');
  });

  it('resolves next weekdays within the following Monday–Sunday calendar week', () => {
    expect(parseQuickAdd('Review next friday', today).values.scheduledDate).toBe('2026-10-23');
    expect(parseQuickAdd('Review next monday', '2026-10-18').values.scheduledDate).toBe('2026-10-19');
    expect(parseQuickAdd('Review next monday', '2026-10-19').values.scheduledDate).toBe('2026-10-26');
    expect(parseQuickAdd('Review next friday', '2026-12-31').values.scheduledDate).toBe('2027-01-08');
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

  describe('repeat phrases (#150)', () => {
    it('makes weekly tasks on chosen weekdays, starting on the next of those days', () => {
      const parsed = parseQuickAdd('Gym every mon wed 7am #gym', '2026-10-15');
      expect(parsed.title).toBe('Gym');
      expect(parsed.values).toMatchObject({ recurrenceMode: 'weekly', interval: '1', weekdays: [1, 3], category: 'fitness',
        scheduledMode: 'instant', scheduledDate: '2026-10-19', scheduledTime: '07:00' });
      expect(parsed.details).toContain('Repeats Mon, Wed');
      expect(parseQuickAdd('Gym every mon wed 7am', today).values.scheduledDate).toBe(today);
      expect(parseQuickAdd('Clean room every sat', today).values).toMatchObject({ recurrenceMode: 'weekly', weekdays: [6], scheduledDate: '2026-10-17' });
      expect(parseQuickAdd('Call home every monday and thursday', today).values).toMatchObject({ weekdays: [1, 4], scheduledDate: '2026-10-15' });
    });

    it('makes daily tasks starting on the planned day', () => {
      expect(parseQuickAdd('Take vitamins daily', today)).toMatchObject({ title: 'Take vitamins', details: ['Repeats daily'],
        values: { recurrenceMode: 'daily', interval: '1', weekdays: [], scheduledMode: 'date', scheduledDate: today } });
      expect(parseQuickAdd('Stretch every day', today).values).toMatchObject({ recurrenceMode: 'daily', interval: '1' });
      expect(parseQuickAdd('Water plants every 2 days', today)).toMatchObject({ title: 'Water plants', details: ['Repeats every 2 days'], values: { recurrenceMode: 'daily', interval: '2' } });
    });

    it('reads week intervals, workweeks and plain weekly', () => {
      expect(parseQuickAdd('Laundry every 2 weeks sat', today)).toMatchObject({ title: 'Laundry',
        values: { recurrenceMode: 'weekly', interval: '2', weekdays: [6], scheduledDate: '2026-10-17' } });
      expect(parseQuickAdd('Laundry every 2 weeks sat', today).details).toContain('Repeats every 2 weeks on Sat');
      expect(parseQuickAdd('Rent every other week fri', today).values).toMatchObject({ interval: '2', weekdays: [5], scheduledDate: '2026-10-16' });
      expect(parseQuickAdd('Standup every weekday 9am', today)).toMatchObject({ title: 'Standup',
        values: { recurrenceMode: 'weekly', interval: '1', weekdays: [1, 2, 3, 4, 5], scheduledDate: today, scheduledTime: '09:00' } });
      expect(parseQuickAdd('Standup every weekday 9am', today).details).toContain('Repeats weekdays');
      expect(parseQuickAdd('Review notes weekly', today).values).toMatchObject({ recurrenceMode: 'weekly', interval: '1', weekdays: [3], scheduledDate: today });
      expect(parseQuickAdd('Review notes weekly fri', today).values).toMatchObject({ weekdays: [5], scheduledDate: '2026-10-16' });
    });

    it('keeps out-of-range intervals in the title and leaves other text alone', () => {
      expect(parseQuickAdd('Task every 400 days', today)).toMatchObject({ title: 'Task every 400 days', details: [] });
      expect(parseQuickAdd('Task every 400 days', today).values.recurrenceMode).toBeUndefined();
      expect(parseQuickAdd('Task every 60 weeks', today).title).toBe('Task every 60 weeks');
      expect(parseQuickAdd('Task every 0 days', today).title).toBe('Task every 0 days');
      expect(parseQuickAdd('Buy groceries', today).values.recurrenceMode).toBeUndefined();
    });

    it('builds a valid recurring create request', () => {
      expect(request('Gym every mon wed 7am #gym')).toMatchObject({ title: 'Gym', recurrence: { frequency: 'weekly', interval: 1, weekdays: [1, 3] },
        scheduled: { kind: 'instant', at: '2026-10-14T13:00:00Z' } });
      expect(request('Take vitamins daily')).toMatchObject({ recurrence: { frequency: 'daily', interval: 1 }, scheduled: { kind: 'date', date: today } });
      expect(request('Pay rent every 4 weeks due fri')).toMatchObject({ recurrence: { frequency: 'weekly', interval: 4, weekdays: [5] }, due: { kind: 'date', date: '2026-10-16' } });
    });
  });

  it('leaves unknown tags, impossible times and long estimates in the title', () => {
    expect(parseQuickAdd('Post #random', today).title).toBe('Post #random');
    expect(parseQuickAdd('Meet 25:00', today).title).toBe('Meet 25:00');
    expect(parseQuickAdd('Marathon 2000m', today).title).toBe('Marathon 2000m');
  });

  it('builds a valid create request in the account zone, including across DST', () => {
    expect(request('Essay due fri 5pm #uni')).toMatchObject({ title: 'Essay', category: 'university', due: { kind: 'instant', at: '2026-10-16T23:00:00Z' } });
    // New York falls back on 1 Nov 2026: 9am is 14:00Z (EST) rather than 13:00Z. (Edmonton's
    // future rules differ between tz-data releases, so it isn't used for this boundary.)
    expect(request('Clocks nov 2 9am', 'America/New_York')).toMatchObject({ scheduled: { kind: 'instant', at: '2026-11-02T14:00:00Z' } });
    expect(request('Clocks oct 31 9am', 'America/New_York')).toMatchObject({ scheduled: { kind: 'instant', at: '2026-10-31T13:00:00Z' } });
    expect(() => request('#uni !high')).toThrow(/Enter a title/);
  });
});
