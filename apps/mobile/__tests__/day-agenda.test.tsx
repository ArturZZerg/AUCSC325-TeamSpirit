import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DayAgenda } from '../src/features/day-agenda';
import { useClasses, usePlanningSnapshot } from '../src/features/queries';
import { classFixture } from './class-fixture';
import { accountId, snapshotFixture } from './snapshot-fixture';
let mockNow = '2025-03-10T14:00:00Z'; const classRefresh = jest.fn(), planRefresh = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/features/queries', () => ({ useClasses: jest.fn(), usePlanningSnapshot: jest.fn() }));
jest.mock('../src/features/use-agenda-clock', () => ({ useAgendaClock: () => mockNow }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { id: '10000000-0000-4000-8000-000000000001' } } }) }));
beforeEach(() => {
  jest.clearAllMocks(); mockNow = '2025-03-10T14:00:00Z';
  jest.mocked(useClasses).mockReturnValue({ data: [classFixture()], refetch: classRefresh } as unknown as ReturnType<typeof useClasses>);
  jest.mocked(usePlanningSnapshot).mockReturnValue({ data: { ...snapshotFixture(), personalTasks: [] }, accountId, refetch: planRefresh } as unknown as ReturnType<typeof usePlanningSnapshot>);
});
it('shows next-class room information and opens the timetable', () => {
  render(<DayAgenda date="2025-03-10" timeZone="America/Edmonton" onPlan={jest.fn()}/>);
  expect(screen.getByText('NEXT CLASS')).toBeTruthy(); expect(screen.getByText('Library 204 · Dr Green')).toBeTruthy();
  fireEvent.press(screen.getByText('Timetable')); expect(router.push).toHaveBeenCalledWith('/timetable');
});
it('shows a class in progress and advances to the next class as time changes', () => {
  mockNow = '2025-03-10T15:30:00Z';
  const view = render(<DayAgenda date="2025-03-10" timeZone="America/Edmonton" onPlan={jest.fn()}/>);
  expect(screen.getByText('IN CLASS NOW')).toBeTruthy(); mockNow = '2025-03-10T16:01:00Z';
  view.rerender(<DayAgenda date="2025-03-10" timeZone="America/Edmonton" onPlan={jest.fn()}/>);
  expect(screen.queryByText('IN CLASS NOW')).toBeNull(); expect(screen.queryByText('NEXT CLASS')).toBeNull();
});
it('lets students choose a duration and review a study draft without writing automatically', () => {
  const plan = jest.fn(); render(<DayAgenda date="2025-03-10" timeZone="America/Edmonton" onPlan={plan}/>); expect(plan).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('radio', { name: '60 minute study block' }));
  expect(screen.queryByText('Plan 60 min at 8:00 AM')).toBeNull(); fireEvent.press(screen.getByText('Plan 60 min at 10:15 AM'));
  expect(plan).toHaveBeenCalledWith(expect.objectContaining({ estimatedMinutes: '60', scheduledDate: '2025-03-10', scheduledTime: '10:15', category: 'university' }));
});
it('keeps Today compact until study windows are requested', () => {
  render(<DayAgenda compact date="2025-03-10" timeZone="America/Edmonton" onPlan={jest.fn()}/>);
  expect(screen.queryByText('Make time for study')).toBeNull(); fireEvent.press(screen.getByText('Find study time'));
  expect(screen.getByText('Make time for study')).toBeTruthy(); fireEvent.press(screen.getByText('Close study windows'));
  expect(screen.queryByText('Make time for study')).toBeNull();
});
it('labels a saved timetable even when Today study suggestions are collapsed', () => {
  jest.mocked(useClasses).mockReturnValue({ data: [classFixture()], isCached: true, refetch: classRefresh } as unknown as ReturnType<typeof useClasses>);
  render(<DayAgenda compact date="2025-03-10" timeZone="America/Edmonton" onPlan={jest.fn()}/>);
  expect(screen.getByText('Saved timetable · may be out of date.')).toBeTruthy(); expect(screen.queryByText('Make time for study')).toBeNull();
});
it('withholds suggestions when timetable or plan data is missing and supports refresh', () => {
  jest.mocked(useClasses).mockReturnValue({ data: undefined, refetch: classRefresh } as unknown as ReturnType<typeof useClasses>);
  render(<DayAgenda date="2025-03-10" timeZone="America/Edmonton" onPlan={jest.fn()}/>);
  expect(screen.getByText(/Load this day’s plan and timetable/)).toBeTruthy(); expect(screen.queryByText(/minutes available/)).toBeNull();
  fireEvent.press(screen.getByText('Refresh classes & study windows')); expect(classRefresh).toHaveBeenCalled(); expect(planRefresh).toHaveBeenCalled();
});
it('labels stale suggestions and explains why unknown durations prevent suggestions', () => {
  const task = { ...snapshotFixture().personalTasks[0], recurrence: null, scheduled: { kind: 'instant', at: '2025-03-10T17:00:00Z' } };
  jest.mocked(usePlanningSnapshot).mockReturnValue({ data: { ...snapshotFixture(), personalTasks: [task] }, isCached: true, refetch: planRefresh } as unknown as ReturnType<typeof usePlanningSnapshot>);
  render(<DayAgenda date="2025-03-10" timeZone="America/Edmonton" onPlan={jest.fn()}/>);
  expect(screen.getByText(/Using saved information/)).toBeTruthy(); expect(screen.getByText(/A timed task needs/)).toBeTruthy();
  fireEvent.press(screen.getByText('Review scheduled tasks')); expect(router.push).toHaveBeenCalledWith('/tasks');
});
