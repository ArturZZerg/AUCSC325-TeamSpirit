import { addCalendarDays } from '@campusflow/domain';
import { IcsEventProvider } from '../src/integrations/events/ics-event-provider';
import { detectClassPatterns } from '../src/integrations/timetable/timetable-import';

const zone = 'America/Edmonton', today = '2026-10-18';
const calendar = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...events, 'END:VCALENDAR'].join('\r\n');
const event = (uid: string, lines: string[]) => ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260901T000000Z', ...lines, 'END:VEVENT'].join('\r\n');
async function preview(ics: string, saved: { id: string; title: string; startTime: string; weekdays: number[] }[] = []) {
  const batch = await new IcsEventProvider(async () => ics, { timeZone: zone, partial: true })
    .fetchEvents({ from: addCalendarDays(today, -150), through: addCalendarDays(today, 210), timeZone: zone });
  if (batch.status === 'failed') throw new Error(batch.issues.join());
  return detectClassPatterns(batch.events, { timeZone: zone, today, saved, unsupported: batch.issues.length });
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
      event('done', ['SUMMARY:Summer course', `DTSTART;TZID=${zone}:20260601T090000`, `DTEND;TZID=${zone}:20260601T100000`, 'RRULE:FREQ=WEEKLY;COUNT=6']),
      event('night', ['SUMMARY:Night shift', `DTSTART;TZID=${zone}:20261019T230000`, `DTEND;TZID=${zone}:20261020T010000`, 'RRULE:FREQ=WEEKLY;COUNT=4']),
      event('duration', ['SUMMARY:Odd export', `DTSTART;TZID=${zone}:20261019T090000`, 'DURATION:PT1H', 'RRULE:FREQ=WEEKLY;COUNT=4']),
      event('seminar', ['SUMMARY:ENGL 102 Seminar', `DTSTART;TZID=${zone}:20261019T130000`, `DTEND;TZID=${zone}:20261019T135000`, 'RRULE:FREQ=WEEKLY;COUNT=8'])));
    expect(result.classes.map(item => item.title)).toEqual(['ENGL 102 Seminar']);
    expect(result.skipped).toEqual({ oneTime: 1, allDay: 1, unsupported: 5, finished: 6, overLimit: 0 });
  });

  it('reads UTC-only exports in the student’s zone and marks classes that are already saved', async () => {
    // After the Nov 1 change, 15:00Z is 08:00 MST.
    const result = await preview(calendar(event('utc', ['SUMMARY:PSYC 104 Lecture', 'DTSTART:20261102T150000Z', 'DTEND:20261102T155000Z', 'RRULE:FREQ=WEEKLY;COUNT=6'])),
      [{ id: '00000000-0000-4000-8000-000000000001', title: 'psyc 104  lecture', startTime: '08:00', weekdays: [1, 3] }]);
    expect(result.classes).toEqual([expect.objectContaining({ startTime: '08:00', endTime: '08:50', weekdays: [1], duplicateOf: '00000000-0000-4000-8000-000000000001' })]);
  });

  it('splits a UTC-defined series that crosses a DST change rather than inventing one local time', async () => {
    const result = await preview(calendar(event('utc', ['SUMMARY:PSYC 104 Lecture', 'DTSTART:20261019T150000Z', 'DTEND:20261019T155000Z', 'RRULE:FREQ=WEEKLY;COUNT=6'])));
    expect(result.classes.map(item => [item.startTime, item.meetings])).toEqual([['08:00', 4], ['09:00', 2]]);
  });

  it('caps the preview at forty classes and reports the rest', async () => {
    const many = Array.from({ length: 45 }, (_, index) => event(`c${index}`, [`SUMMARY:Course ${index}`,
      `DTSTART;TZID=${zone}:20261019T${String(8 + (index % 10)).padStart(2, '0')}0000`, `DTEND;TZID=${zone}:20261019T${String(8 + (index % 10)).padStart(2, '0')}5000`, 'RRULE:FREQ=WEEKLY;COUNT=3']));
    const result = await preview(calendar(...many));
    expect(result.classes).toHaveLength(40);
    expect(result.skipped.overLimit).toBe(5);
  });
});
