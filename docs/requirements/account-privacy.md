# Account and privacy centre

Status: implemented after workload inbox PR #59; hosted and native acceptance
remain release gates.

Give students control of their account from Settings: export a copy of saved
information and initiate whole-account deletion without contacting support.
Keep the existing NestJS/PostgreSQL ownership, mobile device/cache boundaries
and separate entities. This adds an identity workflow, not a generic data service.

## Export

An authenticated export covers server-saved profile, tasks and completion history,
coursework/courses, classes, preparation plans, recorded focus, routines/history,
wellness, saved events, private events, reminders and notification preferences.
Include a version and capture time. Use explicit DTO fields and consistent
transactional reads; omit passwords, sessions, provider credentials/OAuth state,
retry hashes and internal lease material. Public campus events appear only when
associated with the account's saved events. Unsaved device focus drafts are
outside the server export, and the interface must say so.

The response is private and must not be stored in shared caches. The student
reviews coverage and explicitly chooses download/share. Keep export state and
temporary files account-scoped, guard results after account changes, and expose
failures without claiming a partial export is complete. Use existing platform
capabilities where they support a usable JSON file; justify any added dependency
with the native file/share requirement.

## Whole-account deletion

Show exactly what deletion removes and that exported copies remain under the
student's control. Require the current password and a clear final confirmation.
Retain the draft after a rejected password or network failure; block duplicate
saves and dismissal during a request. An incorrect password must not expire an
otherwise valid session. Throttle authenticated password challenges.

Delete all account-owned records and sessions atomically. Explicitly remove
private Event records scoped to this user, since the existing string scope has
no User FK. Retain public events and every other user's records. Coordinate with
private import transactions: an in-flight or late import must not recreate
deleted records. Verify rollback leaves the account intact. Never remove actual
user accounts during development; destructive integration tests use disposable,
uniquely named accounts only.

Only an acknowledged deletion shows success. Hide account state immediately
after acknowledgment, cancel queries, clear this device's stored session/cache,
focus recovery, export files and scheduled reminders. Attempt all cleanup steps
even if one fails and offer a meaningful retry. A lost acknowledgment remains
uncertain; a rejected/expired session is not proof that deletion succeeded.
Other offline devices lose API access immediately and clear local data when they
next contact the backend; do not promise instant remote device erasure.

## Web self-service and release evidence

Provide a functional account/deletion route usable outside the mobile app. The
current session store calls native SecureStore unconditionally; its web module
does not provide those methods. Implement a deliberate web session adapter and
verify real sign-in, rather than relying on temporary QA authentication. Avoid
persisting browser bearer credentials for the self-service flow.

Verify input contracts, authentication, wrong-password/pending/failure behavior,
full data-graph export and deletion, other-user/public-record preservation,
all-token revocation, private-import races, rollback and late-result account
guards. Run required checks, real API/cache browser QA and responsive inspection.
Browser QA may review the destructive confirmation; use disposable API tests
for deletion execution. Native file/share and cleanup need authorized device
acceptance. The production domain/email/provider, privacy/support URLs, real
backup retention and accurate store declarations remain separate release gates.

Store workflow references reviewed during release planning:
[Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
and [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111).

## Implementation and acceptance

Settings opens `/account`. Unauthenticated web visitors sign in through
`/auth?next=account` and return to the account workspace; arbitrary continuation
URLs are ignored. Web bearer sessions remain in memory and reload requires
sign-in. Native sessions retain SecureStore. The web adapter downloads JSON;
native uses SDK-compatible Expo FileSystem and Sharing for a temporary file in
an account-specific cache directory. Temporary copies are removed after sharing
or account cleanup. Copies the student saves elsewhere are their responsibility.
The shared destructive-button background uses a darker warm red for 5.70:1
white-text contrast; controls retain the existing 46px minimum touch target.

`GET /me/export` returns format `campusflow-account`, version 1, with a database
transaction capture time and Repeatable Read consistency. Each database select
whitelists public fields. Plans retain academic links and their original deadline;
tasks retain plan ordering. No collection is silently truncated.

`DELETE /me` validates `{ currentPassword, confirmation: 'DELETE' }`, locks the
current User, challenges the password, removes private events and deletes User
with cascading dependents in one transaction. Private imports hold an owner key
lock and reject vanished owners before provider fetching. Wrong passwords use
403 and preserve sessions. At most eight challenges per account per 15 minutes
are reserved before hashing, with an expiring, bounded map. This limit is per API
process; a distributed deployment needs a shared edge/identity rate limit.
Task/routine and saved-event edits acquire an account key lock before child locks
and reminder/completion inserts, avoiding a circular dependency with deletion.

Deletion success requires a validated acknowledgement. The client cancels reads,
guards every result by the captured token, hides the session, and attempts all
device cleanup steps even if one fails. An explicit retry appears on sign-in and
new login waits for outstanding cleanup. A failed cleanup cannot guarantee local
erasure; users must retry. This is logical account-cache removal, not a forensic
erasure or backup-retention claim. Native sharing and cleanup still require a
device acceptance run.

| Evidence | Tests / checks |
| --- | --- |
| Version, full coverage, explicit confirmation and secret rejection | `packages/contracts/__tests__/account.test.ts` |
| Full graph, another user/public events, all-token revocation, rollback, both import race orders and concurrent reminder edits | `apps/api/test/account-db.spec.ts` using uniquely named disposable accounts |
| Pending/dismissal, incorrect password, uncertain reply and delayed account results | `apps/mobile/__tests__/account.test.tsx` |
| Safe web sign-in continuation | `apps/mobile/__tests__/account-gate.test.tsx` |
| Temporary native files, unavailable/failed sharing and late-owner guards | `apps/mobile/__tests__/account-export.test.ts` |
| In-memory web session, actual JSON download adapter and URL cleanup | `apps/mobile/__tests__/account-web.test.ts` |
| Attempt-all cleanup and retry | `apps/mobile/__tests__/session.test.ts` |

Real API/PostgreSQL/browser QA verified ordinary sign-in, account continuation,
reload sign-out, coverage review, an actual validated JSON download, safe deletion
review/cancel and responsive controls at 320/390/1100px. Browser QA did not submit
permanent deletion; disposable API tests execute it. A local Android preview and
fresh web export establish build evidence, not native or production acceptance.
