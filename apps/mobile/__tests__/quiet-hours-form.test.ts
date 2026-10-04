import { quietHoursRequest } from '../src/features/quiet-hours-form';
it.each([['22:00', '07:00'], ['09:00', '17:00'], ['00:00', '01:00']])('saves %s to %s without changing category preferences', (start, end) => {
  expect(quietHoursRequest({ start, end })).toEqual({ path: '/notification-preferences', method: 'PATCH', body: { quietHoursStart: start, quietHoursEnd: end } });
});
it('clears both fields explicitly and trims entered times', () => {
  expect(quietHoursRequest({ start: ' ', end: '' }).body).toEqual({ quietHoursStart: null, quietHoursEnd: null });
  expect(quietHoursRequest({ start: ' 22:00 ', end: ' 07:00 ' }).body).toEqual({ quietHoursStart: '22:00', quietHoursEnd: '07:00' });
});
it.each([['24:00', '07:00'], ['22:00', '07:60'], ['7:00', '08:00'], ['22:00', ''], ['', '07:00'], ['22:00', '22:00']])('rejects incomplete, invalid or equal interval %s to %s', (start, end) => {
  expect(() => quietHoursRequest({ start, end })).toThrow();
});
