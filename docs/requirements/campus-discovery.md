# Live campus discovery

Supports ToR 11/13: campus browsing, saving, daily-plan inclusion and reminders.
Uses the established Event/SavedEvent distinction and ADR 008.

Browse the next 7 or 30 calendar days, grouped into Today, Tomorrow and dated
sections in the account timezone. Search titles, categories and locations. Saved
keeps past and upcoming saved events, without inventing status for older caches.
Ongoing spanning events group under Today; shared day bounds handle DST.

Cards show timing, location, source and saved/plan state. Descriptions expand
on request; safe HTTP(S) organiser links open only after a tap. Saved actions
and reminders retain their authenticated lifecycle and failed-write retry.
Session changes discard search and private drafts.

Calendar sources lists reviewed names, successful refresh times, current/delayed/
unavailable status and organiser websites. Cached success ages out at 90 minutes
and cannot imply coverage outside a complete import. Refresh events reads the
backend's latest persisted listings/status; sources update hourly, with 15-minute
retries following failure. Device cache, network failure, missing metadata and
successful empty ranges are distinct. Saved disappeared events retain last known
details; students are told to check the organiser before attending.

Validation: week-start/interval/COUNT/UNTIL/DST cases; transactional ingestion,
replica throttle, failed-refresh preservation and authenticated source status;
contracts; mobile range/search/saved views, provenance, links, cached reads and
unchanged account/reminder behavior. Browser QA separately uses live public feeds
with local PostgreSQL/API/SQLite. Fixtures alone do not prove live availability.
