import { Temporal } from '@js-temporal/polyfill';

/** Distributes flexible study days; it makes no claim about hourly availability. */
export function distributeStudyDates(input: { from: string; through: string; count: number; weekdays: readonly number[] }): string[] {
  const from = Temporal.PlainDate.from(input.from), through = Temporal.PlainDate.from(input.through);
  const span = from.until(through).days;
  if (span < 0) throw new RangeError('The finish date must be on or after the start date.');
  if (span > 90) throw new RangeError('Choose a study range of up to 90 days.');
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 12) throw new RangeError('Choose 1–12 sessions.');
  if (!input.weekdays.length || input.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new RangeError('Choose at least one study weekday.');
  }
  const days = Array.from({ length: span + 1 }, (_, offset) => from.add({ days: offset }))
    .filter(day => input.weekdays.includes(day.dayOfWeek)).map(day => day.toString());
  if (!days.length) throw new RangeError('No selected weekdays fall inside this date range.');
  return Array.from({ length: input.count }, (_, index) => days[input.count === 1 ? 0 : Math.round(index * (days.length - 1) / (input.count - 1))]);
}
