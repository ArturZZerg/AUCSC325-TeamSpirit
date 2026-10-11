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
    const batch = await parse(calendar(vevent('DTSTART;TZID=America/Edmonton:20261025T190000\r\nRRULE:FREQ=WEEKLY;WKST=SU;BYDAY=SU;UNTIL=20261109T020000Z')), undefined,
      { from: '2026-10-24', through: '2026-11-10', timeZone: 'America/Edmonton' });
    expect(batch).toMatchObject({ status: 'complete' });
    if (batch.status !== 'failed') expect(batch.events.map(e => e.timing.kind === 'timed' && e.timing.startsAt)).toEqual(['2026-10-26T01:00:00Z', '2026-11-02T02:00:00Z', '2026-11-09T02:00:00Z']);
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
});
