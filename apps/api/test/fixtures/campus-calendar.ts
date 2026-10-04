import { EventCoverage } from '../../src/integrations/events/event-provider';
export const coverage: EventCoverage = { from: '2026-03-01', through: '2026-04-01', timeZone: 'America/Edmonton' };
export const calendar = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CampusFlow fixtures//EN\r\n${events.join('\r\n')}\r\nEND:VCALENDAR`;
export const vevent = (fields = '', uid = 'lecture') => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Lecture\r\n${fields}\r\nEND:VEVENT`;
