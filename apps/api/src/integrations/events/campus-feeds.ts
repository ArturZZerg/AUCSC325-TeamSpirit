import { IcsEventProvider, httpsCalendarLoader } from './ics-event-provider';
import type { EventProvider } from './event-provider';

export const CAMPUS_FEEDS = Symbol('CAMPUS_FEEDS');
export type CampusFeed = { source: string; name: string; website: string; timeZone: string; provider: EventProvider };
const website = 'https://www.ualberta.ca/en/augustana/student-life/campus-recreation/campus-rec-programming.html';
// Public calendar IDs linked by the university page, verified 2026-10-10.
// Adding a source requires a reviewed code change; clients cannot submit URLs.
export function configuredCampusFeeds(mode = process.env.CAMPUS_CALENDARS ?? 'disabled'): CampusFeed[] {
  if (mode === 'disabled') return [];
  if (mode !== 'augustana') throw new Error('CAMPUS_CALENDARS must be disabled or augustana');
  return [
    ['campus:augustana-recreation', 'Augustana · Recreation', 'c_0051f7062ded1b8587a68ae914c5d2eb9881f028173ff5c10e71ad800c7e4c0b'],
    ['campus:augustana-breakout', 'Augustana · Thursday Night Breakout', 'c_e0e496be6b05059ccf78047874153a5dbfabb4241e2f42963f022f22aeedf220'],
  ].map(([source, name, id]) => ({ source, name, website, timeZone: 'America/Edmonton',
    provider: new IcsEventProvider(httpsCalendarLoader(`https://calendar.google.com/calendar/ical/${id}%40group.calendar.google.com/public/basic.ics`), { timeZone: 'America/Edmonton' }),
  }));
}
