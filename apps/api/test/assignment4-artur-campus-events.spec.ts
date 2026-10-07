import { IcsEventProvider } from '../src/integrations/events/ics-event-provider';
import { EventCoverage, ImportedEvent, inCoverage } from '../src/integrations/events/event-provider';

// AUCSC 325 Assignment 4 - Artur Vakula.
// The three sections deliberately separate the required testing techniques.
// Helpers only build inputs; expected outputs are fixed independently of the SUT.
const coverage: EventCoverage = { from: '2025-03-09', through: '2025-03-10', timeZone: 'UTC' };
const calendar = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CampusFlow Assignment 4//EN', ...events, 'END:VCALENDAR'].join('\r\n');
const vevent = (fields: string, uid = 'campus-lecture') => ['BEGIN:VEVENT', `UID:${uid}`, 'SUMMARY:Campus lecture', fields, 'END:VEVENT'].join('\r\n');
const fetchCalendar = (body: string, timeZone?: string, window = coverage) =>
  new IcsEventProvider(async () => body, { timeZone }).fetchEvents(window);
const imported = (timing: ImportedEvent['timing']): ImportedEvent => ({
  externalId: '["campus-lecture"]', title: 'Campus lecture', description: null,
  category: null, timing, location: null, url: null,
});
const point = (startsAt: string) => imported({ kind: 'timed', startsAt, endsAt: null });
const interval = (startsAt: string, endsAt: string) => imported({ kind: 'timed', startsAt, endsAt });
const allDay = (startDate: string, endDateExclusive: string) => imported({ kind: 'allDay', startDate, endDateExclusive });

describe('Assignment 4 / Artur / Boundary value testing', () => {
  it.each([
    ['B01', 0, false], ['B02', 1, true], ['B03', 2, true],
    ['B04', 29999, true], ['B05', 30000, true], ['B06', 30001, false],
  ] as const)('%s constructor timeoutMs=%s accepted=%s', (_id, timeoutMs, accepted) => {
    const construct = () => new IcsEventProvider(async () => calendar(), { timeoutMs });
    if (accepted) expect(construct).not.toThrow();
    else expect(construct).toThrow('Invalid timeout');
  });

  it.each([
    ['B07', '2025-03-08T23:59:59.999Z', false],
    ['B08', '2025-03-09T00:00:00.000Z', true],
    ['B09', '2025-03-09T00:00:00.001Z', true],
    ['B10', '2025-03-09T23:59:59.999Z', true],
    ['B11', '2025-03-10T00:00:00.000Z', false],
    ['B12', '2025-03-10T00:00:00.001Z', false],
  ] as const)('%s inCoverage point=%s expected=%s', (_id, at, expected) => {
    expect(inCoverage(point(at), coverage)).toBe(expected);
  });

  it.each([
    ['B13', '2025-03-08T22:00:00Z', '2025-03-08T23:59:59.999Z', false],
    ['B14', '2025-03-08T22:00:00Z', '2025-03-09T00:00:00.000Z', false],
    ['B15', '2025-03-08T22:00:00Z', '2025-03-09T00:00:00.001Z', true],
    ['B16', '2025-03-09T23:59:59.999Z', '2025-03-10T01:00:00Z', true],
    ['B17', '2025-03-10T00:00:00.000Z', '2025-03-10T01:00:00Z', false],
    ['B18', '2025-03-10T00:00:00.001Z', '2025-03-10T01:00:00Z', false],
    ['B19', '2025-03-08T22:00:00Z', '2025-03-10T02:00:00Z', true],
  ] as const)('%s inCoverage interval=[%s,%s) expected=%s', (_id, start, end, expected) => {
    expect(inCoverage(interval(start, end), coverage)).toBe(expected);
  });

  it.each([
    ['B20', '2025-03-08', '2025-03-09', false],
    ['B21', '2025-03-09', '2025-03-10', true],
    ['B22', '2025-03-08', '2025-03-10', true],
    ['B23', '2025-03-10', '2025-03-11', false],
  ] as const)('%s inCoverage allDay=[%s,%s) expected=%s', (_id, start, end, expected) => {
    expect(inCoverage(allDay(start, end), coverage)).toBe(expected);
  });

  it.each([
    ['B24', '2025-01-01', false], // zero days
    ['B25', '2024-12-31', false], // inverted
    ['B26', '2025-01-02', true],  // one day
    ['B27', '2026-01-02', true],  // 366 days
    ['B28', '2026-01-03', false], // 367 days
  ] as const)('%s fetchEvents coverage through=%s accepted=%s', async (_id, through, accepted) => {
    const load = jest.fn(async () => calendar());
    const result = new IcsEventProvider(load).fetchEvents({ ...coverage, from: '2025-01-01', through });
    if (accepted) {
      await expect(result).resolves.toEqual({ status: 'complete', coverage: { ...coverage, from: '2025-01-01', through }, events: [], issues: [] });
      expect(load).toHaveBeenCalledTimes(1);
    } else {
      await expect(result).rejects.toThrow();
      expect(load).not.toHaveBeenCalled();
    }
  });

  const payloadOfBytes = (bytes: number) => {
    const empty = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:\r\nEND:VCALENDAR';
    return empty.replace('PRODID:', `PRODID:${'x'.repeat(bytes - Buffer.byteLength(empty))}`);
  };
  it.each([
    ['B29', 1048575, 'complete'], ['B30', 1048576, 'complete'], ['B31', 1048577, 'failed'],
  ] as const)('%s fetchEvents payload=%s UTF-8 bytes status=%s', async (_id, bytes, status) => {
    const body = payloadOfBytes(bytes);
    expect(Buffer.byteLength(body)).toBe(bytes);
    const result = await fetchCalendar(body);
    if (status === 'failed') expect(result).toEqual({ status: 'failed', issues: ['payload-limit'] });
    else expect(result).toEqual({ status: 'complete', coverage, events: [], issues: [] });
  });
  it('B32 fetchEvents applies the byte limit to multibyte text', async () => {
    const body = payloadOfBytes(1048576).replace('xx', '\u00e9x');
    expect(body.length).toBeLessThanOrEqual(1048576);
    expect(Buffer.byteLength(body)).toBe(1048577);
    await expect(fetchCalendar(body)).resolves.toEqual({ status: 'failed', issues: ['payload-limit'] });
  });

  describe('load deadline using virtual time', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('B33 fetchEvents succeeds when the loader resolves at 9 ms of a 10 ms deadline', async () => {
      let resolveLoad!: (value: string) => void;
      let signal!: AbortSignal;
      const provider = new IcsEventProvider(input => {
        signal = input;
        return new Promise<string>(resolve => { resolveLoad = resolve; });
      }, { timeoutMs: 10 });
      const result = provider.fetchEvents(coverage);
      await jest.advanceTimersByTimeAsync(9);
      resolveLoad(calendar());
      await expect(result).resolves.toEqual({ status: 'complete', coverage, events: [], issues: [] });
      await jest.advanceTimersByTimeAsync(1);
      expect(signal.aborted).toBe(false);
    });

    it('B34 fetchEvents aborts at exactly the configured 10 ms deadline', async () => {
      let signal!: AbortSignal;
      let settled = false;
      const provider = new IcsEventProvider(input => {
        signal = input;
        return new Promise<string>(() => {});
      }, { timeoutMs: 10 });
      const result = provider.fetchEvents(coverage).then(value => { settled = true; return value; });
      await jest.advanceTimersByTimeAsync(9);
      expect(settled).toBe(false);
      expect(signal.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ status: 'failed', issues: ['source-timeout'] });
      expect(signal.aborted).toBe(true);
    });

    it('B35 fetchEvents uses the default 5000 ms deadline when omitted', async () => {
      let settled = false;
      const result = new IcsEventProvider(() => new Promise<string>(() => {}))
        .fetchEvents(coverage).then(value => { settled = true; return value; });
      await jest.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ status: 'failed', issues: ['source-timeout'] });
    });
  });
});

describe('Assignment 4 / Artur / Equivalence class partitioning', () => {
  it('P01 constructor accepts omitted options and defers loading', () => {
    const load = jest.fn(async () => calendar());
    expect(new IcsEventProvider(load)).toBeInstanceOf(IcsEventProvider);
    expect(load).not.toHaveBeenCalled();
  });
  it.each([
    ['P02', { timeZone: 'UTC', timeoutMs: 5000 }, true],
    ['P03', { timeZone: 'America/Edmonton' }, true],
    ['P04', { timeZone: 'Unknown/Zone' }, false],
    ['P05', { timeoutMs: -50 }, false],
    ['P06', { timeoutMs: 1.5 }, false],
    ['P07', { timeoutMs: Number.NaN }, false],
    ['P08', { timeoutMs: Number.POSITIVE_INFINITY }, false],
  ] as const)('%s constructor options=%s accepted=%s', (_id, options, accepted) => {
    const construct = () => new IcsEventProvider(async () => calendar(), options);
    if (accepted) expect(construct).not.toThrow();
    else expect(construct).toThrow();
  });

  it.each([
    ['P09', 'DTSTART:20250309T150000Z\r\nDTEND:20250309T160000Z', undefined],
    ['P10', 'DTSTART;TZID=America/Edmonton:20250309T090000\r\nDTEND;TZID=America/Edmonton:20250309T100000', undefined],
    ['P11', 'DTSTART:20250309T090000\r\nDTEND:20250309T100000', 'America/Edmonton'],
  ] as const)('%s fetchEvents normalizes an accepted time representation', async (_id, fields, zone) => {
    await expect(fetchCalendar(calendar(vevent(fields)), zone)).resolves.toEqual({
      status: 'complete', coverage, issues: [], events: [imported({ kind: 'timed', startsAt: '2025-03-09T15:00:00Z', endsAt: '2025-03-09T16:00:00Z' })],
    });
  });
  it('P12 fetchEvents rejects floating time without a trusted source timezone', async () => {
    await expect(fetchCalendar(calendar(vevent('DTSTART:20250309T090000'))))
      .resolves.toEqual({ status: 'incomplete', coverage, events: [], issues: ['untrusted-timezone'] });
  });
  it('P13 fetchEvents defaults a date-only event to one calendar day', async () => {
    await expect(fetchCalendar(calendar(vevent('DTSTART;VALUE=DATE:20250309')))).resolves.toEqual({
      status: 'complete', coverage, issues: [], events: [allDay('2025-03-09', '2025-03-10')],
    });
  });
  it('P14 fetchEvents preserves a multi-day exclusive end date', async () => {
    await expect(fetchCalendar(calendar(vevent('DTSTART;VALUE=DATE:20250309\r\nDTEND;VALUE=DATE:20250312')))).resolves.toEqual({
      status: 'complete', coverage, issues: [], events: [allDay('2025-03-09', '2025-03-12')],
    });
  });
  it('P15 fetchEvents represents missing timed DTEND as a point with null endsAt', async () => {
    await expect(fetchCalendar(calendar(vevent('DTSTART:20250309T150000Z')))).resolves.toEqual({
      status: 'complete', coverage, issues: [], events: [point('2025-03-09T15:00:00Z')],
    });
  });
  it.each([
    ['P16', 'DTSTART:20250230T150000Z', 'invalid-event'],
    ['P17', '', 'missing-timing'],
    ['P18', 'DTSTART;TZID=Unknown/Zone:20250309T090000', 'untrusted-timezone'],
  ] as const)('%s fetchEvents rejects an invalid event partition', async (_id, fields, issue) => {
    await expect(fetchCalendar(calendar(vevent(fields)))).resolves.toEqual({ status: 'incomplete', coverage, events: [], issues: [issue] });
  });
  it('P19 fetchEvents rejects a missing source identity', async () => {
    await expect(fetchCalendar(calendar(vevent('DTSTART:20250309T150000Z').replace('UID:campus-lecture\r\n', ''))))
      .resolves.toEqual({ status: 'incomplete', coverage, events: [], issues: ['missing-or-invalid-uid'] });
  });
  it('P20 fetchEvents rejects a missing event title', async () => {
    await expect(fetchCalendar(calendar(vevent('DTSTART:20250309T150000Z').replace('SUMMARY:Campus lecture\r\n', ''))))
      .resolves.toEqual({ status: 'incomplete', coverage, events: [], issues: ['invalid-event'] });
  });
  it('P21 fetchEvents discards a mixed valid and invalid batch', async () => {
    await expect(fetchCalendar(calendar(vevent('DTSTART:20250309T150000Z'), vevent('DTSTART:20250230T150000Z', 'broken'))))
      .resolves.toEqual({ status: 'incomplete', coverage, events: [], issues: ['invalid-event'] });
  });
  it('P22 fetchEvents treats a cancelled event as successful absence', async () => {
    await expect(fetchCalendar(calendar(vevent('STATUS:CANCELLED'))))
      .resolves.toEqual({ status: 'complete', coverage, events: [], issues: [] });
  });
  it('P23 fetchEvents distinguishes a valid empty calendar from failure', async () => {
    await expect(fetchCalendar(calendar())).resolves.toEqual({ status: 'complete', coverage, events: [], issues: [] });
  });
  it.each([
    ['P24', 'BEGIN:VCALENDAR\r\nVERSION:2.0'], ['P25', '<html>Unavailable</html>'],
  ] as const)('%s fetchEvents rejects an invalid calendar envelope', async (_id, body) => {
    await expect(fetchCalendar(body)).resolves.toEqual({ status: 'failed', issues: ['malformed-or-unsupported-calendar'] });
  });
  it('P26 fetchEvents reports a loader failure without exposing its error text', async () => {
    const provider = new IcsEventProvider(async () => { throw new Error('private-source-detail'); });
    await expect(provider.fetchEvents(coverage)).resolves.toEqual({ status: 'failed', issues: ['source-failure'] });
  });
  it.each([
    ['P27', { ...coverage, unexpected: true }],
    ['P28', { ...coverage, from: '2025-02-30' }],
    ['P29', { ...coverage, through: '2025-03-32' }],
    ['P30', { ...coverage, timeZone: 'Unknown/Zone' }],
  ])('%s fetchEvents rejects invalid coverage before loading', async (_id, window) => {
    const load = jest.fn(async () => calendar());
    await expect(new IcsEventProvider(load).fetchEvents(window as EventCoverage)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
  it('P31 fetchEvents expands supported recurrence with stable distinct identities', async () => {
    const body = calendar(vevent('DTSTART:20250309T150000Z\r\nRRULE:FREQ=DAILY;COUNT=3'));
    const window = { ...coverage, through: '2025-03-12' };
    const first = await fetchCalendar(body, undefined, window);
    expect(first).toEqual({
      status: 'complete', coverage: window, issues: [], events: [
        { ...point('2025-03-09T15:00:00Z'), externalId: '["campus-lecture","instant:2025-03-09T15:00:00Z"]' },
        { ...point('2025-03-10T15:00:00Z'), externalId: '["campus-lecture","instant:2025-03-10T15:00:00Z"]' },
        { ...point('2025-03-11T15:00:00Z'), externalId: '["campus-lecture","instant:2025-03-11T15:00:00Z"]' },
      ],
    });
    expect(await fetchCalendar(body, undefined, window)).toEqual(first);
  });
  it.each([
    ['P32', 'DTSTART:20250309T150000Z\r\nRRULE:FREQ=MONTHLY'],
    ['P33', 'DTSTART;TZID=America/Edmonton:20250309T023000'],
    ['P34', 'DTSTART;TZID=America/Edmonton:20251102T013000'],
    ['P35', 'DTSTART:20250309T150000Z\r\nRRULE:FREQ=DAILY;COUNT=0'],
  ] as const)('%s fetchEvents rejects unsupported recurrence or unsafe wall time', async (_id, fields) => {
    const batch = await fetchCalendar(calendar(vevent(fields)));
    expect(batch).toMatchObject({ status: 'incomplete', coverage, events: [] });
    expect('issues' in batch && batch.issues.length).toBeGreaterThan(0);
  });
});

describe('Assignment 4 / Artur / Combinatorial testing', () => {
  // Full Cartesian product: 3 formats x 2 fallback settings x 3 end relations.
  // Explicit expected statuses avoid duplicating provider validation logic.
  const combinations = [
    ['C01', 'UTC', undefined, 'before', 'incomplete'],
    ['C02', 'UTC', undefined, 'equal', 'complete'],
    ['C03', 'UTC', undefined, 'after', 'complete'],
    ['C04', 'UTC', 'America/Edmonton', 'before', 'incomplete'],
    ['C05', 'UTC', 'America/Edmonton', 'equal', 'complete'],
    ['C06', 'UTC', 'America/Edmonton', 'after', 'complete'],
    ['C07', 'TZID', undefined, 'before', 'incomplete'],
    ['C08', 'TZID', undefined, 'equal', 'complete'],
    ['C09', 'TZID', undefined, 'after', 'complete'],
    ['C10', 'TZID', 'America/Edmonton', 'before', 'incomplete'],
    ['C11', 'TZID', 'America/Edmonton', 'equal', 'complete'],
    ['C12', 'TZID', 'America/Edmonton', 'after', 'complete'],
    ['C13', 'floating', undefined, 'before', 'incomplete'],
    ['C14', 'floating', undefined, 'equal', 'incomplete'],
    ['C15', 'floating', undefined, 'after', 'incomplete'],
    ['C16', 'floating', 'America/Edmonton', 'before', 'incomplete'],
    ['C17', 'floating', 'America/Edmonton', 'equal', 'complete'],
    ['C18', 'floating', 'America/Edmonton', 'after', 'complete'],
  ] as const;
  it.each(combinations)('%s fetchEvents format=%s fallback=%s end=%s status=%s', async (_id, format, zone, relation, status) => {
    // The UTC and local forms describe the same instants on 2025-03-09.
    const utcEnds = { before: '20250309T140000Z', equal: '20250309T150000Z', after: '20250309T160000Z' };
    const localEnds = { before: '20250309T080000', equal: '20250309T090000', after: '20250309T100000' };
    const fields = format === 'UTC'
      ? `DTSTART:20250309T150000Z\r\nDTEND:${utcEnds[relation]}`
      : format === 'TZID'
        ? `DTSTART;TZID=America/Edmonton:20250309T090000\r\nDTEND;TZID=America/Edmonton:${localEnds[relation]}`
        : `DTSTART:20250309T090000\r\nDTEND:${localEnds[relation]}`;
    const batch = await fetchCalendar(calendar(vevent(fields)), zone);
    if (status === 'incomplete') {
      expect(batch).toMatchObject({ status: 'incomplete', coverage, events: [] });
      expect(batch.issues.length).toBeGreaterThan(0);
    } else {
      const expectedEnd = { before: '2025-03-09T14:00:00Z', equal: '2025-03-09T15:00:00Z', after: '2025-03-09T16:00:00Z' };
      expect(batch).toEqual({ status: 'complete', coverage, issues: [], events: [interval('2025-03-09T15:00:00Z', expectedEnd[relation])] });
    }
  });

  // Full Cartesian product: 3 day types x 2 zones x 2 upper-bound positions.
  // Upper bounds are independently specified UTC instants, not calculated by dayBounds.
  it.each([
    ['C19', 'ordinary', 'UTC', '2025-02-01', '2025-02-02', '2025-02-01T23:59:59.999Z', true],
    ['C20', 'ordinary', 'UTC', '2025-02-01', '2025-02-02', '2025-02-02T00:00:00.000Z', false],
    ['C21', 'ordinary', 'America/Edmonton', '2025-02-01', '2025-02-02', '2025-02-02T06:59:59.999Z', true],
    ['C22', 'ordinary', 'America/Edmonton', '2025-02-01', '2025-02-02', '2025-02-02T07:00:00.000Z', false],
    ['C23', 'spring DST', 'UTC', '2025-03-09', '2025-03-10', '2025-03-09T23:59:59.999Z', true],
    ['C24', 'spring DST', 'UTC', '2025-03-09', '2025-03-10', '2025-03-10T00:00:00.000Z', false],
    ['C25', 'spring DST', 'America/Edmonton', '2025-03-09', '2025-03-10', '2025-03-10T05:59:59.999Z', true],
    ['C26', 'spring DST', 'America/Edmonton', '2025-03-09', '2025-03-10', '2025-03-10T06:00:00.000Z', false],
    ['C27', 'fall DST', 'UTC', '2025-11-02', '2025-11-03', '2025-11-02T23:59:59.999Z', true],
    ['C28', 'fall DST', 'UTC', '2025-11-02', '2025-11-03', '2025-11-03T00:00:00.000Z', false],
    ['C29', 'fall DST', 'America/Edmonton', '2025-11-02', '2025-11-03', '2025-11-03T06:59:59.999Z', true],
    ['C30', 'fall DST', 'America/Edmonton', '2025-11-02', '2025-11-03', '2025-11-03T07:00:00.000Z', false],
  ] as const)('%s inCoverage day=%s zone=%s [%s,%s) at=%s expected=%s', (_id, _day, timeZone, from, through, at, expected) => {
    expect(inCoverage(point(at), { from, through, timeZone })).toBe(expected);
  });
});
