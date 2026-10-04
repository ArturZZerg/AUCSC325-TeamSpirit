import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { BreathingPause, useBreathingPause } from '../src/features/breathing-pause';
const listeners = new Set<(state: AppStateStatus) => void>();
const originalState = AppState.currentState;
function emit(state: AppStateStatus) { AppState.currentState = state; [...listeners].forEach(listener => listener(state)); }
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-04T05:59:30Z')); listeners.clear(); AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener); return { remove: () => { listeners.delete(listener); } };
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); AppState.currentState = originalState; });

it('starts at 60 and finishes after exactly one minute across midnight', () => {
  const { result } = renderHook(useBreathingPause); expect(result.current.status).toBe('idle');
  act(() => { result.current.start(); }); expect(result.current.seconds).toBe(60);
  act(() => { jest.advanceTimersByTime(1000); }); expect(result.current.seconds).toBe(59);
  act(() => { jest.advanceTimersByTime(58000); }); expect(result.current.seconds).toBe(1);
  act(() => { jest.advanceTimersByTime(1000); }); expect(result.current).toMatchObject({ status: 'finished', seconds: 0 });
  expect(jest.getTimerCount()).toBe(0); expect(listeners.size).toBe(0);
});
it('does not extend the deadline after a delayed callback', () => {
  const { result } = renderHook(useBreathingPause); act(() => { result.current.start(); });
  jest.setSystemTime(new Date('2026-10-04T06:00:00Z')); act(() => { jest.advanceTimersByTime(1000); });
  expect(result.current.seconds).toBe(29);
});
it('stops background callbacks and recalculates remaining time on resume', () => {
  const { result } = renderHook(useBreathingPause); act(() => { result.current.start(); emit('inactive'); emit('background'); });
  expect(jest.getTimerCount()).toBe(0);
  jest.setSystemTime(new Date('2026-10-04T06:00:10Z')); act(() => { emit('active'); });
  expect(result.current).toMatchObject({ status: 'running', seconds: 20 }); expect(jest.getTimerCount()).toBe(1);
  act(() => { emit('active'); emit('active'); }); expect(jest.getTimerCount()).toBe(1);
});
it('finishes immediately when resuming after the deadline', () => {
  const { result } = renderHook(useBreathingPause); act(() => { result.current.start(); emit('background'); });
  jest.setSystemTime(new Date('2026-10-05T06:00:10Z')); act(() => { emit('active'); });
  expect(result.current).toMatchObject({ status: 'finished', seconds: 0 }); expect(jest.getTimerCount()).toBe(0);
});
it('allows cancellation and starts a fresh minute', () => {
  const { result } = renderHook(useBreathingPause); act(() => { result.current.start(); jest.advanceTimersByTime(10000); });
  act(() => { result.current.cancel(); }); expect(result.current.status).toBe('idle'); expect(jest.getTimerCount()).toBe(0);
  act(() => { jest.advanceTimersByTime(60000); result.current.start(); }); expect(result.current.seconds).toBe(60);
  act(() => { jest.advanceTimersByTime(1000); }); expect(result.current.seconds).toBe(59);
});
it('ignores repeated starts and permits restart after completion', () => {
  const { result } = renderHook(useBreathingPause); act(() => { result.current.start(); result.current.start(); });
  act(() => { jest.advanceTimersByTime(30000); result.current.start(); }); expect(result.current.seconds).toBe(30);
  act(() => { jest.advanceTimersByTime(30000); }); expect(result.current.status).toBe('finished');
  act(() => { result.current.start(); }); expect(result.current).toMatchObject({ status: 'running', seconds: 60 });
});
it('starts while backgrounded without scheduling callbacks', () => {
  AppState.currentState = 'background'; const { result } = renderHook(useBreathingPause);
  act(() => { result.current.start(); }); expect(jest.getTimerCount()).toBe(0);
  jest.setSystemTime(new Date('2026-10-04T05:59:40Z')); act(() => { emit('active'); }); expect(result.current.seconds).toBe(50);
});
it('removes pending callbacks and subscriptions on unmount', () => {
  const { result, unmount } = renderHook(useBreathingPause); act(() => { result.current.start(); }); expect(listeners.size).toBe(1);
  unmount(); expect(listeners.size).toBe(0); expect(jest.getTimerCount()).toBe(0);
});
it('shows countdown, cancellation and a fresh idle state', () => {
  render(<BreathingPause/>); fireEvent.press(screen.getByText('Start 60 seconds')); expect(screen.getByText('60s remaining')).toBeOnTheScreen();
  act(() => { jest.advanceTimersByTime(1000); }); expect(screen.getByText('59s remaining')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Cancel pause')); expect(screen.getByText('Start 60 seconds')).toBeOnTheScreen(); expect(screen.queryByText(/remaining/)).toBeNull();
});
it('shows completion and lets the user start another minute', () => {
  render(<BreathingPause/>); fireEvent.press(screen.getByText('Start 60 seconds')); act(() => { jest.advanceTimersByTime(60000); });
  expect(screen.getByText('Your one-minute pause is complete.')).toBeOnTheScreen(); fireEvent.press(screen.getByText('Start another minute'));
  expect(screen.getByText('60s remaining')).toBeOnTheScreen();
});
