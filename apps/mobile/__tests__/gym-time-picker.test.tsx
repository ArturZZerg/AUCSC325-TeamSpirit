import { fireEvent, render, screen } from '@testing-library/react-native';
import { GymTimePicker } from '../src/features/gym-time-picker';

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return React.createElement(View, { ...props, testID: 'system-time-picker' });
  },
}));

it('opens a labelled picker seeded from manual AM/PM input and returns a normalized wall-clock time', () => {
  const change = jest.fn();
  render(<GymTimePicker label="Monday opens" value="7pm" disabled={false} onChange={change}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Choose monday opens' }));
  const picker = screen.getByLabelText('Monday opens');
  expect(picker.props.value.getHours()).toBe(19);
  fireEvent(picker, 'onChange', { type: 'set' }, new Date(2000, 0, 1, 0, 30));
  expect(change).toHaveBeenCalledWith('00:30');
  fireEvent.press(screen.getByText('Done'));
  expect(screen.queryByTestId('system-time-picker')).toBeNull();
});

it('does not replace manual input on picker dismissal', () => {
  const change = jest.fn();
  render(<GymTimePicker label="Monday closes" value="invalid draft" disabled={false} onChange={change}/>);
  fireEvent.press(screen.getByRole('button', { name: 'Choose monday closes' }));
  fireEvent(screen.getByTestId('system-time-picker'), 'onChange', { type: 'dismissed' }, undefined);
  expect(change).not.toHaveBeenCalled();
});

it('disables the picker trigger during saving', () => {
  render(<GymTimePicker label="Monday closes" value="17:00" disabled onChange={jest.fn()}/>);
  const trigger = screen.getByRole('button', { name: 'Choose monday closes' });
  expect(trigger).toBeDisabled();
  fireEvent.press(trigger);
  expect(screen.queryByTestId('system-time-picker')).toBeNull();
});
