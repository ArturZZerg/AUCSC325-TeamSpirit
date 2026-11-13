import { httpsCalendarLoader, IcsEventProvider } from '../src/integrations/events/ics-event-provider';

import { coverage, calendar, vevent } from './fixtures/campus-calendar';
const parse = (body: string, zone?: string, window = coverage) => new IcsEventProvider(async () => body, { timeZone: zone }).fetchEvents(window);
const timed = 'DTSTART:20260308T160000Z\r\nDTEND:20260308T170000Z';

describe('bounded campus ICS provider', () => {
  it('normalizes UTC timing and unfolded escaped metadata', async () => {
    const batch = await parse(calendar(vevent(`${timed}\r\nDESCRIPTION:First\\nSecond\r\nLOCATION:Room 'A'\r\nURL:https://example.org/event`)));
    expect(batch.status).toBe('complete');
    if (batch.status === 'failed') return;
    expect(batch.events[0]).toMatchObject({ externalId: '["lecture"]', timing: { kind: 'timed', startsAt: '2026-03-08T16:00:00Z', endsAt: '2026-03-08T17:00:00Z' }, description: 'First\nSecond' });
  });
  it.each([['20260309', '2026-03-09'], ['20260311', '2026-03-11']])('imports all-day exclusive end %s', async (end, expected) => {
    const batch = await parse(calendar(vevent(`DTSTART;VALUE=DATE:20260308\r\nDTEND;VALUE=DATE:${end}`)));
    expect(batch).toMatchObject({ status: 'complete', events: [{ timing: { kind: 'allDay', startDate: '2026-03-08', endDateExclusive: expected } }] });
  });
  it('defaults an all-day event without DTEND to one day', async () => {
    expect(await parse(calendar(vevent('DTSTART;VALUE=DATE:20260308')))).toMatchObject({ status: 'complete', events: [{ timing: { endDateExclusive: '2026-03-09' } }] });
  });
  it('uses IANA zone across the spring DST transition', async () => {
    const batch = await parse(calendar(vevent('DTSTART;TZID=America/Edmonton:20260307T090000\r\nDTEND;TZID=America/Edmonton:20260307T100000\r\nRRULE:FREQ=DAILY;COUNT=3')));
    expect(batch.status).toBe('complete');
    if (batch.status === 'failed') return;
    expect(batch.events.map(e => e.timing.kind === 'timed' && e.timing.startsAt)).toEqual(['2026-03-07T16:00:00Z', '2026-03-08T15:00:00Z', '2026-03-09T15:00:00Z']);
    expect(new Set(batch.events.map(e => e.externalId)).size).toBe(3);
  });
  it('preserves exact timed recurrence duration across DST, including mixed-zone DTEND', async () => {
    const batch = await parse(calendar(vevent('DTSTART;TZID=America/Edmonton:20260307T013000\r\nDTEND:20260307T103000Z\r\nRRULE:FREQ=DAILY;COUNT=2')));
    expect(batch).toMatchObject({ status: 'complete' });
    if (batch.status !== 'failed') expect(batch.events.map(e => e.timing)).toEqual([
      { kind: 'timed', startsAt: '2026-03-07T08:30:00Z', endsAt: '2026-03-07T10:30:00Z' },
      { kind: 'timed', startsAt: '2026-03-08T08:30:00Z', endsAt: '2026-03-08T10:30:00Z' },
    ]);
  });
  it('rejects a partial feed containing both a valid and invalid event', async () => {
    expect(await parse(calendar(vevent(timed), vevent('DTSTART:bad', 'broken')))).toMatchObject({ status: 'incomplete', events: [] });
  });
  it('unfolds text and rejects unsupported detached exception semantics', async () => {
    const folded = calendar(vevent(timed)).replace('SUMMARY:Lecture', 'SUMMARY:Long \r\n title');
    expect(await parse(folded)).toMatchObject({ status: 'complete', events: [{ title: 'Long title' }] });
    expect(await parse(calendar(vevent('RECURRENCE-ID;RANGE=THISANDFUTURE:20260308T160000Z\r\n' + timed)))).toMatchObject({ status: 'incomplete' });
  });
  it('requires trusted zone configuration for floating time', async () => {
    const body = calendar(vevent('DTSTART:20260308T090000'));
    expect(await parse(body)).toMatchObject({ status: 'incomplete' });
    expect(await parse(body, 'America/Edmonton')).toMatchObject({ status: 'complete', events: [{ timing: { startsAt: '2026-03-08T15:00:00Z' } }] });
  });
  it.each(['20260308T023000', '20251102T013000'])('rejects ambiguous/nonexistent wall time %s', async start => {
    expect(await parse(calendar(vevent(`DTSTART;TZID=America/Edmonton:${start}`)))).toMatchObject({ status: 'incomplete' });
  });
  it('bounds an infinite rule to explicit coverage', async () => {
    const batch = await parse(calendar(vevent('DTSTART:20260301T160000Z\r\nRRULE:FREQ=DAILY')));
    expect(batch.status).toBe('complete');
    if (batch.status !== 'failed') expect(batch.events).toHaveLength(31);
  });
  it('supports weekly BYDAY, interval and UNTIL', async () => {
    const batch = await parse(calendar(vevent('DTSTART:20260302T160000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20260318T160000Z')));
    expect(batch.status).toBe('complete');
    if (batch.status !== 'failed') expect(batch.events.map(e => e.timing.kind === 'timed' && e.timing.startsAt.slice(0, 10))).toEqual(['2026-03-02', '2026-03-04', '2026-03-16', '2026-03-18']);
  });
  it.each([
    ['SU', ['2026-03-04', '2026-03-15', '2026-03-18', '2026-03-29']],
    ['MO', ['2026-03-04', '2026-03-08', '2026-03-18', '2026-03-22']],
    ['WE', ['2026-03-04', '2026-03-08', '2026-03-18', '2026-03-22']],
  ])('anchors every-other-week BYDAY to WKST=%s', async (weekStart, dates) => {
    const batch = await parse(calendar(vevent(`DTSTART:20260304T160000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=SU,WE;WKST=${weekStart}`)));
    expect(batch.status).toBe('complete');
    if (batch.status !== 'failed') expect(batch.events.map(e => e.timing.kind === 'timed' && e.timing.startsAt.slice(0, 10))).toEqual(dates);
  });
  it('expands Sunday week starts across the fall DST change with inclusive UNTIL', async () => {
    const batch = await parse(calendar(vevent('DTSTART;TZID=America/Edmonton:20251026T190000\r\nRRULE:FREQ=WEEKLY;WKST=SU;BYDAY=SU;UNTIL=20251110T020000Z')), undefined,
      { from: '2025-10-25', through: '2025-11-11', timeZone: 'America/Edmonton' });
    expect(batch).toMatchObject({ status: 'complete' });
    if (batch.status !== 'failed') expect(batch.events.map(e => e.timing.kind === 'timed' && e.timing.startsAt)).toEqual(['2025-10-27T01:00:00Z', '2025-11-03T02:00:00Z', '2025-11-10T02:00:00Z']);
  });
  it.each(['XX', '0', '8', ''])('rejects malformed WKST=%s rather than silently defaulting', async value => {
    expect(await parse(calendar(vevent(`${timed}\r\nRRULE:FREQ=WEEKLY;WKST=${value}`)))).toMatchObject({ status: 'incomplete', events: [] });
  });
  it('preserves original identity for moved instances and excludes EXDATE/cancelled instances', async () => {
    const batch = await parse(calendar(
      vevent('DTSTART:20260308T160000Z\r\nDTEND:20260308T170000Z\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:20260309T160000Z'),
      vevent('RECURRENCE-ID:20260310T160000Z\r\nDTSTART:20260310T180000Z\r\nDTEND:20260310T190000Z'),
      vevent('RECURRENCE-ID:20260311T160000Z\r\nSTATUS:CANCELLED')));
    expect(batch.status).toBe('complete');
    if (batch.status !== 'failed') {
      expect(batch.events).toHaveLength(2);
      expect(batch.events[1]).toMatchObject({ externalId: '["lecture","instant:2026-03-10T16:00:00Z"]', timing: { startsAt: '2026-03-10T18:00:00Z' } });
    }
  });
  it('supports RDATE and deduplicates occurrences', async () => {
    const batch = await parse(calendar(vevent(`${timed}\r\nRDATE:20260308T160000Z,20260310T180000Z`)));
    expect(batch).toMatchObject({ status: 'complete' });
    if (batch.status !== 'failed') expect(batch.events).toHaveLength(2);
  });
  it.each(['RRULE:FREQ=SECONDLY', 'RRULE:FREQ=MONTHLY;BYDAY=1MO', 'DURATION:PT1H'])('reports unsupported semantics %s', async field => {
    expect(await parse(calendar(vevent(`${timed}\r\n${field}`)))).toMatchObject({ status: 'incomplete', events: [] });
  });
  it.each(['RRULE:FREQ=DAILY;INTERVAL=0', 'RRULE:FREQ=DAILY;UNTIL=20260230T160000Z', 'RDATE:20260230T160000Z', 'EXDATE:20260230T160000Z', 'RRULE:FREQ=DAILY;BOGUS=x'])('rejects malformed recurrence values before library coercion: %s', async field => {
    expect(await parse(calendar(vevent(`${timed}\r\n${field}`)))).toMatchObject({ status: 'incomplete', events: [] });
  });
  it('caps old-anchor expansion without returning a complete partial batch', async () => {
    expect(await parse(calendar(vevent('DTSTART:19000101T160000Z\r\nRRULE:FREQ=DAILY')))).toMatchObject({ status: 'incomplete', events: [] });
  });
  it.each(['DTSTART:20260230T160000Z', 'DTSTART;TZID=Unknown/Zone:20260308T160000', 'DTSTART:20260308T160000Z\r\nDTEND:20260308T150000Z', ''])('rejects unsafe event timing %s', async fields => {
    expect(await parse(calendar(vevent(fields)))).toMatchObject({ status: 'incomplete', events: [] });
  });
  it('reports missing identities without treating the feed as complete', async () => {
    expect(await parse(calendar(vevent(timed).replace('UID:lecture\r\n', '')))).toMatchObject({ status: 'incomplete' });
  });
  it.each(['', '<html>error</html>', 'BEGIN:VCALENDAR\r\nVERSION:2.0', calendar(vevent(timed)) + '\r\nEND:VEVENT'])('rejects malformed calendar %#', async body => {
    expect(await parse(body)).toMatchObject({ status: 'failed' });
  });
  it('distinguishes successful empty and cancelled source from failure', async () => {
    expect(await parse(calendar())).toMatchObject({ status: 'complete', events: [] });
    expect(await parse(calendar(vevent('STATUS:CANCELLED')))).toMatchObject({ status: 'complete', events: [] });
    expect(await new IcsEventProvider(async () => { throw new Error('secret source URL'); }).fetchEvents(coverage)).toEqual({ status: 'failed', issues: ['source-failure'] });
  });
  it('times out an unresponsive source', async () => {
    expect(await new IcsEventProvider(() => new Promise(() => {}), { timeoutMs: 5 }).fetchEvents(coverage)).toEqual({ status: 'failed', issues: ['source-timeout'] });
  });
  it('limits bytes and coverage', async () => {
    expect(await parse('x'.repeat(1024 * 1024 + 1))).toMatchObject({ status: 'failed', issues: ['payload-limit'] });
    await expect(parse(calendar(), undefined, { ...coverage, through: '2030-01-01' })).rejects.toThrow();
  });
});

describe('configured HTTPS calendar transport', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each(['http://example.org/calendar', 'file:///tmp/calendar', 'https://user:secret@example.org/feed', 'https://127.0.0.1/feed'])('rejects unsafe configuration %s', url => {
    expect(() => httpsCalendarLoader(url)).toThrow();
  });
  it('requires calendar MIME and successful status; redirects are disabled', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<html/>', { headers: { 'content-type': 'text/html' } }));
    const provider = new IcsEventProvider(httpsCalendarLoader('https://example.org/calendar'));
    expect(await provider.fetchEvents(coverage)).toMatchObject({ status: 'failed' });
    expect(mock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'error' }));
    mock.mockResolvedValue(new Response('', { status: 503 }));
    expect(await provider.fetchEvents(coverage)).toMatchObject({ status: 'failed' });
  });
  it('reads a valid configured calendar response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(calendar(vevent(timed)), { headers: { 'content-type': 'text/calendar; charset=utf-8' } }));
    expect(await new IcsEventProvider(httpsCalendarLoader('https://example.org/calendar')).fetchEvents(coverage)).toMatchObject({ status: 'complete', events: [{ title: 'Lecture' }] });
  });
  it('enforces streamed payload limit even without Content-Length', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'text/calendar' } }));
    expect(await new IcsEventProvider(httpsCalendarLoader('https://example.org/calendar')).fetchEvents(coverage)).toMatchObject({ status: 'failed' });
  });
  it('lets a reviewed feed raise the payload limit for both transport and parsing', async () => {
    const large = 2 * 1024 * 1024;
    const body = calendar(vevent(`${timed}\r\nDESCRIPTION:${'x'.repeat(1024 * 1024 + 1)}`));
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(body, { headers: { 'content-type': 'text/calendar' } }));
    expect(await new IcsEventProvider(httpsCalendarLoader('https://example.org/calendar', large), { limits: { steps: 100, seriesSteps: 100, events: 10, components: 10, bytes: large } }).fetchEvents(coverage)).toMatchObject({ status: 'complete' });
    expect(await new IcsEventProvider(httpsCalendarLoader('https://example.org/calendar', large)).fetchEvents(coverage)).toEqual({ status: 'failed', issues: ['payload-limit'] });
    expect(await new IcsEventProvider(httpsCalendarLoader('https://example.org/calendar'), { limits: { steps: 100, seriesSteps: 100, events: 10, components: 10, bytes: large } }).fetchEvents(coverage)).toEqual({ status: 'failed', issues: ['source-failure'] });
  });
});

describe('long-lived campus feeds', () => {
  const feed = (body: string, window = coverage, options = {}) => new IcsEventProvider(async () => body, { timeZone: 'America/Edmonton', calendarRules: true, pastDays: 30, ...options }).fetchEvents(window);
  const starts = async (body: string, window = coverage, options = {}) => {
    const batch = await feed(body, window, options);
    expect(batch).toMatchObject({ status: 'complete', issues: [] });
    return batch.status === 'failed' ? [] : batch.events.map(e => e.timing.kind === 'timed' ? e.timing.startsAt : e.timing.startDate);
  };
  const edmonton = 'DTSTART;TZID=America/Edmonton:20260127T110000';

  describe('MONTHLY and YEARLY recurrence', () => {
    it.each([
      ['fourth Tuesday', `${edmonton}\r\nRRULE:FREQ=MONTHLY;BYDAY=4TU`, ['2026-03-24T17:00:00Z']],
      ['last Tuesday', `${edmonton}\r\nRRULE:FREQ=MONTHLY;BYDAY=-1TU`, ['2026-03-31T17:00:00Z']],
      ['every second month from the start', `${edmonton}\r\nRRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=4TU`, ['2026-03-24T17:00:00Z']],
      ['an off month of the interval', 'DTSTART;TZID=America/Edmonton:20260224T110000\r\nRRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=4TU', []],
      ['a series ended by COUNT', `${edmonton}\r\nRRULE:FREQ=MONTHLY;COUNT=2;BYDAY=4TU`, []],
      ['a series reaching its UNTIL', `${edmonton}\r\nRRULE:FREQ=MONTHLY;UNTIL=20260324T170000Z;BYDAY=4TU`, ['2026-03-24T17:00:00Z']],
      ['a series stopping before its UNTIL', `${edmonton}\r\nRRULE:FREQ=MONTHLY;UNTIL=20260324T165959Z;BYDAY=4TU`, []],
      ['a day of the month, skipping months without it', 'DTSTART;VALUE=DATE:20260131\r\nRRULE:FREQ=MONTHLY', ['2026-03-31']],
      ['an annual date', 'DTSTART;VALUE=DATE:20190310\r\nRRULE:FREQ=YEARLY', ['2026-03-10']],
      ['an annual date past its UNTIL', 'DTSTART;VALUE=DATE:20190310\r\nRRULE:FREQ=YEARLY;UNTIL=20250101', []],
      ['every second year from the start', 'DTSTART;VALUE=DATE:20190310\r\nRRULE:FREQ=YEARLY;INTERVAL=2', []],
    ])('expands %s', async (_name, fields, expected) => {
      expect(await starts(calendar(vevent(fields)))).toEqual(expected);
    });
    it('keeps 29 February to leap years', async () => {
      const body = calendar(vevent('DTSTART;VALUE=DATE:20240229\r\nRRULE:FREQ=YEARLY'));
      expect(await starts(body, { from: '2027-02-01', through: '2027-03-02', timeZone: coverage.timeZone })).toEqual([]);
      expect(await starts(body, { from: '2028-02-01', through: '2028-03-02', timeZone: coverage.timeZone })).toEqual(['2028-02-29']);
    });
    it('gives each occurrence its own identity and applies exceptions', async () => {
      const body = calendar(vevent(`${edmonton}\r\nRRULE:FREQ=MONTHLY;BYDAY=2TU,4TU\r\nEXDATE;TZID=America/Edmonton:20260310T110000`));
      const batch = await feed(body);
      expect(batch).toMatchObject({ status: 'complete', events: [{ externalId: '["lecture","instant:2026-03-24T17:00:00Z"]' }] });
    });
    it.each(['RRULE:FREQ=MONTHLY;BYDAY=TU', 'RRULE:FREQ=MONTHLY;BYDAY=6TU', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15', 'RRULE:FREQ=YEARLY;BYDAY=TU', 'RRULE:FREQ=YEARLY;BYMONTH=3'])('still reports %s as unsupported', async rule => {
      expect(await feed(calendar(vevent(`DTSTART:20260308T160000Z\r\n${rule}`)))).toMatchObject({ status: 'incomplete', events: [] });
    });
    it('stays unsupported unless a reviewed feed enables it', async () => {
      expect(await parse(calendar(vevent('DTSTART;VALUE=DATE:20260310\r\nRRULE:FREQ=YEARLY')))).toMatchObject({ status: 'incomplete', events: [] });
    });
  });

  describe('past entries', () => {
    const oneOff = (date: string, uid: string) => vevent(`DTSTART;VALUE=DATE:${date}`, uid);
    it('ignores entries ended before the history window and keeps recent and future ones', async () => {
      expect(await starts(calendar(oneOff('20260129', 'old'), oneOff('20260130', 'edge'), oneOff('20260310', 'now'), oneOff('20270601', 'next')))).toEqual(['2026-01-30', '2026-03-10', '2027-06-01']);
    });
    it('keeps a one-off that started long ago but is still running', async () => {
      expect(await starts(calendar(vevent('DTSTART;VALUE=DATE:20250101\r\nDTEND;VALUE=DATE:20260310')))).toEqual(['2025-01-01']);
    });
    it('does not let a malformed old series invalidate current listings', async () => {
      const legacy = 'DTSTART;TZID=America/Edmonton:20201103T140000\r\nRRULE:FREQ=WEEKLY;UNTIL=20201202;BYDAY=TU';
      expect(await starts(calendar(vevent(legacy, 'old'), oneOff('20260310', 'now')))).toEqual(['2026-03-10']);
    });
    it('still reports a malformed series that reaches the history window', async () => {
      expect(await feed(calendar(vevent('DTSTART;TZID=America/Edmonton:20260203T140000\r\nRRULE:FREQ=WEEKLY;UNTIL=20260310;BYDAY=TU', 'bad'), oneOff('20260310', 'now')))).toMatchObject({ status: 'incomplete', events: [] });
    });
    it('keeps an ended series whose moved occurrence is current', async () => {
      const master = vevent('DTSTART;TZID=America/Edmonton:20200106T100000\r\nRRULE:FREQ=WEEKLY;UNTIL=20200201T000000Z', 'moved');
      const moved = vevent('RECURRENCE-ID;TZID=America/Edmonton:20200113T100000\r\nDTSTART;TZID=America/Edmonton:20260310T100000', 'moved');
      expect(await starts(calendar(master, moved))).toEqual(['2026-03-10T16:00:00Z']);
    });
    it('keeps an open-ended old series and anything using explicit dates', async () => {
      expect(await starts(calendar(vevent('DTSTART;VALUE=DATE:20190310\r\nRRULE:FREQ=YEARLY', 'annual'), vevent('DTSTART;VALUE=DATE:20200101\r\nRDATE;VALUE=DATE:20260311', 'explicit')))).toEqual(['2026-03-10', '2026-03-11']);
    });
    it('reads a feed far beyond the event limit when only recent entries matter', async () => {
      const old = Array.from({ length: 5000 }, (_, i) => vevent('DTSTART:20200106T160000Z', `old-${i}`));
      const limits = { steps: 20000, seriesSteps: 20000, events: 2000, components: 10000 };
      expect(await starts(calendar(...old, oneOff('20260310', 'now')), coverage, { limits })).toEqual(['2026-03-10']);
    });
    it.each([
      ['every second week', 'DTSTART;TZID=America/Edmonton:20150105T110000\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'],
      ['every third week from Sunday', 'DTSTART;TZID=America/Edmonton:20150106T110000\r\nRRULE:FREQ=WEEKLY;INTERVAL=3;WKST=SU;BYDAY=TU,TH'],
      ['every third day', 'DTSTART;TZID=America/Edmonton:20150105T110000\r\nRRULE:FREQ=DAILY;INTERVAL=3'],
      ['every fifth month', 'DTSTART;TZID=America/Edmonton:20150114T110000\r\nRRULE:FREQ=MONTHLY;INTERVAL=5;BYDAY=2WE'],
      ['every second year', 'DTSTART;VALUE=DATE:20160310\r\nRRULE:FREQ=YEARLY;INTERVAL=2'],
      ['a multi-day weekly event', 'DTSTART;VALUE=DATE:20150103\r\nDTEND;VALUE=DATE:20150106\r\nRRULE:FREQ=WEEKLY'],
    ])('starts %s near coverage with the same occurrences as a full expansion', async (_name, fields) => {
      const body = calendar(vevent(fields));
      const generous = { limits: { steps: 20000, seriesSteps: 20000, events: 2000, components: 2000 } };
      const full = await feed(body, coverage, { pastDays: undefined, ...generous });
      expect(full.status).toBe('complete');
      // A budget far below the ten years since DTSTART shows the old days aren't walked.
      expect(await feed(body, coverage, { limits: { steps: 400, seriesSteps: 400, events: 2000, components: 2000 } })).toEqual(full);
    });
  });
});
