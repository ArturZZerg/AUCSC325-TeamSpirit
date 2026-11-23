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
    { kind: 'open', opens: '06:00', closes: '22:00' }, ...Array.from({ length: 4 }, () => ({ kind: 'unknown' })),
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
