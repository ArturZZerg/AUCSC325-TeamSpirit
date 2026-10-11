import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Campus from '../app/(tabs)/campus';
import { campusGroups, campusSourceAvailability, campusWebsite } from '../src/features/campus-discovery';
import { useAction, useCampusSources, useEvents } from '../src/features/queries';
import { eventFixture } from './event-fixture';
import type { CampusSourceStatus } from '@campusflow/contracts';

jest.mock('../src/features/queries', () => ({ useAction: jest.fn(), useEvents: jest.fn(), useCampusSources: jest.fn() }));
jest.mock('../src/store/session', () => ({ useSessionStore: (select: (state: unknown) => unknown) => select({ session: { user: { timeZone: 'America/Edmonton' } } }) }));
const date = '2026-10-10', zone = 'America/Edmonton', now = '2026-10-10T18:00:00Z';
const source: CampusSourceStatus = { source: 'campus:recreation', name: 'Campus recreation', website: 'https://example.org/campus', availability: 'available', lastSuccessfulAt: now,
  coverage: { from: '2026-10-09', through: '2026-12-10', timeZone: zone } };
const event = { ...eventFixture(), source: source.source, saved: false, includedInPlan: false, timing: { kind: 'timed' as const, startsAt: '2026-10-11T01:00:00Z', endsAt: null } };
const options = { date, timeZone: zone, days: 7 as const, saved: false, search: '' };
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date(now)); jest.clearAllMocks();
  jest.mocked(useAction).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({}), isPending: false } as unknown as ReturnType<typeof useAction>);
  jest.mocked(useEvents).mockReturnValue({ data: [event], refetch: jest.fn(), isLoading: false } as unknown as ReturnType<typeof useEvents>);
  jest.mocked(useCampusSources).mockReturnValue({ data: { generatedAt: now, sources: [source] }, refetch: jest.fn() } as unknown as ReturnType<typeof useCampusSources>);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
describe('campus discovery calendar rules', () => {
  it('groups by the student local date and includes spanning events on Today', () => {
    const overnight = { ...event, id: 'overnight', timing: { kind: 'timed' as const, startsAt: '2026-10-09T23:00:00Z', endsAt: '2026-10-10T08:00:00Z' } };
    expect(campusGroups([event, overnight], options)).toEqual([{ date, events: [overnight, event] }]);
  });
  it('excludes historical and upper-bound events without losing saved history', () => {
    const old = { ...event, id: 'old', saved: true, timing: { kind: 'allDay' as const, startDate: '2026-09-01', endDateExclusive: '2026-09-02' } };
    const upper = { ...event, id: 'upper', timing: { kind: 'timed' as const, startsAt: '2026-10-17T06:00:00Z', endsAt: null } };
    expect(campusGroups([old, upper, event], options)).toEqual([{ date, events: [event] }]);
    expect(campusGroups([old, upper, event], { ...options, saved: true })).toEqual([{ date: '2026-09-01', events: [old] }]);
  });
  it('uses calendar bounds over 25-hour DST days and finds title, category or place', () => {
    const lastHour = { ...event, location: 'Climbing Wall', timing: { kind: 'timed' as const, startsAt: '2026-11-02T06:30:00Z', endsAt: null } };
    const result = campusGroups([lastHour], { ...options, date: '2026-11-01', search: ' CLIMBING ' });
    expect(result[0].date).toBe('2026-11-01'); expect(result[0].events).toEqual([lastHour]);
    expect(campusGroups([event], { ...options, search: 'club' })[0].events).toEqual([event]);
  });
  it('ages saved freshness and checks the complete requested range', () => {
    expect(campusSourceAvailability(source, now, date, '2026-10-17', zone)).toBe('available');
    expect(campusSourceAvailability(source, '2026-10-10T19:30:00Z', date, '2026-10-17', zone)).toBe('stale');
    expect(campusSourceAvailability(source, '2026-10-10T17:59:00Z', date, '2026-10-17', zone)).toBe('stale');
    expect(campusSourceAvailability(source, now, date, '2026-12-11', zone)).toBe('stale');
    expect(campusSourceAvailability({ ...source, availability: 'stale' }, now, date, '2026-10-17', zone)).toBe('stale');
  });
  it.each(['javascript:alert(1)', 'file:///private', 'https://user:secret@example.org', 'invalid'])('withholds unsafe organiser link %s', value => {
    expect(campusWebsite(value)).toBeUndefined();
  });
});
describe('campus discovery interactions', () => {
  it('withholds an empty count when no event data is available', () => {
    jest.mocked(useEvents).mockReturnValue({ data: undefined, refetch: jest.fn(), error: new Error('Offline') } as unknown as ReturnType<typeof useEvents>);
    render(<Campus/>); expect(screen.getByText(/Upcoming events/)).toBeOnTheScreen();
    expect(screen.queryByText(/0 events to explore/)).toBeNull(); expect(screen.queryByText(/No upcoming events/)).toBeNull();
  });
  it('updates freshness while the Campus screen stays open', () => {
    render(<Campus/>); expect(screen.getByText('1 campus calendars · Updated hourly')).toBeOnTheScreen();
    act(() => { jest.advanceTimersByTime(91 * 60000); });
    expect(screen.getByText('Some calendar listings may be out of date.')).toBeOnTheScreen();
  });
  it('switches ranges and saved history, then filters by location without a write', () => {
    const later = { ...event, id: 'later', title: 'Climbing Night', location: 'North Gym', saved: true, timing: { kind: 'allDay' as const, startDate: '2026-10-25', endDateExclusive: '2026-10-26' } };
    jest.mocked(useEvents).mockReturnValue({ data: [event, later], refetch: jest.fn() } as unknown as ReturnType<typeof useEvents>);
    render(<Campus/>); expect(screen.queryByText(later.title)).toBeNull();
    fireEvent.press(screen.getByText('Next 30 days')); expect(screen.getByText(later.title)).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Saved')); expect(screen.queryByText(event.title)).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Filter events'), 'north gym'); expect(screen.getByText(later.title)).toBeOnTheScreen();
    expect(useAction().mutateAsync).not.toHaveBeenCalled();
  });
  it('exposes source provenance and delayed freshness, retains listings after failed status refresh', () => {
    jest.mocked(useCampusSources).mockReturnValue({ data: { sources: [{ ...source, availability: 'stale' }] }, error: new Error('Offline'), refetch: jest.fn() } as unknown as ReturnType<typeof useCampusSources>);
    render(<Campus/>); expect(screen.getByText(event.title)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Calendar sources' }));
    expect(screen.getByText(/Refresh delayed/)).toBeOnTheScreen(); expect(screen.getByRole('button', { name: 'Visit Campus recreation' })).toBeOnTheScreen();
  });
  it('opens a safe organiser link only after a student tap', () => {
    const link = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.mocked(useEvents).mockReturnValue({ data: [{ ...event, url: 'https://example.org/event' }], refetch: jest.fn() } as unknown as ReturnType<typeof useEvents>);
    render(<Campus/>); expect(link).not.toHaveBeenCalled(); fireEvent.press(screen.getByText('Organiser website')); expect(link).toHaveBeenCalledWith('https://example.org/event');
  });
});
