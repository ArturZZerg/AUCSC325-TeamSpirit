# Data sources

Each source was checked before features were built on it. All test requests
below were made from the production server (95.217.239.38) on 2026-10-18.

| Source | Endpoint | Auth | Result | Used for |
| --- | --- | --- | --- | --- |
| Augustana Recreation calendar | `https://calendar.google.com/calendar/ical/c_0051f706…4c0b%40group.calendar.google.com/public/basic.ics` | None (public Google Calendar) | 200 `text/calendar`, 5.4 KB, 12 VEVENTs | Campus events |
| Augustana Thursday Night Breakout | `https://calendar.google.com/calendar/ical/c_e0e496be…f220%40group.calendar.google.com/public/basic.ics` | None | 200 `text/calendar`, 6.1 KB, 7 VEVENTs | Campus events |
| Canvas LMS | Institution Canvas REST/OAuth | OAuth developer key | Not available: institutional approval unverified | Fixtures only; production disabled |
| Open-Meteo (Camrose) | `https://api.open-meteo.com/v1/forecast?latitude=53.01&longitude=-112.82&current=temperature_2m` | None (free, non-commercial, CC BY 4.0) | 200 | Not used; candidate only |

Full calendar IDs live in `apps/api/src/integrations/events/campus-feeds.ts`.
They were found linked from the public
[Campus Rec programming page](https://www.ualberta.ca/en/augustana/student-life/campus-recreation/campus-rec-programming.html).

## Rules and risks

- **Calendars:** public, linked by the university. Imported hourly with failure
  preservation (ADR 008). Google doesn't publish a rate limit for public ICS;
  the hourly cadence is well within normal client polling. Risk: the university
  can rename or delete a calendar at any time. The app then shows stale coverage
  honestly.
- **No scraping:** `ualberta.ca/robots.txt` returns 403 to the server. We don't
  scrape university pages. Course catalogue, class schedules (Bear Tracks) and
  the academic calendar sit behind login or have no verified public feed, so the
  student enters classes and courses manually.
- **No university credentials** are collected or stored, ever.
- **Not available / skipped:** dining (no verified feed), transit (Camrose has
  no public transit API), maps (would need U of A branding/data rights).
