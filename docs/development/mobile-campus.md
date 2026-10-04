# Campus saved controls and reminders

This slice supports ToR 11/13 and account isolation in ToR 19. Campus reads
normalized events through the existing cached API query. Saving, removing a save,
plan selection and explicit reminders remain account-owned actions; provider
event records are preserved. Reads display event times in the account timezone.

Saved events offer Set/Edit reminder using the shared task/goal timed editor.
The request sends only reminder configuration to PATCH /events/:id/saved, so it
preserves plan inclusion and external event timing. It sets one chosen future
instant; expiry and ambiguous/missing DST input require correction. Removal sends
an explicit null. Keeping the current instant closes without intent churn.
Date-only configuration needs an explicit delivery time. Failed drafts survive
for retry and pending saves prevent repeat taps/dismissal. Account notification
permission, category preferences and quiet hours apply through the existing root
device service.

GET /events now returns the reader's savedReminder value through a shared Zod
boundary, while Event and SavedEvent remain distinct persisted entities. Query
validation retains this metadata in account-scoped SQLite. Malformed values are
rejected. Older cache rows lacking the field remain readable with reminder details
marked unavailable; editing waits for refreshed, known configuration. Missing
saved status/plan inclusion also disable corresponding writes. Missing cache is
unavailable rather than an invented empty list. Cached filtering does not mutate
configuration. Cards display server-refreshed reminder values.

Campus reports failed save/plan/unsave actions and supports explicit retry.
A guard prevents repeated writes and disables reminder entry during a pending
change. Refresh events obtains updated configuration through the existing query.
Unsave cancels intent through the transactional API lifecycle.

## Validation and remaining work

`event-reminder.test.tsx` covers request preservation, save eligibility, retained
precision, time input, retry/pending guards, refreshed cards, legacy metadata,
filtering and saved actions. `queries.test.tsx` covers cached metadata, malformed
input and account switches. Contract cases distinguish missing metadata from
explicit null. `saved-event-reminders.spec.ts` verifies reader-specific API values.
Run root checks and Expo web export. Native delivery acceptance and a verified
live campus feed remain external gates; fixtures are not live campus data.

Task/goal snooze now postpones active explicit reminder intent while preserving
configuration and leaving completed/paused targets inactive. Weekly goal progress
and optional task duration editing are implemented. Today now shows deadline/
schedule details. Next, verify saved-event reminder delivery and account cleanup
through native device acceptance.
