import { studyWindows } from '../src';
const input = { date: '2025-03-10', timeZone: 'America/Edmonton', now: '2025-03-10T12:00:00Z', minimumMinutes: 30,
  busy: [{ startsAt: '2025-03-10T15:00:00Z', endsAt: '2025-03-10T16:00:00Z' }] };
it('subtracts commitments and transition time, rounding starts forward', () => {
  expect(studyWindows(input)).toEqual([
    { startsAt: '2025-03-10T14:00:00Z', endsAt: '2025-03-10T14:50:00Z', minutes: 50 },
    { startsAt: '2025-03-10T16:15:00Z', endsAt: '2025-03-11T02:00:00Z', minutes: 585 },
  ]);
});
it('merges overlapping and adjacent buffers before finding gaps', () => {
  const busy = [...input.busy, { startsAt: '2025-03-10T15:30:00Z', endsAt: '2025-03-10T17:00:00Z' },
    { startsAt: '2025-03-10T17:15:00Z', endsAt: '2025-03-10T18:00:00Z' }];
  const windows = studyWindows({ ...input, busy }); expect(windows).toHaveLength(2); expect(windows[1].startsAt).toBe('2025-03-10T18:15:00Z');
});
it('offers only windows that fit the chosen block', () => { expect(studyWindows({ ...input, minimumMinutes: 60 })).toHaveLength(1); });
it('excludes elapsed time, past days and exhausted study hours', () => {
  expect(studyWindows({ ...input, now: '2025-03-10T17:02:39Z' })[0].startsAt).toBe('2025-03-10T17:15:00Z');
  expect(studyWindows({ ...input, now: '2025-03-11T02:01:00Z' })).toEqual([]); expect(studyWindows({ ...input, now: '2025-03-11T14:00:00Z' })).toEqual([]);
});
it('clips crossing-day and all-day commitments to local study hours', () => {
  expect(studyWindows({ ...input, busy: [{ startsAt: '2025-03-10T06:00:00Z', endsAt: '2025-03-11T06:00:00Z' }] })).toEqual([]);
  expect(studyWindows({ ...input, busy: [{ startsAt: '2025-03-10T05:00:00Z', endsAt: '2025-03-10T15:00:00Z' }] })[0].startsAt).toBe('2025-03-10T15:15:00Z');
});
it.each([['2025-03-09', '2025-03-09T14:00:00Z', '2025-03-10T02:00:00Z'], ['2025-11-02', '2025-11-02T15:00:00Z', '2025-11-03T03:00:00Z']])('uses local study hours on DST transition %s', (date, startsAt, endsAt) => {
  expect(studyWindows({ ...input, date, now: '2025-01-01T00:00:00Z', busy: [] })).toEqual([{ startsAt, endsAt, minutes: 720 }]);
});
it('rejects invalid durations and reversed commitment intervals', () => {
  expect(() => studyWindows({ ...input, minimumMinutes: 0 })).toThrow(RangeError);
  expect(() => studyWindows({ ...input, busy: [{ startsAt: input.busy[0].endsAt, endsAt: input.busy[0].startsAt }] })).toThrow(RangeError);
});
