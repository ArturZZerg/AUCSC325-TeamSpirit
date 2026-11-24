import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import type { GymOpeningHours } from '@campusflow/contracts';
import { GymOpeningHoursCard, gymOpeningDayLabel } from '../src/features/gym-opening-hours';

const hours: GymOpeningHours = { timeZone: 'America/Edmonton', days: [
  ...Array.from({ length: 5 }, () => ({ kind: 'open' as const, opens: '06:00', closes: '22:00' })),
  { kind: 'open', opens: '20:00', closes: '02:00' }, { kind: 'closed' },
] };
it.each([
  [{ kind: 'unknown' as const }, 'Hours not set'],
  [{ kind: 'closed' as const }, 'Closed'],
  [{ kind: 'open' as const, opens: '06:00', closes: '22:00' }, '06:00–22:00'],
  [{ kind: 'open' as const, opens: '20:00', closes: '02:00' }, '20:00–02:00 (next day)'],
])('labels %j without confusing overnight and closed hours', (day, label) => {
  expect(gymOpeningDayLabel(day)).toBe(label);
});
it('displays saved weekday/weekend hours and their explicit timezone', () => {
  render(<GymOpeningHoursCard hours={hours} timeZone="UTC" onSave={jest.fn()}/>);
  expect(screen.getByText('Monday: 06:00–22:00')).toBeOnTheScreen();
  expect(screen.getByText('Saturday: 20:00–02:00 (next day)')).toBeOnTheScreen();
  expect(screen.getByText('Sunday: Closed')).toBeOnTheScreen();
  expect(screen.getByText('America/Edmonton · 24-hour time')).toBeOnTheScreen();
});
it('saves new hours, displays the confirmed schedule and can remove it', async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  function SavedCard() {
    const [saved, setSaved] = useState<GymOpeningHours | null>(null);
    return <GymOpeningHoursCard hours={saved} timeZone="America/Edmonton" onSave={async value => { await save(value); setSaved(value); }}/>;
  }
  render(<SavedCard/>);
  expect(screen.getByText('Gym hours haven’t been set.')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Set gym hours'));
  fireEvent.press(screen.getByRole('radio', { name: 'Monday open' }));
  fireEvent.changeText(screen.getByLabelText('Monday opens'), '06:00');
  fireEvent.changeText(screen.getByLabelText('Monday closes'), '22:00');
  fireEvent.press(screen.getByRole('radio', { name: 'Saturday open' }));
  fireEvent.changeText(screen.getByLabelText('Saturday opens'), '20:00');
  fireEvent.changeText(screen.getByLabelText('Saturday closes'), '02:00');
  fireEvent.press(screen.getByRole('radio', { name: 'Sunday closed' }));
  fireEvent.press(screen.getByText('Save gym hours'));
  await screen.findByText('Saturday: 20:00–02:00 (next day)');
  expect(save).toHaveBeenCalledWith({ timeZone: 'America/Edmonton', days: [
    { kind: 'open', opens: '06:00', closes: '22:00' }, ...Array.from({ length: 4 }, () => ({ kind: 'open', opens: '09:00', closes: '17:00' })),
    { kind: 'open', opens: '20:00', closes: '02:00' }, { kind: 'closed' },
  ] });
  fireEvent.press(screen.getByText('Edit gym hours'));
  fireEvent.press(screen.getByText('Remove saved hours'));
  await screen.findByText('Gym hours haven’t been set.');
  expect(save).toHaveBeenLastCalledWith(null);
});
it('validates times, preserves a failed draft for retry and cancels without a write', async () => {
  const save = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
  render(<GymOpeningHoursCard hours={hours} timeZone="UTC" onSave={save}/>);
  fireEvent.press(screen.getByText('Edit gym hours'));
  fireEvent.press(screen.getByRole('radio', { name: 'Monday open' }));
  expect(screen.getByLabelText('Monday opens')).toHaveDisplayValue('06:00');
  fireEvent.changeText(screen.getByLabelText('Monday opens'), '24:00');
  fireEvent.press(screen.getByText('Save gym hours'));
  expect(screen.getByRole('alert')).toHaveTextContent(/HH:mm/);
  expect(save).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Monday opens'), '07:00');
  fireEvent.press(screen.getByText('Save gym hours'));
  await screen.findByText('Offline');
  expect(screen.getByLabelText('Monday opens')).toHaveDisplayValue('07:00');
  fireEvent.press(screen.getByText('Save gym hours'));
  await waitFor(() => expect(screen.queryByText('Save gym hours')).toBeNull());
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
  fireEvent.press(screen.getByText('Edit gym hours'));
  fireEvent.press(screen.getByText('Cancel'));
  expect(save).toHaveBeenCalledTimes(2);
});
it('disables saving and dismissal while a save is pending', async () => {
  let finish!: () => void;
  const save = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<GymOpeningHoursCard hours={hours} timeZone="UTC" onSave={save}/>);
  fireEvent.press(screen.getByText('Edit gym hours'));
  fireEvent.press(screen.getByText('Save gym hours'));
  expect(screen.getByText('Saving…')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Cancel'));
  fireEvent.press(screen.getByText('Remove saved hours'));
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  expect(screen.getByText('Edit gym hours')).toBeOnTheScreen();
});
it('displays an acknowledged save while the overview is stale, then accepts a refreshed snapshot', async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  const ui = render(<GymOpeningHoursCard hours={hours} timeZone="UTC" onSave={save}/>);
  fireEvent.press(screen.getByText('Edit gym hours'));
  fireEvent.changeText(screen.getByLabelText('Monday opens'), '07:00');
  fireEvent.press(screen.getByText('Save gym hours'));
  await screen.findByText('Monday: 07:00–22:00');
  ui.rerender(<GymOpeningHoursCard hours={{ ...hours, days: hours.days.map(() => ({ kind: 'closed' })) }} timeZone="UTC" onSave={save}/>);
  expect(screen.getByText('Monday: Closed')).toBeOnTheScreen();
});

it('normalizes short-hour and AM/PM drafts before saving and reopening', async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  const ui = render(<GymOpeningHoursCard hours={null} timeZone="America/Edmonton" onSave={save}/>);
  fireEvent.press(screen.getByText('Set gym hours'));
  expect(screen.getByLabelText('Monday opens')).toHaveDisplayValue('09:00');
  expect(screen.getByLabelText('Friday closes')).toHaveDisplayValue('17:00');
  expect(screen.queryByLabelText('Saturday opens')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Monday opens'), '7:00');
  fireEvent.changeText(screen.getByLabelText('Monday closes'), '10:00');
  expect(screen.queryByText('Closes the next day.')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Tuesday opens'), '7 AM');
  fireEvent.changeText(screen.getByLabelText('Tuesday closes'), '7:30pm');
  await act(async () => { fireEvent.press(screen.getByText('Save gym hours')); });
  expect(save.mock.calls[0][0].days.slice(0, 2)).toEqual([
    { kind: 'open', opens: '07:00', closes: '10:00' }, { kind: 'open', opens: '07:00', closes: '19:30' },
  ]);
  const saved = save.mock.calls[0][0] as GymOpeningHours;
  ui.unmount();
  render(<GymOpeningHoursCard hours={saved} timeZone="UTC" onSave={save}/>);
  fireEvent.press(screen.getByText('Edit gym hours'));
  expect(screen.getByLabelText('Monday opens')).toHaveDisplayValue('07:00');
  expect(screen.getByLabelText('Monday closes')).toHaveDisplayValue('10:00');
  expect(screen.getByLabelText('Tuesday closes')).toHaveDisplayValue('19:30');
  expect(screen.getByLabelText('Gym timezone')).toHaveDisplayValue('America/Edmonton');
  fireEvent.changeText(screen.getByLabelText('Monday opens'), '8am');
  fireEvent.press(screen.getByText('Cancel'));
  fireEvent.press(screen.getByText('Edit gym hours'));
  expect(screen.getByLabelText('Monday opens')).toHaveDisplayValue('07:00');
  expect(save).toHaveBeenCalledTimes(1);
});

it('shows only genuine overnight labels and reports invalid fields without saving', async () => {
  const save = jest.fn();
  render(<GymOpeningHoursCard hours={null} timeZone="UTC" onSave={save}/>);
  fireEvent.press(screen.getByText('Set gym hours'));
  fireEvent.changeText(screen.getByLabelText('Monday opens'), '7pm');
  fireEvent.changeText(screen.getByLabelText('Monday closes'), '12am');
  expect(screen.getByText('Closes the next day.')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('Monday closes'), 'bad');
  expect(screen.queryByText('Closes the next day.')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Tuesday opens'), '24:00');
  fireEvent.changeText(screen.getByLabelText('Gym timezone'), 'not/a/zone');
  fireEvent.press(screen.getByText('Save gym hours'));
  expect(screen.getByText(/^Monday closing time: Enter a time/)).toBeOnTheScreen();
  expect(screen.getByText(/^Tuesday opening time: Enter a time/)).toBeOnTheScreen();
  expect(screen.getByText(/^Gym timezone: Enter a valid IANA/)).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Monday closes')).toHaveDisplayValue('bad');
});

it('preserves explicitly unknown, closed and overnight saved days when opening the editor', async () => {
  const saved: GymOpeningHours = { ...hours, days: [{ kind: 'unknown' }, ...hours.days.slice(1)] };
  const save = jest.fn().mockResolvedValue(undefined);
  render(<GymOpeningHoursCard hours={saved} timeZone="UTC" onSave={save}/>);
  fireEvent.press(screen.getByText('Edit gym hours'));
  expect(screen.queryByLabelText('Monday opens')).toBeNull();
  expect(screen.getByLabelText('Saturday closes')).toHaveDisplayValue('02:00');
  await act(async () => { fireEvent.press(screen.getByText('Save gym hours')); });
  expect(save).toHaveBeenCalledWith(saved);
});
