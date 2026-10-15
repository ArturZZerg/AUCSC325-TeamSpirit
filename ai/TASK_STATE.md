# Current development state

Updated: 2026-10-14

### Current Xcode/UUID release repair

Branch `codex/xcode-uuid-release` starts from merged main `86bc966`. The existing
Xcode 3.0.1 generator now has a narrow UUID 11.1.1 override and an explicit root
dev-tool declaration, needed for npm to honor it across workspaces. Only the
root/UUID lock entries change. App/API/shared runtime, schemas, Expo SDK and all
other dependency versions remain unchanged. A one-line API Jest configuration
change replaces its mixed-separator absolute Windows glob with a portable
project-root pattern; all 657 cases are discovered (400 local passes, 257 DB
cases reserved for PostgreSQL-backed CI).

Normal `npm ci` passes; Expo config plugins/Xcode actually resolve UUID 11.1.1.
Before repair the three new cases produce two normal passes and one bounds
failure. All eight dependency compatibility cases then pass, including 100
project-reference write/reparse checks and unchanged buffers after rejected
v3/v5/v6 writes. Actual full/omit-dev audit affected entries fall 60 → 53 and
56 → 49, with UUID absent and four leaf advisories still tracked. Prisma client
generation passes with trusted Windows system certificates. The normal root
check then passes lint/types, builds and 2,033 local tests, with all 257 database
cases explicitly skipped until CI. A fresh web export's referenced entry contains
the selected QA API origin. Android prebuild/bundle/assemble passes in 5m 9s,
with actual x86_64/25-permission gates and v2 signature verification. Its APK
matches the prior application's bytes, as expected for a tooling repair. No
device operation is performed. Current-branch native iOS and database-backed
standard/production-container/restore CI remain mandatory before merge.

PR #102 merged as `86bc966` after exact-head `b5b2d98` standard CI passed 2,287
cases and native `38680864819` passed. Downloaded evidence independently verifies
all seven public groups, both private native proofs, all four storage checks,
day-review persistence, six completed flow timelines and cleanup. Main has the
same tree as that accepted source; exact-main standard `38683801630` passes,
while native `38683801635` remains independently tracked. Earlier failed native
attempts below retain their failed outcomes. Original production gates and
source-local/no-physical-device/no-new-account-delete constraints remain active.

### Coursework edit preservation — merged #102 validation history

The accepted outcome is recorded above. The chronology below preserves earlier
failed and pending states; those are not the current status of merged #102.

Source `0b238fc` passes both standard CI runs with 2,278 cases, including the
new PostgreSQL persistence/reminder test. The actual signed x86 Android build
also passes the failed-refresh/reopen workflow, no-op Save, disconnected draft
and explicit retry with independent real API readback. Its morning overview
additionally posts while backgrounded/offline, opens cached Today from Settings,
deduplicates repeated refreshes and cancels/restores pending alarms on opt-out/in;
see [native evidence](../docs/requirements/android-morning-overview-2026-10-14.md).

Both iOS attempts in run `38665540567` at `0b238fc` pass all seven public groups
but fail the first private post-login wait before accepted task/storage checks.
Cleanup passes; the existing label summary is all false and does not establish
cause. No third unchanged retry is accepted. The follow-up settles keyboard/focus
before password input and submission, adds fixed auth-control/error booleans,
bounded hierarchy shape and owned aggregate session/task counts on failure.
Passing proof rejects failure-only diagnostics. All original API, Secure Store,
SQLite, day-review and logout assertions remain mandatory. Local 43 native proof/
privacy cases and lint pass; complete new-head CI/native acceptance remains open.
No app/API runtime file or dependency changes in that follow-up.

Run `38672886360` at `3e1dc58` also fails the first post-login assertion;
standard CI passes. Its owned counts are one active session (registration)
and zero tasks, so native sign-in is not established. The populated hierarchy
still contains no recognized exact labels. This evidence does not identify an
application authentication defect. No unchanged retry is dispatched.

The next harness change uses a private XCTest host, following the already
accepted public XCTest approach, for ordinary native sign-in. Each email and
visible-password character must reach the real controlled input exactly once;
native Next/Go keys, password hiding and Today are required. The API must then
show two sessions before the unchanged Maestro task capture, day review, offline
restoration and logout checks. Source/device/run/attempt-matched named-test proof
is mandatory. Credentials, generated source and all private XCTest artifacts
stay in `.local`; only fixed stages, booleans and bounded static-source failure
line numbers can be published. Current-head full CI/native acceptance remains
required before merging #102. App/API/shared runtime and dependencies are unchanged.

Actual run `38677989005` at `e2a064f` passes all seven public groups, checked
ordinary XCTest login, two real API sessions, native task capture and day-review
Cancel/Save with the retained deadline and 1,500 study seconds. Its offline flow
also restores Today and the owned cached task, then fails the incoming unavailable
link assertion. Overall storage acceptance remains failed; cleanup passes. Both
standard runs pass 2,285 cases and the 24-table/13-record restore rehearsal.

The next follow-up retains Maestro's cold-read assertions and moves the incoming
unavailable-link/Back-to-Today/cached-task assertions to a separately selected
private XCTest, using the accepted public system-link input approach. The API
port is verified absent before and after; the same native PID must survive the
link and recovery. Passing storage proof requires both named native tests from
the same source/device/run/attempt and all original storage/day-review/logout
checks. The final signed-out flow's email variable is retained. No unchanged
retry or application/runtime/dependency change is made. Local 49 proof/privacy
cases pass; complete new-head native acceptance remains mandatory.

The former full-payload coursework editor reproduced a data-loss sequence:
acknowledge a title save, fail list refetch, reopen the retained cached row, then
save a deadline and silently resend the old title. Sparse PATCH requests now
contain only changes from the opening baseline. The paired draft/baseline is
stable across refreshed props; no-op/reverted forms are disabled, and failed
writes retain their exact changed fields for retry. Creation remains complete.
Existing API ownership/manual-source checks and reminder reconciliation remain
unchanged; no endpoint, schema, dependency or offline mutation queue is added.
Edits to the same field still use the existing last-write-wins semantics.

The regression failed before the fix and passes afterward through the real
TanStack query/mutation lifecycle and a synthetic transport. All 1,206 mobile
cases in 101 suites, workspace lint/types and a fresh web export pass locally.
A PostgreSQL test additionally verifies saved field preservation, one updated
reminder and foreign-owner rejection; execution requires database-backed CI.
The synthetic browser acceptance passes the same failed-refresh/reopen flow:
exactly two observed PATCH bodies, first title only and then deadline only,
retaining the acknowledged title. No-op Save is disabled and the 320px editor
does not overflow. The four HTTP 503s are deliberately failed fixture list
reads; no application exception was observed. Final diff review is complete;
current-head CI and author review remain required before merging this slice.
The shared checkout and original native/device data are
untouched. Source remains local except for the authorized GitHub/CI workflow.

### Accepted combined MVP upgrade (#100)

The managed worktree integrates the existing feature stack through `360aa75`,
the latest auth UI `64ad435`, and login correction `a2a22e7`, preserving their
commit ancestry. PR #100 was reviewed and merged as the combined upgrade:
Today checklist/progress, grouped tasks, habit history, month calendar, launch
dark appearance, natural-language capture, campus cards, auth/back links, app
icons, opt-in morning overview, and focus/planner presentation. Its exact tested
source `7ac3d9e` is tree-identical to merged main `b132eb8`. All 14 then-open PR
heads are contained: three PRs are marked merged and eleven incorporated stack
PRs closed, retaining their branches and exact-head author review records.
Their older cancelled/failed native jobs are never described as passes.

Review corrections: calendar event failures no longer present empty days;
repeating completion uses owned, matching task revisions and covered snapshot
history, with unknown/malformed/stale history withheld. Quick-add keyboard submit
honours a disabled capture state; `next weekday` belongs to the following
Monday–Sunday week. Morning overview payloads require actual calendar dates,
and enabling with granted permission explicitly reconciles the saved preference.
All use existing queries, contracts and notification serialization; no new API,
database, dependency or offline write mechanism is added.

After those corrections, all 1,195 integrated mobile tests, 181 domain cases,
40 iOS tooling/privacy cases, workspace types and lint pass. The mobile command
exits successfully after a delayed-handle warning; no force-exit option is used.
A fresh web export points only at the synthetic loopback visual fixture.
Rendered light/dark and 320/390px checks pass with explicitly synthetic data.
Main standard `38660153556` and full native `38660153729` pass. Downloaded native
proof independently validates exact commit/run/attempt/device identity, seven
public groups, real-API Cancel/Save and all four storage/logout checks, six flow
timelines and cleanup. These accept the recorded source, not future edits or
production operation. The shared checkout remains untouched.

### Earlier open-PR review and native login correction

PRs #86, #84 and #85 are now merged; main is `18b1694` after the API
lock-wait regression correction (#94). Day-review source `692fb3e` has a complete
passing native run `38631725799`, independently checked against downloaded
public/process, real-API Cancel/Save, four storage checks and cleanup proofs.
This does not turn recovery's failed `bf804d5` attempts or main's failed native
runs into passes. The new feature stack #87–#100 and auth correction #101 remain
open and need review plus current integrated acceptance.

Main `7b983db` native run `38635693551` passes the public gate, then fails its
first Today assertion with the known system `Not Now` prompt still present.
The existing flow handles that prompt only after requiring Today, so an obscured
app tree cannot reach dismissal. The scoped correction first waits for either
Today or that exact prompt, uses the existing conditional dismissal, and still
requires Today before task capture. Every API, cache, logout, focus, Cancel/Save
and source-bound proof assertion remains mandatory. PR #101's keyboard Return
chaining is retained. No app, API, schema or dependency change is added here.

Work is isolated in the managed `open-pr-acceptance` worktree; the shared
checkout's separate UI work is preserved. All Maestro YAML parses, all 40 native
tooling/privacy cases and 10 auth-entry cases pass, including keyboard-submit
validation, pending-request deduplication and explicit registration. Lint,
generated schema validation and mobile TypeScript pass. The fresh worktree's
Prisma engine uses the Windows system CA store; TLS verification stays enabled.
Actual full current-source native execution remains required. Review
the latest feature heads and their combined behavior; cancelled or failed native
checks are not successful acceptance. Historical investigation below remains
dated evidence and is superseded by this current status where they differ.

### Current day-review parent integration

Day-review integrates recovery `bf804d5`, which contains full public-input parent
`846b105` (#86), including one-key/visible-prefix search verification after the
observed bulk-input mismatch. The feature's application code, native private Cancel/Save flows
and independent real-API task/focus assertions are byte-identical to `9df62cc`.
All parent public warm/search/Account/cold and mandatory warm/cold unavailable-link
checks remain, alongside the feature's deadline-preserving tomorrow schedule and
all original login/cache/logout cleanup checks. Local integrated iOS tooling
passes 40 cases, including replay/zero-test/process-stage rejection and unchanged
Cancel/Save API behavior. Root lint passes. No schema, dependencies or app behavior
changes are added during this integration; current standard CI and actual full
native execution remain required. Keep draft, review final source and merge
#86, #84, #85 with matched heads preserving ancestry, then verify main.

### Current open-PR completion task

The owner explicitly requests finishing open PRs. Recovery #84 at `71e8082`
and dependent day-review #85 at `9df62cc` have passing standard checks, but
their native runs `38613496910` and `38615841433` fail first warm public Help
before private recovery/day-review/storage checks. Keep both draft until the
required current-source native checks pass; finish them in dependency order.
Use a matched-head merge preserving the recovery ancestry needed by day-review.

Storage PR #83 is merged as `c08a0987222c3940bc59cd187f03e0e9e47aadea`. Its
tree exactly equals final uninstrumented source `c3c2563`, accepted by native
`38603642902` attempt 2 and independently validated source-bound `storage.json`
with all four real API/cache/logout/cold-signed-out checks and cleanup. Main's
standard check passes, but native `38612589080` fails first warm Help. This
distinction is now reflected in the production-readiness record.

The public XCTest comparison `35ba837` / `38623494563` passes its actual one-test
subset in 17.675 seconds with unchanged PID 7707 and unchanged installed/extracted
app bytes. Its separate baseline `38623494445` also finishes successfully before
retirement; no cancellation is issued. Downloaded `storage.json` independently
passes all four source-bound private checks and cleanup for `35ba837`. The older
baseline `38620875376` fails first Help at 19:24:28 UTC, with actual native URL
delivery at 19:24:30.943 in PID 30152. These mixed outcomes establish input-path
evidence, not a precise upstream root cause or a current feature acceptance.

PR #86 at `846b105` retires the fixed-artifact experiment and implements a complete
public XCTest gate against each current build, with private Maestro/API checks
unchanged. Earlier `4d0192e` / `38626385344` passes warm link/Back/in-app Help,
then its frame shows query `one` instead of requested `offline`. The corrected
test sends each key once with a visible-prefix assertion and verifies the full
query after Return, without retyping or retrying an action. Fresh native success
is required; the failed run is not accepted. The compiled test
context binds source/device/run/attempt, requires actual named-test success, and
rejects missing/reordered/duplicate stages and wrong warm/cold process transitions.

This recovery integration preserves all parent warm/search/Account/cold checks,
then requires warm unavailable-link recovery with ignored private parameters and
cold unavailable-link recovery to Help. Strict proof requires both new stages,
retains the cold Help PID for warm recovery and requires a third distinct PID for
terminated recovery. All original private offline recovery/retained-task and
API/cache/logout checks remain unchanged. Actual current-source native and
standard checks, author review and matched-head merges remain required. Keep
the stacked PR dependency order #86, #84, #85; preserve ancestry for later merges.

No physical-device operations, server source transfer, new account deletion or
dependency change is performed. The five advisory records are refreshed, with
no compatible repair or production-release disposition inferred. Historical
investigations below are retained and do not supersede this current state.

Current iOS correction: `50a2546`/`38503168076` passes three public JUnit flows,
native ordinary login/API capture and cold encrypted-session/SQLite restoration,
then is cancelled at the 40-minute workflow boundary during logout testing.
Recovery `7160802`/`38503469756` passes four public flows and owned offline recovery
but fails the bare Settings selector before sign-out; process cleanup passes.
Installed React Navigation's iOS label is `Settings, tab, 5 of 5`, and Maestro
matches the whole label. Cleanup now targets that exact tab once; fixed-label
booleans remain the only private hierarchy output. The full job budget is 60
minutes, with screen/API/cache/logout assertions preserved. Verified Maestro
2.11.0/flat-artifact compatibility is integrated from isolated `d3ec781` (2,132
standard CI cases pass; its separate native comparison remains live). Fresh
exact-head acceptance remains required; no logout or production readiness claim.

Prepared native-tool update: official Maestro 2.11.0 ZIP/version/test-help checks
pass locally with Java 17 and verified release SHA-256. Its upstream changes cover
stop/start timeouts and post-scroll tap positions relevant to observed failures;
no root cause or native success is inferred. Diagnostic compatibility accepts
legacy and flat command files while excluding private inputs/artifact metadata;
22 tooling/privacy tests and lint pass. The 2.6.1 remote runs at `50a2546` and
`7160802` remain live; do not replace them merely because observation is slow.
The reviewed update is isolated on `codex/ios-driver-211` for ordinary exact-source
native comparison, preserving both live PR attempts. It may be integrated only
after actual acceptance; no app/architecture or private-output scope changes.

Latest iOS observation: `854b846` standard checks pass; native `38500933706`
fails in the first request phase because the system Open dialog remains visible.
The trace records one correctly positioned tap despite unchanged-screen retry;
no URL delivery or second CLI follows. The split-session hypothesis is untested.
The helper now settles and conditionally re-taps that exact visible system dialog
once, still requiring dismissal. Original Help order, all storage requirements and
single application actions remain intact. Recovery `e787af9` standard checks pass
2,142 tests and actual Android emulator warm/cold/malformed/offline recovery,
cached-task preservation and 320px/150% native text pass. Display/data cleanup is
verified; no physical device or VPS transfer occurs. Its iOS request phase passes,
then first Help (681ms), Back/in-app Help/search/Account assertions pass. Immediate
cold Help opening after termination fails with OS timeout code 60 before recovery
or storage scenarios. The public navigation CLI now ends after required stopApp;
a separate non-reinstalling session opens/asserts cold Help without app launch,
reset or command retry. All three phases must pass. This positive first-link
result does not prove a root cause; native cold/storage acceptance remains pending.

Current iOS gate correction: `ab46128` passes standard PR/push checks
(`38472473844`, `38472473258`) but native run `38472473944` fails its original
first warm Help assertion before private storage testing. System URL delivery
arrives about six seconds after failure. Recovery PR #84 (`bf1aa34`) repeats this
earlier-flow failure (`38472721279`); its standard checks pass. A diagnostic splits
the original link request/OS confirmation and required Help observation into two
CLI sessions on the same installed app/UUID. The second disables driver reinstall;
there is no app relaunch/reset/intervening navigation or extra sleep. Both results
must pass before private testing. Observation-related delay remains a hypothesis,
not a confirmed cause. Task save, cold offline restoration and logout remain
unverified; neither PR may merge without fresh exact-head native success.

Reminder center and native notification taps: Settings exposes saved
reminder browsing/search, effective quiet-hour times and subject-specific existing
editors. Default taps wait for restored session/navigation, validate owned stable
identities and reject stale account/token responses; no arbitrary payload URL is
followed. API contracts, persistence and account-only sign-in continuation remain
unchanged. Integrated root checks and the updated native-tool suite pass 2,060
tests; fresh web, x86 and ARM previews pass. The current x86 APK proves actual
warm/cold API-disconnected notification taps, ordinary-launch non-replay, stale/
invalid link recovery, fourteen inset checks and 320px/150% text acceptance.
Temporary reminder/display changes are undone; both synthetic task/account and
the separate Pixel QA data are preserved. See [requirements](../docs/requirements/reminder-center.md)
and [native evidence](../docs/requirements/android-reminder-center-2026-10-12.md).
PR #79 passed author self-review and both exact-head CI runs, merged as
`ffba4dd9726aa7b8921e402abd95700c66ea6031`, and its exact-main CI passed.

Previous release task: discard invalid queued reminder taps before navigation
mounts. Four behavior regressions reproduce confirmed sign-out/different-owner/
changed-token replay across delayed navigation and verify future owned deliveries
remain usable. The adapter now rejects restored incompatible context immediately,
while valid cold-start taps still wait for navigation. All 1,087 mobile tests,
mobile types and root lint pass. PR #82 merged as
`f99ac8ab18984cb25b8c93957effcdb41b54aef9` after author self-review and exact-head
PR/push/native success (`38369172330`, `38369165671`, `38369172371`); standard
checks pass 2,116 tests. Exact-main standard check `38371477411` passes; native
`38371477582` fails the Back-to-sign-in assertion after its first Help link.
Its driver log targets an in-button point, but the final frame remains Help;
the precise cause is unproven. The new flow waits for Help animation settlement,
captures that first frame and gives Back a bounded visible-screen wait. It keeps
the original first-link order and required behavior. Actual acceptance remains
required. No API/schema/auth-continuation change is introduced.

Current release task: replace the unsigned iOS simulator build's missing Keychain
capability gap with Xcode-managed simulator entitlements and actual compiled-section
inspection. The first signed `751c960` gate inspects only the host signature and
rejects its empty dump; that alone does not prove simulator capability absence.
Manual signing in `9be7a3e`/`a61c0c6` puts iOS entitlements in the host signature.
After healthy boot, `a61c0c6` cannot launch (spawn error 162, no JavaScript). The
correction removes manual re-signing, supplies the private namespace as Expo/Xcode
input only for simulator builds, and checks every compiled Mach-O slice. Device
builds receive no simulator override; no Apple team/profile is invented.
Disposable real PostgreSQL/NestJS acceptance exercises ordinary sign-in, Today capture,
API-confirmed task state, API-disconnected cold encrypted session/SQLite restoration,
native logout revocation and cache removal. Private credentials/UI dumps remain on the
disposable runner; public diagnostics precede account creation. No app authentication
behavior, schema, server deployment or physical-device interaction changes. Local
artifact/harness tests pass twenty cases, 49 Today/editor/capture cases, root lint
and mobile types pass. Prior
head `9be7a3e` passes standard PR/push CI (`38375810030`, `38375803905`, 2,122 tests)
and actual native signature/entitlement/product verification. Its native run
`38375810149` reports failed simulator data migration, then cannot launch the app;
public navigation and private storage are unverified. The workflow now rejects that
actual boot-log failure even with a zero exit/Booted inventory, can replace only its
own fresh failed UUID once, and preflights native launch. Logout cold restoration now
requires an absent API, preventing 401 cleanup from masking a stale local credential.
`a61c0c6` standard PR/push checks pass (`38379422589`, `38379418278`), but native
`38379422576` proves healthy boot and rejects direct app launch. New exact-head
native/standard acceptance is required before merge.

`fea92e5` standard PR/push checks pass (`38452499240`, `38452490757`). Its native
`38452499305` verifies both compiled simulator slices, launches and passes the
original public flow (140 seconds, zero failures). Ordinary API login reaches Today;
capture then fails its New task assertion. Task persistence, cold offline restoration
and logout remain unverified. The revised flow settles navigation and targets the
actual capture Pressable by stable ID, retaining a single tap and bounded New task
assertion. Private diagnostic summaries publish only fixed label-presence booleans
and command/status/timing; raw private dumps remain excluded. New exact-head checks
remain required. The next unavailable-link screen/gate is isolated in `.local` and
passes 16 draft cases; it is not part of the active PR.

`b9a8377` passes standard PR/push checks (`38456972034`, `38456965578`). Native
`38456971969` needs its second fresh UUID after failed migration; healthy boot
and app launch pass. The first system Open tap targets the correct button, but
the final frame still shows `Open in CampusFlow?`, with no app incoming URL.
Private acceptance is skipped. A common confirmation subflow now waits for dialog
settlement and retries only the unchanged idempotent system Open gesture using
the documented Maestro option. Dialog dismissal is required within ten seconds;
original app routes and single Back/capture/save actions remain required. New
exact-head native/standard checks are pending. The isolated recovery draft also
type-checks against current generated routes, with the exact public allowlist intact.

At `019f64c`, standard PR/push runs (`38460730956`, `38460722234`) pass 2,130
tests. Native run `38460731027` passes build/capabilities/launch and public flow
(120 seconds, zero failures); private login reaches Today, but capture's ID is not
found before its tap. Its downloaded archive hash and selector presence match the
actual CI product. Capture now scrolls to that control before the single tap.
Failure diagnostics skip Maestro's default driver reinstall and publish only the
existing fixed-label booleans, including known password-dialog labels. A fresh
exact-head run must still prove native task save, cold offline restoration and
logout cleanup before PR #83 can merge. Local twenty tooling/privacy cases and
root lint pass; no application behavior, API, schema or deployment change is added.

`a85fa8e` passes both standard checks (`38468138308`, `38468131011`). Native
`38468138262` builds/launches and passes public navigation (131 seconds), then
fails capture scrolling. The preserved failure hierarchy reports exact `Not Now`
with app screen labels absent. This label is absent from CampusFlow source,
supporting a system prompt obstruction without establishing its full identity.
The flow now conditionally declines this observed prompt, requires disappearance
and Today again, then retains one capture/save tap and every storage requirement.
New native/standard exact-head acceptance remains required; do not merge yet.
The recovery feature is committed locally as `25443bf` on
`codex/native-link-recovery`: twelve new cases, complete available local checks,
fresh web export and reviewed 320px/150%-zoom/1280px browser layouts pass. Its
native scenarios and PR wait for this storage branch; no rejected deployment or
physical-device operation occurs. Local API checks skipped 256 DB-dependent cases.

PR #81's native iOS simulator gate merged as
`2c5fff3df80553313ebc005a0eeb3214c0d15339`. Standard CI
passes 2,112 tests. A diagnostic unsigned Release build and actual public
Help/search/account/cold-start flow pass on Xcode/iOS SDK 26.2; actual native
callback logs show proper forwarding. The first warm-link assertion had failed
in an earlier run. Temporary probes are now removed and the original first-link
order was restored for final-source acceptance, which passed at `79b9313` in
run `38366147179` (one public flow, zero failures, 104 seconds). Final archive
SHA-256: `B1E9A15522E23BAAE53590279F412A42593CE086F35A288245407D66FA5497C1`.
The flow uses a bounded 45-second wait after the first OS confirmation: the prior native
log delivered the URI after the assertion ended, and its later full frame shows
correct Help. Unsigned Keychain entitlement failures keep authenticated storage
acceptance open. Full simctl
images confirm public screen spacing; Maestro images omit system chrome. See
[the gate](../docs/requirements/ios-simulator-preview.md).
Merged main's unknown native paths still use SDK Unmatched Route and need a
clear recovery path. Production hosting/email, contact/operator details,
signing/privacy and physical acceptance remain pending; source stays local.

Next feature branch `codex/native-link-recovery` implements branded unavailable-link
recovery atop PR #83's `6c36838` corrected accessible-tab/driver/storage gate. Both prior
`ab46128` and feature `bf1aa34` native runs fail the original Help assertion before
new recovery/private scenarios, despite passing standard checks. PR #84 is draft;
fresh exact-head standard/native acceptance is required. `e787af9` subsequently
passes first Help/Back/search/Account before a cold-link OS timeout; fresh Android
warm/cold/malformed/offline and native 320px/150% text acceptance pass with data
preserved. `7160802` then passes all four iOS public flows, native API-confirmed
capture and owned cold offline recovery, but fails the bare Settings selector
before logout; process cleanup passes. Reviewed native warm/cold frames are
readable. The rebased feature retains all recovery assertions in required cold
phases; application sources match the exercised Android artifacts. The feature
uses fixed Today/sign-in/Help recovery actions after restoration, ignores incoming
path/query values, and permits only the exact generic `+not-found` public leaf.
Known private routes and Account continuation remain guarded. Twelve new behavior
cases pass, including seven mounted installed-Router cases; the targeted suite has
32 passing tests. Native flows append warm/cold generic recovery and require return
to the same cached task with the API absent. Full local checks and fresh web export
pass (256 API database cases skipped locally). Actual browser recovery/Help and
keyboard sign-in pass; reviewed 320px/150%-zoom/1280px frames show no horizontal
overflow. The task-owned browser/server are stopped. Native evidence, review and
acceptance remain pending. See
[requirements](../docs/requirements/native-link-recovery.md). No API/schema or
deployment change is introduced. Do not merge this feature ahead of PR #83.

Goal: extend the MVP with complete student workflows, preserving the accepted
architecture and five-tab navigation, through validated PR/review/merge cycles.
Release priority remains native Android/iOS first, confirmed by the user after
considering PWA delivery. Retain web for verification; PWA installation can follow
without changing the native release priority.

Completed:

- Recorded focus sessions and account-scoped history: PR #55 merged. ADR 006
  defines ownership, explicit saving, retry identity and retained task context.
- Weekly study report: PR #56 merged; derived time by day/task, total estimates for comparison,
  direct focus actions, validated cached coverage and honest unavailable states.
  No new dependency or persistence is added by the report.
- Focus device recovery: validated account-scoped checkpoints, explicit paused
  recovery, identical failed-save retries, Today recovery card and guarded cleanup
  on sign-out/fresh login. ADR 007 replaces the transient termination policy.
- Live campus discovery: verified public Augustana recreation and Thursday Night
  Breakout calendars, hourly backend imports, persisted successful coverage,
  replica-safe refresh throttling and failed-import preservation under ADR 008.
  Campus has 7/30-day and saved views, local date groups, location search,
  organiser details/links and source freshness that ages while open.

Validation: root lint/typecheck/test/build with disposable PostgreSQL; dedicated
API, timer, cache, report and interaction tests; production web export; real-API
browser checks at 320/390/1100px, including save/read, task targeting and failed
refresh preservation. Native phone interaction remains a separate acceptance gate.

Focus recovery validation: 391 API, 737 mobile, 87 contract, 173 domain and 3
Android build-script tests; root lint/typecheck/build and clean web export passed.
Browser checks used real SQLite/PostgreSQL at 320/390/1100px: restart restored
paused progress, Today linked to the exact block, resume excluded time away, and
a server-success/lost-response restart retry produced exactly one 44-second
history record. ADB listed no attached device; native process-kill is unverified.

Campus validation: 408 API, 751 mobile, 94 contract, 173 domain and 3 Android
build-script tests; root lint/typecheck/build and production web export passed.
Live source requests returned complete batches. PostgreSQL/API/SQLite browser QA
at 320/390/1100px verified real event save, plan inclusion, chosen reminder,
source provenance, search/range controls and preservation after API failure.
Focus recovery preview APK built and its signature verified; no ADB device attached.

Workload inbox: Today/planner entry points, actionable attention/unscheduled/
coursework/today/later groups, search, exact task focus/edit and targeted study
plans. Known archived/finished plans stay linked; uncertain reads withhold new
preparation creation. Existing editors retain pending/failure/retry behavior.
No new schema, service or dependency. See the workload requirements for tests.
Existing focus blocks retain their current task when another is requested; the
requested task stays visible and becomes an explicit choice after saving.

Workload validation: 408 API, 782 mobile, 94 contract, 173 domain and 3 Android
build-script tests passed with root lint/typecheck/build and production web export.
Real PostgreSQL/API/SQLite browser QA confirmed selected task rescheduling without
deadline changes, one reviewed plan with exactly three linked sessions, targeted
plan expansion and an explicit focus handoff preserving the previous block.
Saved workload survived API failure and refreshed after recovery. Responsive
checks at 320/390/1100px found no overflowing controls. Native acceptance is pending.
An account-switch regression also verifies that a delayed preparation save cannot
navigate the newly signed-in account after its private editor has unmounted.
Web builds now clear Metro's cache: artifact inspection reproduced a stale QA
API origin after an environment change. A fresh export and the final Android
bundle were checked for the selected preview origin and absence of QA credentials.

Account & privacy: Settings workspace with full server-saved export review and
JSON download/native file sharing, password-confirmed atomic account deletion,
all-session revocation, private-import owner locks and attempt-all local cleanup
with retry. Web sign-in uses memory-only storage and returns directly to the
account resource after real sign-in. Neither lost replies nor expired sessions
are treated as deletion confirmation. No schema migration or service was added;
Expo file/share modules satisfy the native JSON file requirement.

Account validation: full disposable-user graph export/deletion, another-user and
public-event preservation, wrong-password bounds, rollback and both private-import
race orders; mobile pending/failure/late-owner behavior, platform adapters and
cleanup retry. Real PostgreSQL/API/browser QA verified ordinary sign-in, safe
continuation, reload sign-out, an actual validated JSON download and deletion
review/cancel at 320/390/1100px. Permanent deletion was executed only by disposable
API tests. Native file/share and production-hosted self-service remain gates.
Final reviewed gates: 417 API, 802 mobile, 97 contract, 173 domain and 3 Android
build-script tests (1,492 total), lint/boundaries/types and builds. The review also
covered concurrent task/routine/saved-event reminder edits during deletion.
Destructive-button text now has 5.70:1 contrast on the existing shared primitive.
Fresh web/Android bundles exclude synthetic QA credentials and loopback QA origins.

Next recommended task: registration email verification for public onboarding,
with production mail disabled until the approved service is configured,
followed by hosted deployment and device acceptance. Keep each release gate
separate from local app, preview and CI evidence.

Release operations implemented: bounded read-only liveness/schema/migration
readiness, explicit production database/CORS/fixture configuration, graceful
shutdown, generated schema-manifest freshness gate, and GET-only release smoke
that validates identity/daily data and actual Expo entry/worker/WASM assets.
Guarded snapshot-consistent pg_dump/pg_restore compares every application table,
migration record, constraints and indexes; cleanup targets only its generated
disposable database. Source test database remains intact. CI restores its own
isolated service database using clients inside that same service container.

Local PostgreSQL 18.4 + official 18.6 clients verified 19 tables/163 records with
identical restored content/relationships and readiness; fresh loopback web smoke
passed health/CORS, synthetic identity/data and three actual referenced assets.
Root lint/boundaries/types/tests/build and fresh web export passed; final reviewed
tests/config changes also run through exact-commit CI before merge. These checks
do not establish hosted production backup policy/RPO/RTO, delivery, capacity,
native acceptance or signing. Next: implement account recovery with delivery
disabled until the owner chooses and verifies the production mail provider.

Dependency release repair: compatible Nest/Multer, shell-quote, source-map-js and
Handlebars patches, plus scoped Prisma configuration deepmerge/effect fixes.
The unchanged Prisma 6.19 CLI moves to root dev tooling so npm workspace links
cannot discard its overrides; schema/client/database modules remain in the API.
Clean installation, explicit generation/migration, 1,551 tests and complete root
checks passed. Fresh web/API smoke, 19-table/163-record source-preserving restore
and signed Android preview verification passed; no Android device is attached.
Full audit affected entries: 69 → 60; omit-dev: 64 → 56; both zero critical.
Five unresolved leaf advisories remain tracked with actual usage in
`docs/development/dependency-safety.md`; no forced SDK downgrade or suppression.
PR #62 merged after author self-review and both exact-head Linux CI checks passed.

Account recovery merged as PR #63 under ADR 009 after author self-review and
both exact-head CI checks passed for `13d4c33ea5aac7276fa236bf644cbb48a1d13aca`.
Main merge commit is `ea30b2f56cb4a5e77a6e598235c5d13ec1cfa33d`.
Request/reset UI and transactional credential/session lifecycle use private
encrypted PostgreSQL mail envelopes and shared rate buckets in the existing API.
Delivery stays disabled until the approved provider is configured; real sender
delivery and registration email verification remain public-onboarding gates.

Recovery foundation verified: shared strict input/acknowledgment contracts;
120-bit grouped codes and AES-GCM envelopes with message-ID binding; explicit
disabled/SMTP/TLS configuration; three private tables in migration 9 and updated
readiness manifest; atomic source/global/recipient quotas across instances; and
account-export exclusion plus linked/unbound mail/recipient quota erasure.
Full `npm run check` passes 1,614 tests (507 API, 802 mobile, 109 contracts,
173 domain, 3 Android script, 20 release/dependency). Real restore matches
22 tables/164 records, preserves the source and removes only its disposable target.
Recovery completion: private capability/request/reset endpoints, durable worker
with bounded encrypted retries and fenced leases, certificate-verified SMTP,
atomic salted password update/all-session revocation/code invalidation/notice,
and sign-in serialization on the User lock. Explicit UTC SQL fixes non-UTC
PostgreSQL session comparisons; Auckland/Denver evidence covers the regression.
Nodemailer 10.1.0 is the only new API dependency and supplies its own types.
Audit counts remain 60 full / 56 omit-dev affected entries with no critical
entries; no Nodemailer advisory was reported. Five prior leaf risks remain.

The native recovery screen reuses Field/Button and moss/sage tokens, preserves
only the supported account return, validates pasted codes and confirmed passwords,
retains failed drafts, blocks duplicate submissions/dismissal, uses a resend
cooldown and discards late replies after unmount/sign-in. Drafts stay in memory.
The retained sign-in screen clears its password before opening recovery.
Full root checks pass 1,676 tests (547 API, 824 mobile, 109 contracts, 173 domain,
3 Android script, 20 release/dependency). Browser request/acknowledgment and code
layout/validation pass at 320/390/1100px with 46px targets and no overflow.
Password-change completion is verified separately by disposable API/native
component tests; browser credential-change submission is not claimed.
21st catalog search requires authentication; automatic approval review rejected
21st review because of possible private source egress. Local review/checks and
browser evidence provide the UI verification instead. See the recovery runbook.

Final recovery acceptance: fresh web and Android exports passed, preview APK v2
signature verified, and native bundle origin/privacy scan passed. APK SHA-256 is
`26C72795DCEA2058CDF27A328A7B7DEAF4608C4473BEC14FA9B108D93CF263E6`.
ADB lists no attached device. Real loopback API/web smoke verifies health/CORS,
authorized daily reads and actual entry/worker/WASM assets with SQLite isolation.
The running API also completes a captured-delivery request/reset, rejects the old
token/password and reused code, and retains the synthetic owner's task. This
does not prove real SMTP or browser/native password-change submission.
Final PostgreSQL restore matches 22 tables/201 synthetic records, preserves the
source and removes only the generated disposable restore. Review fixes also
prove nonblocking cleanup and real Nest worker-drain-before-Prisma shutdown.

Email verification is implemented on `codex/email-verification`, under ADR 010.
Public signup/login with an unverified mailbox issues no access session.
Password-and-code proof is single-use, credential-bound and atomic; verification
revokes old preview sessions, then requires ordinary sign-in. Preview users are
not silently marked verified. Recovery/reset/delete, separate token purposes,
encrypted retry/fencing and private export behavior preserve student data.
Production defaults to closed signup; verified mode requires complete SMTP.
Native forms handle capabilities, verification-required results, resend limits,
failed drafts, pending controls, safe account return and late/owner changes.

Final root checks: 588 API, 855 mobile, 120 contract, 173 domain, 3 Android-script
and 20 release/dependency tests pass (1,759 total), with lint/types/build. A running
loopback API verifies actual captured-mail signup, password/code proof, replay and
cross-purpose rejection, ordinary login and owned task creation. Fresh Android
and web exports, v2 signature, chosen native origin/privacy and actual web asset/
SQLite/API smoke pass. Preview APK SHA-256:
`75B03DAEC7160B1F0287577C6EF0A6228FE3309C9D77B0C5579A7DC6F00CC6AE`.
Actual restore preserves 23 tables/194 synthetic records, including a live private
verification token, and removes only the generated disposable database.
Browser geometry/empty validation/account continuation passes at 320/390/1100px,
with 46px controls. Browser screenshot capture is unavailable; no visual image or
browser verification submission is claimed. ADB has no attached device. Real SMTP,
hosted production, native phone/iOS and store acceptance remain unverified.
PR #64 is merged after author self-review and both exact-head CI runs succeeded
(`38203462253`, `38203458166`, head `d2ab66ee9a6c8795b7155d0843fb5703eed1b05f`).
Main is `fa38abc1d484fe92c90be68dbc9d981819b76ee0`; production mail stays off.
Post-merge main CI `38203755144` also succeeds for that exact commit.

Account access lifecycle is implemented on `codex/account-access-lifecycle`
under ADR 011. Startup/foreground private access checks and still-current 401
handling return to ordinary sign-in through attempt-all cleanup/retry. Offline,
timeout, unavailable/malformed reads and obsolete owner/token replies preserve
the appropriate session/cache. Production requires independent stable
`AUTH_RATE_KEY`; shared source/recipient/global login and owned password quotas
remain active with mail disabled. Admission commits before password/mutation
transactions; User-first locks, fresh credential checks and cascade erasure avoid
late owned metadata and nested transactions. Migration 11 is additive.

Full root lint/types/tests/build passes: 613 API, 880 mobile, 120 contracts,
173 domain, 3 Android-script and 20 release/dependency tests (1,809 total).
Author review reproduced a cancelled cached-query 401 clearing an active session.
The regression fails before the fix and passes after removing duplicate query
read/mutation sign-out handling; the shared API owner/token/abort boundary now
owns rejection cleanup and preserves the reauthentication notice. Targeted
query/access checks pass 53 tests, followed by the full root check.
Two actual mail-disabled loopback API processes share quotas, reject revoked/
expired tokens and retain the synthetic owner's saved task after ordinary login.
Actual restore preserves 23 tables/202 synthetic records, including live owned
quota data, matches constraints/indexes/readiness and removes its disposable DB.
Fresh Android/web artifacts, native ASCII/UTF16 and private-QA scans, v2 signature
and real web entry/worker/WASM/API/SQLite-isolation smoke pass. Preview APK SHA-256:
`C35C02A05BAF40EBEDE0AA9D65CE6D263CCABF7358C434B87B846CD2BA7635C7`.
The reviewed rebuild uses the short Windows Gradle cache. Changing cache roots
also required refreshing only ignored app/Expo/screens CMake state containing
old long header paths; the final native release build succeeds.
Browser verifies the actual account continuation and closed-signup state at
1280px without overflow and with 46px controls; its temporary tab is closed.
No browser credential submission or device session acceptance is claimed.
ADB has no attached device. Screenshot capability remains unavailable.
PR #65 is merged after author review and both exact-head CI runs succeed
(`38207930701`, `38207927300`, head `cf7ac2a4c4578f6b858a848921afe4e011a3b390`).
Main is `45fc273054c74fcb61c9891e69befd4be9a128df`; post-merge CI
`38208267931` succeeds for that exact commit.

Wellness journal is implemented on `codex/wellness-journal` under ADR 012.
The current-day summary and native workspace use bounded, private account/range/
zone reads; 7/30-day reflection, optional tap ratings, saved entry editing and
deletion, note/date search and historical browsing are implemented. Additive
migration 12 supplies revision checks. Legacy creation cannot silently replace
a saved day. User-first locks protect erasure; failed/uncertain edits retain
reviewed versions and drafts, with explicit reconciliation/review and local
cache cleanup retry. Native Android/iOS remains first; the workspace keeps five
tabs and uses existing moss/sage primitives without a new dependency.
Final root lint/boundaries/schema/types/tests/build passes: 621 API, 922 mobile,
135 contracts, 173 domain, 3 Android-script and 20 release/dependency tests
(1,874 total). The journal adds eight real PostgreSQL and fifteen contract tests,
with editor, reflection, cache, screen and retained-tab regressions. An existing
reminder test timed out during a competing native build; the complete idle rerun
passes without modifying that test or its timeout.
Two actual mail-disabled loopback API processes verify owned private ranges,
one-winner concurrent create/edit, stale/cross-owner protection, legacy conflict,
future/range validation, note-only save/delete, compatible export and owned
erasure. Actual restore preserves 23 tables/199 synthetic records, including the
revision-2 journal entry, and verifies schema/readiness before removing its
disposable database. The source is preserved.
An isolated copy of the actual journal/editor with public in-memory sample data
verifies saved prefills, rating selection, save/reflection update, dirty cancel,
note search, delete review/cancel, empty historical browsing and blank defaults.
Geometry at 320/375/430/1024px has no page overflow, with 46px actions and 68px
rating controls. Review adds supported ARIA aliases for selected states and modal
background hiding; period labels remain accurate for historical windows.
Screenshot capture is unavailable. These fixture interactions do not claim real
browser credential submission or hardware acceptance; its tab/viewport are closed
and reset. The fixture source never replaces production application files.
Fresh Android/web artifacts include the reviewed journal and selected origins,
exclude private credentials and public fixture data, and pass native ASCII/UTF16
and HTML-referenced entry scans. Native v2 signature and real API/web entry/three
asset/SQLite isolation smoke pass. Preview APK SHA-256:
`3BAC903B4416FEED6C46D9F07382A00619DAFF3291AAB8F1D0569790BB83F838`.
At journal delivery ADB had no attached device. PR #66 is merged after author
self-review and both exact-head CI runs succeed (`38213528662`, `38213523241`,
head `929380a7351efc82c337bfcc23f2d13837bd1b88`). Main is
`90da612a57445a50f991f31e567993dca74a1f87`; post-merge CI `38213916245`
succeeds for that exact commit. Production is not claimed ready.

The next release slice is `codex/router-release-checks`: eight installed SDK 55
Router parser/serializer acceptance checks with a throwing old-decoder canary.
Actual account/focus links retain task identity and Unicode query data; bounded
malformed encodings and an unknown segment round-trip without reaching that
decoder, and prototype-shaped query data does not change object prototypes.
The targeted suite passes. No runtime/dependency/native-build change is made.
Router 55.0.18 is the latest SDK 55 patch checked on 2026-10-12. The decoder's
patched ESM package and current CommonJS parent are incompatible; no forced
override is used. Full/omit-dev audits remain 0/45/15/60 and 0/41/15/56
(critical/high/moderate/affected entries). These checks do not patch the bundle,
prove every link safe or establish native acceptance. Full root lint, boundaries,
schema, types, tests and build pass: 621 API, 930 mobile, 135 contracts, 173 domain,
3 Android-script and 20 release/dependency tests (1,882 total). The final canary
also explicitly rejects invocation even if a caller catches its thrown error.
The targeted final suite and lint are rerun after that assertion. PR #67 is
merged after author self-review and both exact-head CI runs succeed
(`38292274399`, `38292267141`, head `2c782d61e61badce057705464df2bc848b277356`).
Main is `10d37fdfbc7282abf6b99921c9a916f107ab7c17`; post-merge CI
`38293048776` succeeds for that exact commit.

The owner authorized existing-server hosting and offered a connected Android
device on 2026-10-12. Read-only discovery verifies the existing server at
95.217.239.38 runs Nginx/PostgreSQL and other live applications. An isolated
CampusFlow HTTPS deployment and actual device acceptance are the next delivery
work; SMTP/provider approval is still absent, so public signup stays closed.

The current `codex/vps-native-beta` slice prepares ADR 013, a pinned Node 22
production image, bounded non-root read-only Compose runtime, isolated Nginx path
and container CI readiness gate. Shared account admission now defaults to socket
identity, with explicit loopback-only forwarding that validates one IP and rejects
ambiguous/public startup binds. Twenty-five new API tests include real HTTP
controller checks. Full root lint/boundaries/schema/types/tests/build passes
1,907 tests (646 API, 930 mobile, 135 contracts, 173 domain, 3 Android-script,
20 release/dependency). Both local image targets build; all twelve migrations
apply to a disposable PostgreSQL 17 database. Fifteen actual production-container
HTTP requests verify readiness, closed signup, anonymous rejection, owned login,
tasks/Today, revisioned journal and private export. Restore preserves 23 tables/
23 synthetic records and removes only its generated disposable database.

Automatic approval review rejected a prepared private source upload. The owner
then explicitly chose to keep source local: no archive/source was uploaded,
and no CampusFlow server database, service or route was installed. Any locally
built runtime image contains readable compiled JavaScript and needs separate
explicit transfer approval. Existing server applications remain untouched.

The supplied Pixel 10 Pro XL/Android 16 is unlocked. A new v2-signed preview
installs with app data retained. Actual sign-in revealed a stale native API:
changing only EXPO_PUBLIC_API_URL left the old HTTPS bundle in the local APK.
The native workflow now reruns only the bundle task; Metro partitions transforms
by the selected API because Expo suppresses reset-cache under CI. Actual rebuilt
APK inspection verifies local API/current journal, excludes the previous HTTPS
API and private QA credentials, and passes v2 signature verification (SHA-256
`3BAC903B4416FEED6C46D9F07382A00619DAFF3291AAB8F1D0569790BB83F838`).
The workflow also refuses to copy a preview whose generated Hermes output lacks
the selected URL. Actual ordinary native login/Today, task creation with estimate/
date-only deadline, and journal editing reach PostgreSQL; optional stress stays
blank and the journal advances to revision 5. Offline/lifecycle acceptance is in
progress. Device inspection finds the standalone journal header under Android's
status bar; standalone screen insets are the next separate slice. No new native
notification delivery, independent hosting, SMTP, iOS or store acceptance is claimed.

PR #68 is merged after author self-review and both exact-head CI runs succeed
(`38298183175`, `38298176635`, head `8e73ebecd2e51f82f1bf781d3658f0696f8a913d`).
Main is `87b4757b43e6abe0e1159ad42d325e79fa31e696`; post-merge CI
`38298828460` succeeds for that exact commit. Disconnected cold Today and journal
reads are now observed with explicit saved/stale messaging and the edited entry.

The next slice, `codex/native-screen-insets`, adds an explicit safe-area opt-in
for twelve standalone workspaces using the installed library. Tabs retain their
navigation chrome and existing account/auth/modal safe areas remain separate.
The physical geometry regression detects the old journal viewport crossing both
system bars. The fresh inset APK builds, includes the selected local API and
passes v2 signing (SHA-256
`4723EE77F9D31AC8977F4B558BD07CE5892EA989CF4D0287DDD7AEDAA636BD73`).
Full root checks pass all 1,907 tests with the established isolated database.
An initial run against the live Docker acceptance database has twelve mail-fixture
failures; all 930 mobile tests pass and isolated-database mail tests pass.
No mail-worker change or delivery claim follows from that run.
The Pixel disconnects before the corrected APK can be installed. Reconnection
is requested for twelve-screen geometry/reminder acceptance and restoration of
its temporary keep-awake preference. See the 2026-10-12 native acceptance report.

Release gates: apply all required migrations to the approved deployment,
enable reviewed campus calendars for the intended campus;
verify new native lifecycle/touch flows; retain live Canvas,
hosting/TLS and production account-recovery gates from the MVP roadmap.

### Production API runtime dependencies, 2026-10-12

PR #69 is merged after author self-review and both exact-head CI checks succeed;
main `60fecc6e1075dfc030a7cd5b1c0bf957fbf74158` has successful post-merge CI
`38300447789`. The Pixel remains disconnected; new-build inset, reminder and
keep-awake restoration acceptance is still pending. Source remains local.

The next slice, `codex/api-runtime-dependencies`, addresses actual production
packaging: workspace-filtered pruning retained 438 packages, including Jest,
Prisma CLI, braces and sprintf-js. Restricting only the disposable stage's
workspaces and applying unfiltered dev/optional/peer pruning reduces this to
106 packages and cuts image size about 33%. The migration build target and
generated query engine remain available; committed workspace/version/lockfile
contracts are unchanged. CI inventories actual runtime files without network,
checks compiled/dependency entries and rejects reviewed tools/source leakage.
Five regression tests pass; the old image fails 45 policy checks and the new
image passes. Sixteen real HTTP checks pass with a separate synthetic owner;
23-table/30-record restore preserves the source and original Pixel owner.
Full root lint/boundary/schema/type/test/build checks pass all 1,912 tests.
Both image targets build, the migrator retains Prisma 6.19.0, and every installed
runtime version matches the unchanged root lockfile. PR #70 is merged after
author self-review and both exact-head CI runs succeed (`38303090260`,
`38303052573`, head `5ee62fb4a44aec72ddf80c54e577a226a698309a`). Main
`6bced70d038ac6078bc431080bd3aca99964804f` has successful post-merge CI
`38303654760`. Remaining mobile/build advisories, physical device,
hosting/mail/iOS/store gates persist.

### Public Help and data center, 2026-10-12

The `codex/help-data-center` slice adds ten bundled workflow/data answers, three
topics, bounded local search, usable empty-state reset, accessible accordions and
existing account/student-tool actions. Help is readable before sign-in; only the
exact route bypasses the account gate. Sign-in clears an entered password when
opening Help and prevents navigation during a pending request. Settings has a
direct entry. No backend, schema, shared contract or dependency changes are made.

Published privacy/support URLs are configurable, validated in the actual Expo
configuration and screen, and partition Metro transforms together with the API.
Invalid URL diagnostics are redacted; missing pages are explicitly unavailable
in the preview. Opening a website adds no search/account data. The bundled
answers disclose offline writes, explicit focus saving, per-device reminders,
export/copy boundaries and cleanup retry without inventing backup/log retention.
Approved public policies/contact pages and store declarations are still needed.

Final root lint/boundary/schema/type/test/build checks pass 1,948 tests: 646 API,
966 mobile, 135 contracts, 173 domain, 3 Android-script and 25 release/dependency.
The final pending-sign-in test preserves the real API error class and verifies
Help becomes usable after failure. A clean web export and browser checks at
320/390/1,280px verify layout, combined filters/reset, keyboard accordion,
public account continuation, cleared password and protected planner routing.
The temporary preview server/tab are closed and viewport reset. A fresh Android
preview builds and passes v2 signing, selected localhost API/current Help and
known private-fixture scans (SHA-256
`4B0DDA46D02E3BDC7DA0B21FE87FBCB7842983AE8860B623980A01154D72B198`).
The native geometry script now includes Help; syntax passes, hardware execution
is pending. The Pixel remains disconnected, including keep-awake restoration.
PR #71 is merged after author self-review and both exact-head CI runs succeed
(`38308188618`, `38308183619`, head `79236dcb08fb7492a8c6217ce9e790ca5743d1fe`).
Main `984da187f0e16072cbf88f8b71a710f80d3a942a` has successful post-merge CI
`38308824253`. Source remains local; hosting/mail, iOS and store gates persist.

### Android permission policy, 2026-10-12

The `codex/android-permission-policy` slice removes unused overlay, legacy
shared-storage and biometric/fingerprint permissions through Expo's supported
configuration. Session storage remains encrypted without biometric authentication;
SQLite/exports use app storage and sharing keeps its SDK FileProvider/URI flow.
Required network/local-reminder capabilities and existing SDK support remain.
No dependency, schema, API or architecture change is made.

The native build inspects the actual assembled APK with installed SDK aapt2
before copying the preview. A bounded package/permission inventory rejects
unknown capabilities/declarations, malformed output, incomplete inspection and
missing/restricted core permissions. Eleven new behavior/installed-Expo-mod
checks pass. The preserved previous APK fails specifically for all five unused
permissions. The fresh APK passes with 25 rather than 30 permissions: precisely
those five removals and no additions. Build and v2 signature verification pass
(SHA-256 `7940AC915A07D7CABC13281368A338157816FDB0E8A0FAD0EE98ACF616963260`),
with the selected local API/current Help and known private-fixture exclusion.
The unchanged root lockfile and complete root checks pass 1,959 tests: 646 API,
966 mobile, 135 contracts, 173 domain, 14 Android-script and 25 release/dependency.

The Pixel is visible only through Windows Bluetooth, with no USB/ADB device;
new-build share/session/cache/reminder and older Android acceptance are pending.
Its prior keep-awake value still needs restoration on reconnection. Existing
SDK 36 x86_64 image/emulator and usable WHPX are detected without starting or
altering the user's Medium_Phone AVD. The next concrete local task is a separate
project-owned emulator acceptance run, preserving that AVD and phone data.
Exact-head PR/main CI remains required. Permission names do not establish SDK
data collection, component safety, iOS acceptance or store approval. Source
remains local; hosting/mail/policy/store and mobile advisory gates persist.

### Isolated Android emulator acceptance, 2026-10-12

PR #72 is merged after author self-review and both exact-head CI runs succeed
(`38310361778`, `38310355745`, head `babfa399958671be766507d1e6d66ecadb8e2713`).
Main `a595a61b45e784609b91270507c23c191fd882b1` has successful post-merge CI
`38324601717`. Automatic approval review initially could not run because of a
usage limit; after it became available, the normal reviewed merge succeeded.
No approval boundary was bypassed.

The owner asked to continue without the Pixel. The next task creates a separate
project-owned API 36 AVD in ignored workspace directories and a separate synthetic
owner in the existing loopback production container. It reuses the installed
SDK image/WHPX, with snapshots/metrics disabled, explicit emulator serial and a
separate ADB server. The existing Medium_Phone configuration hash is unchanged;
its userdata/snapshots and the physical phone are not used or reset.

The ARM-only APK installs but crashes during React Native library loading on the
x86 emulator. The reviewed build workflow now supports explicit `--emulator`
x86_64 builds with a separate artifact and actual APK architecture inventory.
The normal ARM artifact remains unchanged. The x86 APK builds, passes v2 signing,
25-permission inventory and known private-fixture exclusion, then installs and
launches (SHA-256 `21FEC5F075730C204EB6B63EAFDCBA4A9C2AB575EBD4179D38CDEBC3F2385669`).

Native public Help clears an entered password; ordinary sign-in reaches Today.
Local search, accordion, combined empty/reset states and wrapped topic controls
pass. Preparing the data copy opens Android's actual JSON chooser; cancellation
returns cleanly without selecting any destination. The native task editor saves
one 25-minute/date-only study task, independently confirmed through the API.
Offline cold startup restores its encrypted session and SQLite task with stale
notices. Real notification permission is granted, one cached future alarm restores
after that cold start, and its exact notification posts while backgrounded with
the API reverse absent, at 00:17:46.453Z for 00:17:00Z (Android inexact delay).

The geometry checker previously selected a full-window navigation ScrollView.
It now checks the nearest scroll ancestor of the unique verified workspace
heading. All thirteen workspaces fit the observed 63..2337 system-bar content
area. Eight PowerShell regressions retain the old-overlap failure and cover
explicit selection with another phone, missing/offline/ambiguous targets, failed
commands and nested navigation. Five target/architecture regressions pass.
Complete root checks pass 1,972 tests (646 API, 966 mobile, 135 contracts, 173
domain, 27 Android tooling and 25 release), with the root lockfile unchanged.

Native reminder replacement moves the one future intent/alarm; three repeated
refreshes do not duplicate it. Disabling Personal reminders removes the alarm;
enabling restores exactly one. Native removal clears server intent/configuration
and all pending CampusFlow alarms.

Native task-linked focus survives a force-stop: cold Today offers recovery,
the observed action opens a paused 23:46 checkpoint, and explicit saving creates
one linked interrupted 74-second record through the API. The standard snapshot
tool cannot reach idle while the timer's text updates; paused recovery is
inspectable. An immediate startup link returned to Today during session restore;
that attempt is not accepted as cold incoming-link evidence.
Later proper single cold URI launches reach Focus and Account, and the explicitly
saved focus draft does not reappear. This remains targeted link evidence.

PR #74's first exact-head CI exposes Linux PowerShell's ANSI/wrapped diagnostic
format breaking one assertion; the device safety behavior itself passes. Test
diagnostics now normalize ANSI and wrapped continuations, retaining exact command
selection/failure assertions. New exact-head CI remains required before merging.

Next: review the scoped diff, publish the PR and verify exact-head/main CI. Broader
physical Android, old Android, iOS, hosting/TLS/mail/policies/store and dependency
disposition gates remain open. Pixel keep-awake restoration remains pending its
availability. Source stays local; no deployment or server transfer is performed.

### Today task capture, 2026-10-12

PR #74 is merged after author self-review and successful PR/push CI on reviewed
head `e8442bd51ea8efc60995e0d211f11c669a72d887` (`38327943034`, `38327938039`).
Main `6b1985a55b18e674386238ccc84682dab8b0b56a` passes post-merge CI `38328628613`.
The owner explicitly approved deleting the disposable emulator account. Its native
password/DELETE form acknowledges deletion without a cleanup error, the verification
token returns 401, and the separate existing Pixel QA export fingerprint is unchanged.
Cold Account/Focus remain signed out with no former task/recovery/email visible.
This does not inspect byte-level cache erasure or every cleanup-failure path.

The next feature adds a prominent Today task-capture action using the existing
editor, captured displayed calendar day and ordinary task service. Scheduling stays
separate from the deadline; no date-to-instant conversion or new persisted read
model is introduced. Private forms retain the existing keyed tab-session boundary.
Eight Today/editor behavioral cases and three session-transition cases cover the
new flow. Complete root checks pass all 1,983 tests (646 API, 977 mobile, 135
contracts, 173 domain, 27 Android tooling and 25 release). The lockfile is unchanged.
Native capture creates one date-scheduled 20-minute task without a deadline or
reminder; actual task/Today reads independently confirm it. A selected DST day
prefills correctly and cancellation creates nothing. Offline cold startup keeps
the saved task; failed capture keeps its draft. The initial native fetch diagnostic
is replaced with an unconfirmed-save message that advises checking saved tasks
before retrying. The final APK exercises that message and its cancellation leaves
the server count at one. The existing Pixel export fingerprint remains unchanged.
See [capture evidence](../docs/requirements/today-task-capture.md) for both exact
APK hashes, final signature/architecture/permission/private-fixture proof and limits.
The separate synthetic Today account and all credentials/evidence remain local.
Next: author review, exact-head PR/push CI, merge and exact post-main proof;
then mounted native incoming-link/lifecycle acceptance. Source stays local.

### iOS public navigation diagnostic, 2026-10-13

PR #83 (`6c36838`, native `38508047049`) and dependent PR #84 (`b536252`,
native `38508800285`) fail the first Back-to-sign-in assertion after Help arrives.
Their standard PR/push checks pass; neither current native result permits merge.
Public logs confirm an enabled in-bounds tap and UIKit delivery to CampusFlow,
but do not establish the React Native callback or completed route replacement.
Parallel read-only app/driver investigations find no confirmed root cause.

The scoped successor enables fixed, bounded public navigation breadcrumbs only
in the CI simulator build. Help observes press-in/out/onPress without retrying;
the original replacement remains unchanged. Root route categories and auth mount
identify the next boundary. No credentials, links, parameters or state objects
are logged. Normal builds are silent; logging failure cannot interrupt an action.
All public, native capture, independent API, cold-cache and logout gates remain.
Four new cases plus existing scoped tests pass (34 total); 22 iOS tooling cases,
mobile typecheck, lint and diff checks pass. No dependency/lockfile change.

Next: publish this diagnostic on PR #83, review its exact head and inspect the
native event sequence before selecting a fix. Keep #84 draft until its dependency
and its own required native gates pass. Physical devices and source transfers
remain excluded by the owner's current instructions; unrelated files are preserved.

### iOS runner handoff comparison, 2026-10-14

At `3b0a827`, both standard checks pass all 2,136 tests. Native run `38511768603`
fails the original Back assertion, with consecutive same-process public markers
showing press-in/out but no onPress/replacement. Direct BackBoard evidence records
an active CampusFlow touch cancelled when its virtual digitizer is removed; the
successful system Open control has an ordinary release before cleanup. This is
native input cancellation, not evidence that the app replacement callback failed.

Pinned-source and actual PID review show both CLIs already start fresh XCTest
processes, even with no-reinstall-driver. Changing only that flag would not test
a new pre-Back condition. Help arrives before the first CLI ends in the diagnostic
run. The next scoped comparison uses one ordered wrapper for both existing warm
subflows, avoiding the second runner handoff. Original sign-in/first-link/Back,
in-app Help, search, protected Account, termination, cold and all private gates
remain required, with no action retry or assertion expansion. App code is unchanged.

Next: validate/publish the wrapper and inspect exact-head native touch/navigation
evidence. Remove temporary app probes and require final uninstrumented native and
standard success before merging #83; #84 remains draft. No phone/server transfer
or account deletion is performed.

### Completed native checks and fail-closed cleanup proof, 2026-10-14

The `69732c4` comparison passes both standard checks and all original warm/cold
public navigation. Its native helper records all four real capture/cache/logout/
cold-signed-out checks. Final artifact inspection finds no `storage.json`, so the
job's nominal success is not accepted as complete cleanup. An already signalled
API child has null exitCode; awaiting its second exit lets Node finish without
publishing the final record.

The fix makes stopping the owned API child idempotent for normal and signal
termination, bounds escalation/confirmation and fails on unconfirmed shutdown.
The workflow requires a complete exact-source summary independently after the
helper returns. Six new process/proof cases pass, bringing iOS tooling to 28.
Temporary public app diagnostics are removed, retaining all original actions and
API/cache/logout assertions. Final uninstrumented exact-head native success,
author review and matched-SHA merge/main verification remain required.

A separate day-end feature is implemented locally on `codex/day-review`, with
explicit fresh-editor scheduling, preserved deadlines, saved/missing-state
distinctions and account isolation. Its scoped tests pass117 cases; the earlier
full mobile run passed1,127 before the last acknowledgment change. Exact owned
stash `2ce9944872143540b41ab74e86e99a85482099d1` safely holds those named feature
files while this cleanup fix is published. Its synthetic loopback visual preview
is still open; this is not native/production acceptance. No existing user files,
phone, retained account or server source are operated on.

### Accepted iOS storage parent and recovery integration, 2026-10-14

PR #83 is merged at `c08a0987222c3940bc59cd187f03e0e9e47aadea`. Both standard
checks and final uninstrumented native `38603642902` attempt 2 pass on reviewed
head `c3c2563`. Downloaded final product/JUnit/storage records match that source;
the proof validator confirms all four ordered API/cache/logout checks and passed
cleanup. Earlier failed-attempt artifacts are preserved locally with hashes and
only their duplicate remote upload slots were cleared. The merged tree matches
the reviewed tree. Main standard `38612589071` passes; native `38612589080` is running.

The queued recovery feature is rebased onto accepted main. Its recovery/root-gate
file hashes match the previously exercised Android/partial iOS feature code.
It retains the parent's full final-proof guard, original warm wrapper and exact
Settings-tab selection; all added warm/cold/offline recovery assertions remain.
Artifact names now include source and run attempt, preserving evidence on retries.
All 1,099 integrated mobile tests and 28 iOS tooling cases pass, along with lint,
strict mobile types and all ten native YAML flows. Exact-head PR/native/main
checks remain required.

The separate day-review feature is also prepared locally on the accepted main;
Button retains both native testID and its task-specific accessibility label.
All 1,128 integrated mobile tests, 28 iOS tooling cases, lint and mobile types pass.
Its earlier native fixture evidence remains tied to app source `72a1395`; final
integrated feature acceptance is still required. Backups and unrelated user files
are preserved. No physical phone or server source transfer is performed.

### Guided day-end review, 2026-10-14

The next substantive student workflow connects Today to recorded task/routine
progress, saved study time, explicit tomorrow scheduling and the existing wellness
journal. It reuses the weekly review and study-report projections and account-scoped
query/cache boundaries. No API/schema, persisted review or offline write queue is
added. See [day-end requirements](../docs/requirements/day-end-review.md).

The existing task editor first loads current detail, then prefills a one-off open
task's schedule for the next current account day, retaining its fresh deadline and
requiring explicit Save. Failed saves retain the draft, cancellation writes nothing,
and owner/credential changes suppress late acknowledgments. Missing/foreign records
remain unavailable; recorded completions are separate from the latest saved plan.

All 1,128 mobile tests pass; root lint/boundary/schema checks, strict mobile types
and fresh web export pass. Synthetic loopback browser QA verifies one actual PATCH,
the unchanged deadline, zero writes on cancellation, visible save feedback, connected
navigation and 320/1280-pixel layouts plus 150% CSS zoom. The fixture journal endpoint
is absent and native dynamic type is untested. No real account or phone was used.

Native acceptance and exact-head PR/main CI remain required. PR #83's final
uninstrumented simulator/storage proof is still running, and draft PR #84 awaits
that accepted parent before rebasing. Unrelated IDE/coursework/output files and
the explicitly owned feature backup stash are preserved. Source remains local.

### Day-review PR and native fixture acceptance, 2026-10-14

Draft [PR #85](https://github.com/ArturZZerg/AUCSC325-TeamSpirit/pull/85) contains
app source `72a13956b49c5af110cb6e78f5939fc339c0e481`, its requirements and 41 new
mobile behavior cases. Both standard checks pass all 2,157 tests. Author reviews
identify themselves as self-review; no independent approval or merge is claimed.

The current x86 APK builds after using the documented short Gradle cache and
clearing only validated generated x86 CMake/Ninja dependency data retaining the
old long path. Actual signature/ABI/permission/feature/private-fixture checks pass.
Native fixture sign-in, review, fresh editor, zero-write cancellation and one
explicit PATCH pass, preserving the deadline and showing visible confirmation.
An API-disconnected cold restart restores encrypted session and saved progress/
study reads; fresh editing stays blocked offline. Actual Android 150% font size
at 320 logical pixels fits the observed system-bar bounds. See the updated
[acceptance record](../docs/requirements/day-end-review.md) for the APK hash and
the explicit synthetic-fixture limits. This does not prove PostgreSQL writes or
real authentication. All owned test processes are stopped, the AVD's data remains,
its original display is restored, and the ARM phone artifact is unchanged.

Native feature run `38606848891` fails public Help visibility before the private
feature. PR #83's uninstrumented `c3c2563` run also fails its first Help assertion;
the OS delivers its URL only after automation shuts down, and the final frame is
Help. One unchanged exact-head retry of `38603642902` is running. No assertion,
action or storage/cleanup proof is weakened. Neither #83, #84 nor #85 is merged.

Next: inspect the current retry and require a complete exact-source storage proof.
After its accepted matched-SHA merge/main checks, rebase the dependent work,
preserving Button's test identifier and the feature's accessibility label, then
review and run all current native/standard gates. No phone or server source
transfer is performed; unrelated files and the earlier owned stash are preserved.

### Real API gate for native day review, 2026-10-14

Day review is prepared on recovery head `71e8082`, retaining its safe-link routes,
attempt-specific artifact names and the accepted complete storage/cleanup guard.
The repository permits merge commits; preserving recovery's history will keep the
dependent PR scoped without rewriting already-tested app source for ancestry.

The iOS harness now creates a second disposable owned task due/scheduled today
and a real API-persisted 25-minute focus fixture. Two native flows must display
saved study time, load fresh task detail, cancel without server changes, then
explicitly save tomorrow while preserving the deadline. Independent API/schema
and SQL assertions protect both tasks, prevent duplicates and retain the original
Today-capture/cold-cache/logout gates. Final proof rejects missing review/study
results as well as incomplete common storage checks. Private UI/logs remain local
to the runner, and only bounded fixed metadata is published.

All 1,140 integrated mobile tests, 33 iOS tooling cases, lint, mobile types and
thirteen native flow documents pass locally. Current native acceptance is pending.
Main `c08a098` standard checks pass; native `38612589080` is live. PR #84's two
standard checks pass on `71e8082`; native `38613496910` is live. Neither feature
is merged. Use the exact main source's proof validator for its legacy four-check
record; the feature's stricter validator intentionally requires the added review
results. No phone or VPS transfer is performed; unrelated files/backups remain.
