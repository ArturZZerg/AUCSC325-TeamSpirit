import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import { SheetModal } from '../src/components/sheet-modal';

type Listener = (value: boolean) => void;
let listener: Listener | undefined;
const animation = () => screen.UNSAFE_getByType(jest.requireActual('react-native').Modal).props.animationType;
beforeEach(() => {
  listener = undefined;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_: string, handler: Listener) => { listener = handler; return { remove: jest.fn() }; }) as never);
});
afterEach(() => jest.restoreAllMocks());

it('slides in by default and stops sliding when the system asks for less motion', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  render(<SheetModal visible animationType="slide"><Text>Editor</Text></SheetModal>);
  await act(async () => {});
  expect(animation()).toBe('slide');
  await act(async () => { listener?.(true); });
  expect(animation()).toBe('none');
  await act(async () => { listener?.(false); });
  expect(animation()).toBe('slide');
});

it('opens without sliding when Reduce Motion is already on, and keeps fades', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const view = render(<SheetModal visible animationType="slide"><Text>Editor</Text></SheetModal>);
  await act(async () => {});
  expect(animation()).toBe('none');
  view.rerender(<SheetModal visible animationType="fade"><Text>Confirm</Text></SheetModal>);
  expect(animation()).toBe('fade');
});
