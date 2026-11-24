import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { TodayWeekStrip } from '../src/features/today-week-strip';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

it('labels each calendar day and exposes the selected date to assistive technology', () => {
  render(<TodayWeekStrip date="2026-11-23" today="2026-11-23"/>);
  expect(screen.getByRole('button', { name: 'View November 23', selected: true })).toBeOnTheScreen();
  for (const day of [24, 25, 26, 27, 28, 29]) {
    expect(screen.getByRole('button', { name: `View November ${day}`, selected: false })).toBeOnTheScreen();
  }
  expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();
});

it('opens the chosen day from a week that spans two years', () => {
  render(<TodayWeekStrip date="2026-12-30" today="2026-12-30"/>);
  expect(screen.getByRole('button', { name: 'View December 28' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'View January 3' })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'View January 1' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/today', params: { date: '2027-01-01' } });
});

it.each([
  ['across a month boundary', '2026-11-02', '2026-10-26', '2026-11-09'],
  ['across a year boundary', '2026-12-30', '2026-12-23', '2027-01-06'],
  ['across the spring DST transition', '2026-03-08', '2026-03-01', '2026-03-15'],
  ['across the autumn DST transition', '2026-11-01', '2026-10-25', '2026-11-08'],
])('moves by calendar weeks %s', (_label, date, previous, next) => {
  render(<TodayWeekStrip date={date} today={date}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/today', params: { date: previous } });
  fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/today', params: { date: next } });
});

it('selects the actual calendar date during a daylight saving transition week', () => {
  render(<TodayWeekStrip date="2026-03-08" today="2026-03-08"/>);
  expect(screen.getByRole('button', { name: 'View March 2' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'View March 8', selected: true })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'View March 7' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/today', params: { date: '2026-03-07' } });
});

it('returns to the supplied account date when viewing another day', () => {
  render(<TodayWeekStrip date="2026-12-02" today="2026-11-23"/>);
  fireEvent.press(screen.getByRole('button', { name: 'Back to today' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/today', params: { date: '2026-11-23' } });
});
