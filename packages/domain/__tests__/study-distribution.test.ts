import { distributeStudyDates } from '../src';
const weekdays = [1, 2, 3, 4, 5, 6, 7];
it('spreads three flexible sessions across the complete range', () => {
  expect(distributeStudyDates({ from: '2025-03-07', through: '2025-03-11', count: 3, weekdays })).toEqual(['2025-03-07', '2025-03-09', '2025-03-11']);
});
it.each([['2025-03-08', '2025-03-10'], ['2025-11-01', '2025-11-03']])('uses calendar dates across DST %s', (from, through) => {
  expect(distributeStudyDates({ from, through, count: 3, weekdays })).toEqual([from, from === '2025-03-08' ? '2025-03-09' : '2025-11-02', through]);
});
it('honors selected weekdays and allows deliberately short ranges', () => {
  expect(distributeStudyDates({ from: '2025-03-07', through: '2025-03-12', count: 3, weekdays: [1, 3, 5] })).toEqual(['2025-03-07', '2025-03-10', '2025-03-12']);
  expect(distributeStudyDates({ from: '2025-03-07', through: '2025-03-07', count: 3, weekdays })).toEqual(['2025-03-07', '2025-03-07', '2025-03-07']);
});
it('chooses the first eligible date for a single session and crosses a year boundary', () => {
  expect(distributeStudyDates({ from: '2025-12-31', through: '2026-01-02', count: 1, weekdays })).toEqual(['2025-12-31']);
});
it.each([{ through: '2025-03-06' }, { through: '2025-07-01' }, { count: 0 }, { count: 13 }, { count: 1.5 }, { weekdays: [] }, { weekdays: [0] }, { weekdays: [8] }, { weekdays: [1], through: '2025-03-08' }])('rejects impossible or excessive distributions %j', override => {
  expect(() => distributeStudyDates({ from: '2025-03-07', through: '2025-03-11', count: 3, weekdays, ...override })).toThrow();
});
