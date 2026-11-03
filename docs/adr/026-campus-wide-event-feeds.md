# ADR 026 — Campus-wide and career event feeds

Status: Accepted

Date: 2026-11-02

Extends [ADR 008](008-public-campus-calendar-refresh.md), which stays in force
except where this record changes its limits.

## Context

Augustana publishes two more public Google calendars: Campus Events, which feeds
the MyUAlberta app, and Career Services, which feeds uab.ca/augcs. Both were
retrieved on 2026-11-02.

| Feed | Size | VEVENTs | In a 61-day window | Download |
| --- | --- | --- | --- | --- |
| Career Services | 278 KB | 209 | 10 | under 4 s |
| Campus Events | 3.8 MB | 5,893 | 91 | about 9 s |

The existing import rejected both. Campus Events exceeds the 1 MiB, 2,000-event
and 5 s limits. Both use MONTHLY or YEARLY rules, and Campus Events holds 2020
to 2022 series with a date-only UNTIL on a timed start. All-or-nothing parsing
means one such entry, however old, hides the whole calendar. Campus Events also
repeats listings from the other feeds: 9 of its 91 upcoming events match another
feed's title and start.

## Decision

- Add `campus:augustana-careers` and `campus:augustana-events` to the reviewed
  catalog under the existing `CAMPUS_CALENDARS=augustana` setting.
- Reviewed feeds accept up to 8 MiB and 10,000 components, with a 20 s timeout.
  The 2,000 output event limit and the 20,000 step budget don't change.
- Reviewed feeds ignore series that ended more than 30 days before coverage. The
  check reads raw values, so old entries cost nothing and can't invalidate the
  batch. A series with a moved occurrence inside the window, an open end, COUNT
  or RDATE is still read. Parsing remains all-or-nothing for what's left.
- Reviewed feeds support MONTHLY (numbered BYDAY or the start's day of the month)
  and YEARLY (the start's date), with INTERVAL, COUNT and UNTIL. Dates a month or
  year lacks are skipped, per RFC 5545. Other forms still invalidate the batch.
- Series without COUNT start expanding just before coverage instead of at
  DTSTART, as student uploads already do. Parsing yields to the event loop between
  series, so a large feed doesn't hold up API requests.
- The sync transaction timeout rises to 60 s. It holds the fetch, and a rollback
  forgets the attempt, which would refetch the feed every minute.
- `GET /events` hides an unsaved Campus Events listing when another source has the
  same title and start. Each feed still stores its own rows, so a feed outage
  can't remove another feed's listing. A saved copy always stays visible.
- Student `.ics` uploads don't use these options and behave as before.

## Consequences

An hourly refresh of all four feeds takes about 10 s, with the longest event-loop
stall about 450 ms (the iCalendar parse). No migration or configuration change is
needed; the next deployment starts importing the new feeds.

Campus Events is edited by many people, so a new unsupported entry inside the
window makes that feed go stale until the provider is extended. The app reports
this as delayed and the API logs a warning. The other feeds aren't affected.

An event moved more than 30 days into the past no longer updates its existing row.
It's treated as missing: unsaved rows are removed and saved rows keep their last
known details, following ADR 008.

Duplicates are matched exactly. A listing retitled between calendars still appears
twice. Campus Events also lists staff meetings such as Faculty Council, and these
appear in Campus as they do in MyUAlberta.
