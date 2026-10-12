# Android acceptance — 2026-10-12

The owner supplied an unlocked Pixel 10 Pro XL running Android 16. The tested
v2-signed local preview installs with `adb install -r`, preserving app data.
API access uses USB reverse from the phone's localhost port 3000 to a dedicated
production container on the PC. This requires the development PC/USB connection.
It does not establish hosted availability or iOS/store acceptance.

## Observed behavior

The original environment-only rebuild unexpectedly retained the earlier HTTPS
JavaScript bundle. Actual APK inspection and failed native sign-in exposed this.
Rerunning only Gradle's bundle task remained insufficient because installed Expo
suppresses Metro reset in CI mode. The corrected workflow regenerates the bundle,
partitions Metro transforms by API and checks the actual Hermes output for the
selected URL before copying the preview. APK ASCII/UTF-16 inspection verifies the
local API/current journal and excludes the previous HTTPS API/private QA values.

The accepted pre-inset APK SHA-256 is
`3BAC903B4416FEED6C46D9F07382A00619DAFF3291AAB8F1D0569790BB83F838`.
Against a private synthetic owner in the local production container:

- Ordinary email/password sign-in reaches Today with the five navigation tabs.
- A native task editor saves a new task with a 25-minute estimate and date-only
  deadline. The API confirms exact values; scrolling Today displays the task.
- Wellness opens the new journal with saved ratings/note and recorded coverage.
  Native editing saves mood 5, energy 3, blank stress and a replacement note.
  The authoritative API confirms revision 5 and the optional blank field.
- Removing only the CampusFlow USB reverse, force-stopping and relaunching the
  app restores Today from SQLite, retains the session and shows stale-data text.
  The journal also restores the edited note/ratings with saved-history messaging.
  Reconnecting the reverse preserves the synthetic owner's server data.

The backend's disabled mail/closed signup are intentional. The manually created
synthetic owner is not proof of mailbox delivery. No student data, credentials or
CampusFlow source were transferred to the server.

## Standalone screen regression

Device inspection finds the journal header underneath Android's status bar.
Its main scroll viewport is `[0,0][1080,2404]`; the observed visible content area
is y=161..2316. The new hardware regression command correctly fails this old APK:

```powershell
& scripts/android-screen-acceptance.ps1 -Routes journal
```

Standalone workspaces now opt into the existing safe-area library through the
shared Screen primitive. Tabs already have navigation chrome; authentication,
account screens and modal editors already use their own safe areas. No new
navigation layer or dependency is introduced.

The corrected inset preview builds and passes v2 signature verification:
`4723EE77F9D31AC8977F4B558BD07CE5892EA989CF4D0287DDD7AEDAA636BD73`.
The Pixel disconnected before it could be installed. New-build geometry and
additional reminder/lifecycle acceptance remain pending reconnection. The full
root gate passes 1,907 tests, lint, boundary/schema checks, types and builds using
the established isolated local database. A first run against the live Docker
acceptance database had twelve captured-mail fixture failures; its 930 mobile
tests passed. Mail fixtures pass in the isolated test database. This does not
establish real SMTP delivery from either environment.

Once the reviewed APK is installed and signed in, run the full geometry command:

```powershell
& scripts/android-screen-acceptance.ps1
```

It requires exactly one authorized device, uses observed system-bar geometry,
opens twelve allowlisted native links, validates the expected workspace and
checks the main scroll viewport/first action against those bars. It refuses an
auth/unknown screen or a different foreground surface. Output contains geometry
only; private XML snapshots/results remain in ignored `.local`. Unsupported
system-bar metadata requires manual inspection. It does not prove every control,
horizontal cutout, orientation, keyboard state or incoming URL is safe.

Keep-awake was enabled temporarily for the plugged-in tests. Its prior value is
saved locally; restore it on reconnection. Other apps and the phone's networking
settings were not changed. New notification delivery/cancellation, broader device
flows, hosted HTTPS, SMTP, iOS/signing/stores remain separate release gates.
