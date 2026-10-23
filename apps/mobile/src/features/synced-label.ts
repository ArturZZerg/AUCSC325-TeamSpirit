import { localDateAt } from '@campusflow/domain';

/**
 * "just now", "12 min ago", "today at 10:43 p.m.", "yesterday at 9:05 a.m." or
 * "Oct 18, 10:43 p.m." in the account time zone: how recent a sync is matters
 * more to a student than its exact second.
 */
export function syncedLabel(at: string, timeZone: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const clock = new Date(at).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' });
  const day = localDateAt(at, timeZone), today = localDateAt(new Date(now).toISOString(), timeZone);
  if (day === today) return `today at ${clock}`;
  const yesterday = localDateAt(new Date(now - 86_400_000).toISOString(), timeZone);
  if (day === yesterday) return `yesterday at ${clock}`;
  return `${new Date(at).toLocaleDateString([], { timeZone, month: 'short', day: 'numeric' })}, ${clock}`;
}
