import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useAgendaClock } from '../src/features/use-agenda-clock';
let change: (state: AppStateStatus) => void; const remove = jest.fn();
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2025-03-10T14:00:30Z'));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { change = listener; return { remove }; });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
it('updates current-day information at minute boundaries and cleans up', () => {
  const { result, unmount } = renderHook(() => useAgendaClock('2025-03-10', 'America/Edmonton'));
  act(() => jest.advanceTimersByTime(30000)); expect(result.current).toBe('2025-03-10T14:01:00.000Z');
  unmount(); expect(remove).toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
});
it('suspends ticking in background and uses the real clock on resume', () => {
  const { result, unmount } = renderHook(() => useAgendaClock('2025-03-10', 'America/Edmonton'));
  act(() => change('background')); expect(jest.getTimerCount()).toBe(0);
  act(() => { jest.setSystemTime(new Date('2025-03-10T17:15:20Z')); change('active'); });
  expect(result.current).toBe('2025-03-10T17:15:20.000Z'); expect(jest.getTimerCount()).toBe(1); unmount();
});
it('starts minute updates when a selected future date becomes today', () => {
  jest.setSystemTime(new Date('2025-03-11T05:59:30Z'));
  const { result, unmount } = renderHook(() => useAgendaClock('2025-03-11', 'America/Edmonton'));
  act(() => jest.advanceTimersByTime(30000)); expect(result.current).toBe('2025-03-11T06:00:00.000Z');
  act(() => jest.advanceTimersByTime(60000)); expect(result.current).toBe('2025-03-11T06:01:00.000Z'); unmount();
});
it('does not keep a ticking timer for a historical date', () => {
  const { unmount } = renderHook(() => useAgendaClock('2025-03-09', 'America/Edmonton')); expect(jest.getTimerCount()).toBe(0); unmount();
});
