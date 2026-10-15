# Android morning overview acceptance — 2026-10-14

This run uses app/API source `0b238fcc919a9db6ecbf9aa4ef2fa6a53e59a415`, a
fresh project-owned API 36 x86 emulator, and synthetic accounts in a separate
local NestJS/PostgreSQL 17.5 testbed. The physical Pixel and the original
NativeTodaycapture profile were not used. Source and private test credentials
remain local except for the authorized GitHub/CI workflow.

The locally signed APK passes v2 signing, x86 architecture and all 25 reviewed
permission checks. Its SHA-256 is
`CE5EA163386F8077F46F90E89B9E5DE842A7F2B0431BA5A271939713EA8C6BA3`.
Windows' Ninja path limit required a short build-staging directory in the ignored
generated wrapper; no application, dependency or SDK change was made for that
toolchain workaround.

## Native observations

The test account uses `Asia/Kolkata`. Its 08:00 local target on October 15 is
`2026-10-15T02:30:00Z` (October 14 in the owner's America/Denver timezone).
Neither the host nor emulator clock was changed.

| Native action | Observed result |
| --- | --- |
| Sign out of the separate coursework QA account, then sign in normally | The morning account's own day and task appear; the former coursework row does not appear |
| Enable Morning overview in Settings | Android's actual notification permission dialog opens; allowing it persists the preference and schedules seven unique native alarms |
| Remove only the emulator's API forwarding, force-stop and cold-launch | Encrypted session, current account's task and cached settings restore; the same seven unique alarm times are present, starting at the expected target |
| Background the app while forwarding remains absent | Notification service records the exact account/date overview identifier, `campusFlowOverview=true`, expected `fireAt`, and title “Your plan for today” |
| Inspect the posted notification | Creation time is `2026-10-15T02:30:09.714Z`, 9.714 seconds after the target in this run |
| Leave Settings backgrounded, open the real notification drawer, tap the overview | The account's cached Today and “Prepare for morning class” task open while API forwarding remains absent |
| Restore forwarding and tap Refresh device reminders three times | Each stable capture contains exactly six unique future alarms; today's already delivered occurrence is not rescheduled |
| Disable Morning overview | All pending CampusFlow alarms are removed |
| Re-enable while notification permission is already granted | Six future overviews return without another permission dialog |
| Disable again | Native pending count is zero and the API preference is false |

The initial automated password entry differed from the supplied synthetic test
value. A private comparison reported only equality/mismatch positions, and paced
re-entry matched before ordinary sign-in succeeded. Password values were neither
printed nor captured in published screenshots. This observation does not
establish that the repeated iOS login failure has the same cause.

The coursework data-preservation run on this same APK also independently confirms
title-only and deadline-only PATCHes through a controlled failed list refresh,
native no-op Save, retained disconnected-save draft and explicit retry preserving
the newer deadline. Real PostgreSQL API readback verifies each acknowledged value.

## Scope and remaining gates

This establishes the observed emulator notification, warm tap, opt-in/out and
offline restoration paths. Physical/older Android, reboot/Doze/battery management,
terminated-process overview taps and iOS overview delivery remain unverified.
Other power states can change Android's inexact delivery delay.

PR #102's two iOS attempts at `0b238fc` pass the public gate but fail the first
private post-login wait. Both retain failed status and successful process cleanup.
The follow-up adds keyboard settling and privacy-safe failure diagnostics; it
still requires complete current-source native acceptance before merge. These
Android observations do not substitute for that gate or production hosting,
signing, mailbox delivery, live integration and store acceptance.
