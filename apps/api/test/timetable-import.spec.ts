import { addCalendarDays, localClockAt } from '@campusflow/domain';
import { IcsEventProvider, icsStopIssues } from '../src/integrations/events/ics-event-provider';
import { detectClassPatterns, uploadLimits } from '../src/integrations/timetable/timetable-import';

const zone = 'America/Edmonton', today = '2026-10-18';
const calendar = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...events, 'END:VCALENDAR'].join('\r\n');
const event = (uid: string, lines: string[]) => ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260901T000000Z', ...lines, 'END:VEVENT'].join('\r\n');
async function preview(ics: string, saved: { id: string; title: string; startTime: string; weekdays: number[] }[] = []) {
  const batch = await new IcsEventProvider(async () => ics, { timeZone: zone, partial: true, limits: uploadLimits })
    .fetchEvents({ from: addCalendarDays(today, -90), through: addCalendarDays(today, 275), timeZone: zone });
  if (batch.status === 'failed') throw new Error(batch.issues.join());
  return detectClassPatterns(batch.events, { timeZone: zone, today, saved, unsupported: batch.issues.filter(issue => !icsStopIssues.includes(issue)).length,
    truncated: batch.issues.some(issue => icsStopIssues.includes(issue)) });
}
// Seven explicit Tuesday/Thursday meetings per weekday, as some schedule exports write them.
const explicit = (title: string, days: string[], time: [string, string], room: string) => days.map(date => event(`${title}-${date}-${time[0]}`, [
  `SUMMARY:${title}`, `LOCATION:${room}`, `DTSTART;TZID=${zone}:${date.replace(/-/g, '')}T${time[0]}00`, `DTEND;TZID=${zone}:${date.replace(/-/g, '')}T${time[1]}00`]));

describe('timetable import', () => {
  it('turns a weekly recurring lecture into one class, honouring exclusions and DST in the account zone', async () => {
    const result = await preview(calendar(event('psych', ['SUMMARY:PSYC 104 Lecture', 'LOCATION:Classroom Building 2-150',
      `DTSTART;TZID=${zone}:20260909T090000`, `DTEND;TZID=${zone}:20260909T095000`,
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261209T235959Z', `EXDATE;TZID=${zone}:20261012T090000`])));
    expect(result.classes).toEqual([expect.objectContaining({ title: 'PSYC 104 Lecture', weekdays: [1, 3, 5], startTime: '09:00', endTime: '09:50',
      termStart: '2026-09-09', termEnd: '2026-12-09', location: 'Classroom Building 2-150', timeZone: zone, duplicateOf: null })]);
    // 14 weeks of MWF from Wed 9 Sep to Wed 9 Dec is 40 meetings, minus Thanksgiving Monday. The Nov 1 DST change keeps 09:00.
    expect(result.classes[0].meetings).toBe(39);
  });

  it('merges explicit per-meeting events into weekdays and keeps a lab at another time separate', async () => {
    const tuesdays = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'], thursdays = tuesdays.map(date => addCalendarDays(date, 2));
    const result = await preview(calendar(...explicit('BIOL 107', tuesdays, ['1030', '1150'], 'Science 1-04'),
      ...explicit('BIOL 107', thursdays, ['1030', '1150'], 'Science 1-04'),
      ...explicit('BIOL 107', thursdays, ['1400', '1650'], 'Science 2-20')));
    expect(result.classes.map(item => [item.weekdays, item.startTime, item.location, item.meetings])).toEqual([
      [[2, 4], '10:30', 'Science 1-04', 8], [[4], '14:00', 'Science 2-20', 4]]);
  });

  it('counts what it cannot import instead of guessing, and keeps going past an unsupported event', async () => {
    const result = await preview(calendar(
      event('once', ['SUMMARY:Advising appointment', `DTSTART;TZID=${zone}:20261021T130000`, `DTEND;TZID=${zone}:20261021T133000`]),
      event('allday', ['SUMMARY:Reading week', 'DTSTART;VALUE=DATE:20261109', 'DTEND;VALUE=DATE:20261114']),
      event('done', ['SUMMARY:Summer course', `DTSTART;TZID=${zone}:20260727T090000`, `DTEND;TZID=${zone}:20260727T100000`, 'RRULE:FREQ=WEEKLY;COUNT=6']),
      event('night', ['SUMMARY:Night shift', `DTSTART;TZID=${zone}:20261019T230000`, `DTEND;TZID=${zone}:20261020T010000`, 'RRULE:FREQ=WEEKLY;COUNT=4']),
      event('duration', ['SUMMARY:Odd export', `DTSTART;TZID=${zone}:20261019T090000`, 'DURATION:PT1H', 'RRULE:FREQ=WEEKLY;COUNT=4']),
      event('seminar', ['SUMMARY:ENGL 102 Seminar', `DTSTART;TZID=${zone}:20261019T130000`, `DTEND;TZID=${zone}:20261019T135000`, 'RRULE:FREQ=WEEKLY;COUNT=8'])));
    expect(result.classes.map(item => item.title)).toEqual(['ENGL 102 Seminar']);
    // Counted once per calendar event: the DURATION series and the overnight series are unsupported.
    expect(result.skipped).toEqual({ oneTime: 1, allDay: 1, unsupported: 2, finished: 1, overLimit: 0 });
  });

  // Expected local times come from the runtime's zone data: Alberta's clock rules differ between tzdata releases.
  const weekly = (first: string, weeks: number) => Array.from({ length: weeks }, (_, week) => localClockAt(`${addCalendarDays(first, week * 7)}T15:00:00Z`, zone).time);

  it('reads UTC-only exports in the student’s zone and marks classes that are already saved', async () => {
    const [local] = weekly('2026-11-02', 1);
    const result = await preview(calendar(event('utc', ['SUMMARY:PSYC 104 Lecture', 'DTSTART:20261102T150000Z', 'DTEND:20261102T155000Z', 'RRULE:FREQ=WEEKLY;COUNT=2'])),
      [{ id: '00000000-0000-4000-8000-000000000001', title: 'psyc 104  lecture', startTime: local, weekdays: [1, 3] }]);
    expect(result.classes).toEqual([expect.objectContaining({ startTime: local, weekdays: [1], duplicateOf: '00000000-0000-4000-8000-000000000001' })]);
    expect(local).not.toBe('15:00');
  });

  it('groups a UTC-defined series by its real local times rather than inventing one', async () => {
    const result = await preview(calendar(event('utc', ['SUMMARY:PSYC 104 Lecture', 'DTSTART:20261019T150000Z', 'DTEND:20261019T155000Z', 'RRULE:FREQ=WEEKLY;COUNT=6'])));
    const expected = new Map<string, number>();
    for (const time of weekly('2026-10-19', 6)) expected.set(time, (expected.get(time) ?? 0) + 1);
    const patterns = [...expected].filter(([, meetings]) => meetings >= 2).sort(([a], [b]) => a.localeCompare(b));
    expect(result.classes.map(item => [item.startTime, item.meetings])).toEqual(patterns);
  });

  it('caps the preview at forty classes and reports the rest', async () => {
    const many = Array.from({ length: 45 }, (_, index) => event(`c${index}`, [`SUMMARY:Course ${index}`,
      `DTSTART;TZID=${zone}:20261019T${String(8 + (index % 10)).padStart(2, '0')}0000`, `DTEND;TZID=${zone}:20261019T${String(8 + (index % 10)).padStart(2, '0')}5000`, 'RRULE:FREQ=WEEKLY;COUNT=3']));
    const result = await preview(calendar(...many));
    expect(result.classes).toHaveLength(40);
    expect(result.skipped.overLimit).toBe(5);
  });

  it('keeps going past untitled meetings and non-event components', async () => {
    const result = await preview(calendar(
      event('blank', ['SUMMARY: ', `DTSTART;TZID=${zone}:20261019T090000`, `DTEND;TZID=${zone}:20261019T095000`, 'RRULE:FREQ=WEEKLY;COUNT=6']),
      ['BEGIN:VTODO', 'UID:todo', 'DTSTAMP:20260901T000000Z', 'SUMMARY:Buy textbook', 'END:VTODO'].join('\r\n'),
      event('seminar', ['SUMMARY:ENGL 102 Seminar', `DTSTART;TZID=${zone}:20261019T130000`, `DTEND;TZID=${zone}:20261019T135000`, 'RRULE:FREQ=WEEKLY;COUNT=8'])));
    // The untitled series counts as unsupported; a task is simply not a class.
    expect(result.classes.map(item => item.title)).toEqual(['ENGL 102 Seminar']);
    expect(result.skipped.unsupported).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('keeps the term end of a full-year course imported in August', async () => {
    const batch = await new IcsEventProvider(async () => calendar(event('year', ['SUMMARY:Year-long seminar', `DTSTART;TZID=${zone}:20250903T150000`,
      `DTEND;TZID=${zone}:20250903T155000`, 'RRULE:FREQ=WEEKLY;UNTIL=20260415T235959Z'])), { timeZone: zone, partial: true, limits: uploadLimits })
      .fetchEvents({ from: addCalendarDays('2025-08-20', -90), through: addCalendarDays('2025-08-20', 275), timeZone: zone });
    if (batch.status === 'failed') throw new Error('failed');
    const result = detectClassPatterns(batch.events, { timeZone: zone, today: '2025-08-20', saved: [], unsupported: 0 });
    expect(result.classes[0]).toMatchObject({ termStart: '2025-09-03', termEnd: '2026-04-15' });
  });

  // Regression for crafted uploads that once blocked the API for 30+ seconds.
  it.each([
    ['sixty open-ended daily series', Array.from({ length: 60 }, (_, index) => event(`d${index}`, [`SUMMARY:Daily ${index}`,
      `DTSTART;TZID=${zone}:20261001T${String(index % 24).padStart(2, '0')}0000`, `DTEND;TZID=${zone}:20261001T${String(index % 24).padStart(2, '0')}3000`, 'RRULE:FREQ=DAILY']))],
    ['old daily series from 2010', Array.from({ length: 4 }, (_, index) => event(`o${index}`, [`SUMMARY:Old ${index}`,
      `DTSTART;TZID=${zone}:20100104T0${index}0000`, `DTEND;TZID=${zone}:20100104T0${index}3000`, 'RRULE:FREQ=DAILY']))],
    ['a flood of explicit dates', Array.from({ length: 300 }, (_, index) => event(`r${index}`, [`SUMMARY:Dates ${index}`,
      `DTSTART;TZID=${zone}:20261019T090000`, `DTEND;TZID=${zone}:20261019T095000`,
      `RDATE;TZID=${zone}:${Array.from({ length: 50 }, (_, week) => addCalendarDays('2026-10-26', week * 7).replace(/-/g, '') + 'T090000').join(',')}`]))],
  ])('bounds the work for %s', async (_name, events) => {
    const started = Date.now();
    const result = await preview(calendar(...events));
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(result.classes.length).toBeLessThanOrEqual(40);
  });

  it('reports a preview cut short instead of silently dropping later classes', async () => {
    // Sixty open-ended daily series hold far more meetings than one upload may expand.
    const result = await preview(calendar(...Array.from({ length: 60 }, (_, index) => event(`d${index}`, [`SUMMARY:Daily ${index}`,
      `DTSTART;TZID=${zone}:20261001T${String(index % 24).padStart(2, '0')}0000`, `DTEND;TZID=${zone}:20261001T${String(index % 24).padStart(2, '0')}3000`, 'RRULE:FREQ=DAILY']))));
    expect(result.truncated).toBe(true);
  });
});
