# CampusFlow release evidence and remaining gates

This is a technical readiness record, not a claim that the current build is ready
for store submission.

| Area | Confirmed evidence | Required before production |
| --- | --- | --- |
| Daily workflow | Tasks, Today, planner, classes, preparation, focus/history/report, routines, wellness, campus discovery and workload inbox; automated behavior tests and real API/cache browser checks | Full acceptance script on authorized Android and iOS devices, including keyboard, accessibility, lifecycle and offline cold start |
| Daily capture | Today opens the existing editor with the displayed date-only schedule and separate deadline; 11 new behavior/session cases, signed emulator create/cancel/offline checks and independent task/Today API proof | Broader physical/older Android and iOS acceptance; see the [capture record](../requirements/today-task-capture.md) |
| Day-end review | Merged PR #85 at `692fb3e` connects recorded progress, saved study time, fresh explicit tomorrow scheduling and the journal; full native `38631725799` proves real-API Cancel/Save and storage checks. Integrated main `b132eb8` also passes independently validated native `38660153729`, including retained deadline, 25-minute focus history, all four storage checks and cleanup | Broader physical/older-device checks and hosted production operation remain open; prior Android UI evidence uses a synthetic fixture |
| Coursework edits | Merged #102 preserves untouched fields with sparse PATCHes. Source `0b238fc` passes database-backed CI and signed Android/NestJS/PostgreSQL failed-refresh/reopen, no-op, disconnected draft and explicit retry checks; mobile/browser cases cover concurrent fields and date modes. Tree-identical application source `b5b2d98` passes the full iOS core session/cache/day-review gate | Actual iOS coursework-editor interactions and broader physical/older native editing; explicit same-field edits retain existing last-write-wins behavior |
| Morning overview | Source `0b238fc` signed emulator proves native permission/opt-in, seven unique alarms, cold offline restoration, background offline posting, warm tap from Settings to cached Today, repeat-refresh deduplication and opt-out/in cancellation/restoration; [observed evidence](../requirements/android-morning-overview-2026-10-14.md) | Physical/older Android, reboot/Doze/battery states, terminated-process overview taps and iOS delivery; the observed 9.714-second inexact delay is scoped to this run |
| Account privacy | Password-confirmed whole-account deletion, complete versioned export, private-import race protection, attempt-all cleanup/retry, ordinary web sign-in and actual JSON download verified; isolated signed Android emulator opens/cancels the real JSON share chooser and confirms approved disposable-account deletion, revoked session and unchanged separate-owner export; ADR 011 adds owned shared password admission with rollback/erasure protection | Physical native share/cleanup acceptance, hosted HTTPS `/account` resource, declared backup/log retention and deployed abuse monitoring |
| Account recovery | Request/reset, encrypted durable mail, shared quotas, single-use/expiry/rollback and sign-in/reset session races verified with disposable PostgreSQL; native recovery UI states and narrow/wide browser request layout verified under ADR 009 | Approved SMTP sender/provider and real delivery, deployed trusted proxy/source policy, signed-device acceptance |
| Public signup | ADR 010 adds password-and-code mailbox verification, private purpose/credential-bound tokens, public session gating, explicit preview/verified/closed modes and native verification forms; ADR 011 adds mail-independent shared auth limits and native recovery from confirmed session rejection while preserving offline reads | Approved real mail delivery, deployed auth key/source policy, signed-device acceptance and abuse/capacity monitoring |
| Backend hosting | NestJS/PostgreSQL, bounded read-only schema/migration readiness, production configuration validation, actual local smoke and snapshot-consistent restore rehearsal; CI also restores its disposable DB | Authorized production project/secrets, real migration/backup/restore policy and host rehearsal, TLS, health monitoring, capacity and availability checks |
| Dependencies | Reviewed compatible patches, effective scoped Prisma CLI overrides, clean install and real CLI/app/build/smoke/restore verification; both audit reports have zero critical entries | Five unresolved leaf advisories and their actual runtime/bundle paths need supported upstream fixes or explicit reviewed release disposition; see the dependency evidence record |
| Canvas | Normalized fixture integration and idempotency tests; production OAuth is disabled | Institution-approved key/scopes/callback, protected token storage and authorized live sync/revocation test |
| Public campus events | Reviewed Augustana calendars, persisted feed coverage, replica-safe imports and failure preservation | Intended campus approval/configuration and observed successful imports on the deployed API |
| Notifications | Server intent, local reconciliation and behavioral tests; signed API 36 emulator obtains real permission, restores one alarm after offline cold startup and posts its exact reminder while backgrounded/disconnected | Physical latest-build edit/delete/reschedule, quiet hours and duplicate-prevention acceptance; offline/other-device and Android inexact-delivery limitations accurately disclosed |
| Actionable reminders | Searchable account-owned center, existing subject editors, validated root tap handling and one-time schedule upgrade; current signed emulator proves real warm and terminated-process API-disconnected taps, ordinary-launch non-replay, invalid/stale-link recovery and narrow/large-text layout | Physical/older Android and iOS notification-tap/session/cache acceptance; this remains saved intent, not a delivery history. See the [native evidence](../requirements/android-reminder-center-2026-10-12.md) |
| Mobile builds | Separate locally signed ARM phone/x86 emulator previews, signature and actual architecture/permission gates; no known synthetic QA credentials in package; new x86 build installs, signs in, reads cached Today offline, opens sharing and passes 13 workspace geometry checks | Production signing/identifiers, store builds, hosted backend connectivity and physical-device acceptance of latest session/cache/share/reminders; older Android and iOS build/signing on supported host |
| Web artifacts | Reproduced Metro environment-cache issue; build now clears cache; fresh referenced entry and packaged bundles inspected | Fresh deployment output with authorized HTTPS API/domain; validate actual hosted assets and avoid publishing old generated bundles |
| iOS simulator | Accepted coursework source `b5b2d98` passes `38680864819`: independently verified seven public groups, both checked native login/offline-recovery proofs, four API/session/cache/logout checks, native day review, six completed flow timelines and cleanup. Merged main `86bc966` has the same tree; its separate native run remains tracked. Earlier combined-MVP/main acceptance records remain historical | The current Xcode/UUID dependency branch needs its own native build/acceptance. Coursework-editor, focus/reminders/share, older/physical iOS and store signing remain open. See the [gate](../requirements/ios-simulator-preview.md) |
| Privacy/support/store | Technical data ownership/lifecycle and public offline Help are documented; searchable workflow/data answers, protected account continuation and configurable validated policy/support links; signed emulator exercises public entry/password clearing, search/accordion/reset | Owner-approved public privacy/support URLs, real backup/log retention and accurate Apple/Google data declarations; physical Help and configured native-browser acceptance, store metadata/review account |

The 2026-10-14 accepted storage evidence is native run
[38603642902, attempt 2](https://github.com/ArturZZerg/AUCSC325-TeamSpirit/actions/runs/38603642902).
The downloaded `storage.json` is independently validated against exact source
`c3c25638596df891c1a5dfe6e757b603dd3f0567`, with successful owned-process cleanup.
PR #83 merged as `c08a0987222c3940bc59cd187f03e0e9e47aadea`. Main's standard
run `38612589071` passes, but native `38612589080` fails the first warm Help
assertion. Recovery `71e8082` / `38613496910` and day-review `9df62cc` /
`38615841433` fail that same earlier public assertion. These failures are not
accepted as passes based on a later screenshot, nor attributed to an application
routing defect without evidence. These are historical attempts: PRs #84 and
#85 subsequently merged as `70bd635` and `5fd8101` respectively. The complete
day-review native run `38631725799` at `692fb3e` passes; downloaded public and
storage proofs independently validate all seven public/recovery groups, native
Cancel/Save with deadline preservation, 1,500 saved study seconds, four original
storage checks and cleanup. Recovery `bf804d5` and later exact-main failures
retain their failed status and do not acquire acceptance from those other runs.

[PR #86](https://github.com/ArturZZerg/AUCSC325-TeamSpirit/pull/86) is merged as
`7b983db`. It replaces the retired comparison with a complete public XCTest gate
against each current build, retaining the private Maestro/API checks. Native
`38631465541` at reviewed head `846b105` passes and its downloaded public and
four-check storage/cleanup proofs independently validate. The later exact-main
run `38635693551` passes public navigation but fails the first Today assertion
with the known system `Not Now` prompt still visible. Its cleanup passes. The
login flow must recognize that prompt before requiring the obscured Today tree,
dismiss it conditionally, and still prove Today and every API/cache/logout check.
PR #101's correction subsequently passed full native `38653005706` at `a2a22e7`.
The complete feature stack merged via #100 after standard and full native
acceptance at `7ac3d9e`. Exact main `b132eb8` then passed standard `38660153556`
and full native `38660153729`; its downloaded public/storage/timeline artifacts
independently validate. All fourteen PR heads were incorporated and resolved.
Neither cancelled jobs nor historical passes establish future source results.

On 2026-10-12 the owner authorized the existing server for initial hosting and
offered an Android device. Read-only discovery verifies the existing server,
its valid HTTPS and other running applications. The owner subsequently chose
to keep source local; no CampusFlow source, service, database or HTTPS route is
deployed there. ADR 013 and the [server beta runbook](server-beta.md) document
prepared containers and loopback source quotas. Both local image targets build;
all twelve migrations apply, fifteen authenticated/anonymous HTTP checks pass,
and the local container database restores 23 tables/23 synthetic records with
source preservation. The unlocked Pixel accepts the signed preview; current
device testing found a stale API bundle, addressed by regenerating the bundle
and partitioning Metro transforms by API. Actual native login/Today, task creation
and revisioned journal editing reach the local production container/PostgreSQL.
Disconnected cold Today/journal reads restore with saved/stale messaging. The
standalone inset fix builds and its hardware regression detects the old journal's
bar overlap, but new-build geometry awaits device reconnection. See the
[native acceptance report](../requirements/android-native-acceptance-2026-10-12.md).
Hosted deployment, backup
policy and monitoring remain gates. No email
provider is approved yet; public signup remains closed and mail disabled until
real delivery is verified. Eventual Supabase hosting remains the accepted baseline.

See the [release operations runbook](release-operations.md) for health, read-only
smoke and guarded restore commands. The latest wellness-journal restore covers 23 tables
and 199 synthetic records, including a revision-2 journal entry and owned authentication quotas, with matching
content, constraints/indexes and readiness. The earlier verification restore also
covered a live private verification token. The latest rehearsal
preserves the source and removes only its generated disposable database. This
does not establish production backup retention, RPO/RTO or availability.

The [dependency safety record](dependency-safety.md) distinguishes tool-only
consumers from the bundled Router decoder and records remaining upstream risks.
Audit totals include affected parent packages; zero critical entries does not
mean the remaining dependency graph is clean or that the release is accepted.
The actual API container also has a filesystem packaging gate: corrected pruning
reduces installed packages from 438 to 106, removes observed test/CLI tools and
all five currently tracked leaf packages, and retains working generated Prisma
queries. Sixteen authenticated/anonymous HTTP checks and a 23-table/30-record
isolated restore pass. This is API artifact evidence; mobile/build advisories,
operating-system packages and production-host acceptance remain separate gates.
Eight installed-Router parser/serializer regressions cover ordinary and bounded
malformed links with a decoder invocation canary. They do not remove the bundled
decoder or establish mounted-app/hardware incoming-link acceptance.

The [Android permission policy](../requirements/android-permissions.md) removes
unused overlay, legacy shared-storage and biometric capabilities through Expo
configuration and checks the actual assembled APK before publishing a preview.
It retains current network/reminder/SDK support and rejects unreviewed additions
or lost core capabilities. Permission names alone do not establish SDK data
collection, native compatibility or accurate store disclosures.

The owner later asked to continue without the Pixel. A separate project-owned
API 36 emulator now provides current signed native evidence; the existing AVD
configuration remains unchanged and no phone data/settings are operated on.
The [emulator acceptance report](../requirements/android-emulator-acceptance-2026-10-12.md)
records exact artifacts, native/API/cache/share/layout/reminder observations and
remaining hardware/iOS gates. An ARM APK's successful installation on an x86
emulator was followed by native-library failure; explicit x86 builds and actual
APK architecture checks now avoid substituting installation for working startup.

Account privacy tests cover a disposable user's full record graph,
another user's unchanged records, public event preservation, all-token revocation,
incorrect password and rollback. An in-flight private import must not recreate
removed events. Export uses explicit public DTO fields and excludes credential,
session, provider-token or request-hash material. Describe server-saved export
coverage, with guarded late responses/share actions after account switches.

On deletion acknowledgment, hide the account immediately and clear this device's
stored session, account cache, focus recovery and scheduled reminders. Attempt all
cleanup operations even if one fails; show a meaningful retry state. Do not claim
success on a lost network acknowledgment, promise remote erasure of offline-device
caches, or invent a production backup retention period.

Store references reviewed earlier in this conversation:
- https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
- https://support.google.com/googleplay/android-developer/answer/13327111
