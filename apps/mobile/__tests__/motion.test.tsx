import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import { MotionPressable, useReducedMotion } from '../src/components/motion';
import { FlowProgress } from '../src/features/flow-progress';

const preferenceListeners = new Set<(value: boolean) => void>();
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  // Exercise the boolean preference overload and the only subscription operation
  // consumed by the hook, without depending on RN's native event emitter.
  const subscribe = (event: string, listener: (value: boolean) => void) => {
    if (event === 'reduceMotionChanged') preferenceListeners.add(listener);
    return { remove: () => { preferenceListeners.delete(listener); } };
  };
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(subscribe as unknown as typeof AccessibilityInfo.addEventListener);
});
afterEach(() => { jest.restoreAllMocks(); preferenceListeners.clear(); });

it.each([false, true])('preserves the accessible action and its disabled state (disabled=%s)', async disabled => {
  const onPress = jest.fn();
  render(<MotionPressable accessibilityRole="button" accessibilityLabel="Start focus" disabled={disabled} onPress={onPress}><Text>Start focus</Text></MotionPressable>);
  await act(async () => {});
  const button = screen.getByRole('button', { name: 'Start focus' });
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(disabled ? 0 : 1);
  if (disabled) expect(button).toBeDisabled(); else expect(button).toBeEnabled();
});

function PreferenceProbe() {
  const reduced = useReducedMotion();
  return <MotionPressable accessibilityRole="button" accessibilityLabel="Motion preference"><Text>{reduced ? 'Reduced motion' : 'Motion enabled'}</Text></MotionPressable>;
}

it('responds to an updated reduced motion preference and keeps an engaged control still', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  render(<PreferenceProbe/>);
  await act(async () => {});
  expect(screen.getByText('Motion enabled')).toBeOnTheScreen();
  const button = screen.getByRole('button', { name: 'Motion preference' });
  fireEvent(button, 'pressIn', { nativeEvent: {} });
  await act(async () => { preferenceListeners.forEach(listener => listener(true)); });
  expect(screen.getByText('Reduced motion')).toBeOnTheScreen();
  expect(button).toHaveStyle({ transform: [{ translateY: 0 }, { scale: 1 }] });
});

it('announces current progress after completion changes and handles an empty day', async () => {
  const view = render(<FlowProgress done={2} total={6}/>);
  await act(async () => {});
  expect(screen.getByRole('progressbar', { name: 'Daily plan progress' })).toHaveAccessibilityValue({ min: 0, max: 6, now: 2 });
  view.rerender(<FlowProgress done={3} total={6}/>);
  expect(screen.getByText('3 of 6')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Daily plan progress' })).toHaveAccessibilityValue({ min: 0, max: 6, now: 3 });
  view.rerender(<FlowProgress done={0} total={0}/>);
  expect(screen.getByText('Clear')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Daily plan progress' })).toHaveAccessibilityValue({ min: 0, max: 0, now: 0 });
});
