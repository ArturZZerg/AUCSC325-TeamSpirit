# Public native input evidence and successor

Repeated main/recovery/day-review runs fail the first warm Help assertion before
feature checks. In baseline `38620875376`, the assertion fails at 19:24:28 UTC,
then iOS delivers the URL to CampusFlow PID 30152 at 19:24:30.943. Earlier direct
BackBoard evidence separately records cancelled injected Back touches. These
observations do not establish an application routing defect.

## Fixed-source comparison, 2026-10-14

Diagnostic source `35ba8371bea0763c0b44fece21c856a902c6fd03`, native run
`38623494563`, installs the existing main artifact from `38612589080` on a fresh
job-owned simulator. App source is `c08a0987222c3940bc59cd187f03e0e9e47aadea`.
The extracted/installed executable and JS hashes match both before and after:

- Executable: `06cbb7b622915638c1a415beff60a21cb3543dbd1c4dd8d0e06a7de757d2e31c`
- JS: `cdae3c4815b76fd09b2b79c28402551f9b965c8462ffaeead9f857b945d9a2f1`

The separate XCTest host uses the runner's default Ruby/existing xcodeproj gem.
Apple's public system URL API opens the first three-slash Help URL before any
in-app Help action. The test requires ordinary sign-in, native foreground state,
unchanged PID 7707 through the warm link and exactly one Back tap, then in-app
Help and one Back. Actual framework output confirms one test, zero failures in
17.675 seconds and all four stage markers. The final native frame shows ordinary
sign-in. No API listener or private account data is used; owned cleanup passes.

This result covers only the stated subset. It does not alone accept search,
Account, cold links, recovery, private storage or production readiness, and does
not identify the precise upstream cause of the older automation failure.

## Permanent full public gate

Retire the fixed-artifact workflow and comparison-only source. The ordinary iOS
preview instead builds its current source and a separate disposable public
XCTest host. `ios-public-acceptance.swift` retains the full first-warm ordering,
single Back actions, in-app Help, legacy link, search/answer/clear, protected
Account, ignored continuation and cold Help after explicit termination. System
confirmation is handled when a foreground system host presents it. No action
retry, route hook, longer application assertion or cold substitution is added.

`ios-public-acceptance.mjs` requires actual framework success for the named test,
all ordered stage markers, one unchanged warm PID and a distinct cold PID. The
test bundle embeds its validated source/device/run/attempt context; mismatched
replayed execution cannot be restamped by the verifier. Zero
discovered tests, missing/duplicate/reordered stages, failed execution and wrong
source/device identities fail. Source-bound public proof and public XCTest
artifacts precede private account creation. Existing real-API, cold-cache,
logout and independent SQL/cleanup requirements remain unchanged. Private
Maestro logs/images/hierarchies stay in the restrictive ignored runner directory.

Actual full current-source native and standard acceptance remain required before
merging the successor; the successful subset comparison cannot substitute for it.

Primary API references:
- [Opening a URL in its default application](https://developer.apple.com/documentation/xcuiautomation/xcuisystem/open(_:))
- [Native tap events](https://developer.apple.com/documentation/xcuiautomation/xcuielement/tap())
