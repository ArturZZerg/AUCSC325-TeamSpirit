import { IcsEventProvider, httpsCalendarLoader } from './ics-event-provider';
import type { EventProvider } from './event-provider';

export const CAMPUS_FEEDS = Symbol('CAMPUS_FEEDS');
export type CampusFeed = { source: string; name: string; website: string; timeZone: string; provider: EventProvider };
const recreation = 'https://www.ualberta.ca/en/augustana/student-life/campus-recreation/campus-rec-programming.html';
/** Campus-wide calendar that repeats listings from the more specific feeds. */
export const campusWideSource = 'campus:augustana-events';
const maxBytes = 8 * 1024 * 1024;
// Sized for the Campus Events export, verified 2026-11-02: 3.8 MB, 5,893 VEVENTs, about 9 s to download.
const feedOptions = { timeZone: 'America/Edmonton', timeoutMs: 20000, calendarRules: true, pastDays: 30,
  limits: { bytes: maxBytes, components: 10000, events: 2000, steps: 20000, seriesSteps: 20000 } };
// Public calendar IDs: recreation feeds linked by the university page, verified 2026-10-10;
// Campus Events (MyUAlberta) and Career Services (uab.ca/augcs), verified 2026-11-02.
// Adding a source requires a reviewed code change; clients cannot submit URLs.
export function configuredCampusFeeds(mode = process.env.CAMPUS_CALENDARS ?? 'disabled'): CampusFeed[] {
  if (mode === 'disabled') return [];
  if (mode !== 'augustana') throw new Error('CAMPUS_CALENDARS must be disabled or augustana');
  return [
    ['campus:augustana-recreation', 'Augustana · Recreation', 'c_0051f7062ded1b8587a68ae914c5d2eb9881f028173ff5c10e71ad800c7e4c0b', recreation],
    ['campus:augustana-breakout', 'Augustana · Thursday Night Breakout', 'c_e0e496be6b05059ccf78047874153a5dbfabb4241e2f42963f022f22aeedf220', recreation],
    ['campus:augustana-careers', 'Augustana · Career Services', 'c_bc6eea786d80e582f26cebeb5a63c014da70809f2c4a260829477afea88369e7', 'https://www.ualberta.ca/en/augustana/student-life/careerservices.html'],
    [campusWideSource, 'Augustana · Campus Events', 'ualberta.ca_00bl3a1vmeq2guk2ksao4dm64g', 'https://calendar.google.com/calendar/embed?src=ualberta.ca_00bl3a1vmeq2guk2ksao4dm64g%40group.calendar.google.com&ctz=America%2FEdmonton'],
  ].map(([source, name, id, website]) => ({ source, name, website, timeZone: 'America/Edmonton',
    provider: new IcsEventProvider(httpsCalendarLoader(`https://calendar.google.com/calendar/ical/${id}%40group.calendar.google.com/public/basic.ics`, maxBytes), feedOptions),
  }));
}
