# Android phone preview

The first Android deliverable is an ARM64 APK with its JavaScript bundled inside
it. It launches without Metro or Expo Go. The API and PostgreSQL must still be
running for sign-in, fresh data, and writes. This is a locally signed test build;
it is not a Play Store release or proof of complete MVP functionality.

## Build on Windows

Install project dependencies and Android Studio's SDK with platform-tools,
Android API 36, and JDK 17 or newer. The native build can download missing SDK
components whose licenses have already been accepted in Android Studio.
Use the existing npm lockfile; no Expo account or cloud build is required.

From the repository root in PowerShell:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot'
$env:NODE_OPTIONS = '--use-system-ca'
node scripts/build-android.mjs --check
npm.cmd run build:android
```

Adjust JAVA_HOME to the installed JDK. The script uses Windows trusted
certificates for Gradle HTTPS downloads. Expo caches stay under `.local`;
Windows Gradle caches use `%USERPROFILE%\.gradle\campusflow` to avoid Ninja's
260-character path limit. It uses Gradle 9.1.0 to address the Windows transform-cache locking
[issue](https://github.com/gradle/gradle/issues/31438). It regenerates the ignored native Android project and copies the APK
to `artifacts/android/campusflow-preview.apk`. This output supports ARM64 phones,
not x86 Android emulators or older 32-bit-only phones.

## Connect the phone through USB

Start PostgreSQL, apply migrations, and start the API using the README workflow.
For the API process, explicitly set DATABASE_URL in its environment; setting
HOST to `127.0.0.1` and PORT to `3000` keeps the USB workflow local to the PC.

Enable Developer options and USB debugging on the phone. Connect it, unlock it,
and accept the debugging authorization prompt. Then run:

```powershell
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
& $adb devices -l
& $adb reverse tcp:3000 tcp:3000
& $adb install -r artifacts/android/campusflow-preview.apk
& $adb shell am start -n com.campusflow.mobile/.MainActivity
```

The default bundled API address is `http://localhost:3000`. ADB reverse forwards
that address on the phone to the PC's API. Keep the USB connection active and
reapply the forwarding after reconnecting. If several devices are connected,
select the intended device with `adb -s DEVICE_SERIAL`.

For manual installation, copy the APK to the phone and allow installation from
that source. The same USB forwarding is still needed for the default API URL.

## Optional Wi-Fi connection

Before rebuilding, set EXPO_PUBLIC_API_URL to the PC's private LAN API address,
such as `http://192.168.1.2:3000`. Start the API with HOST=`0.0.0.0`, use the same
network on the phone, and allow port 3000 on that private network. Do not expose
the development API publicly. The script validates the address and permits HTTP
only to that exact preview host. Normal Expo builds do not enable this preview
network configuration. An actual deployed API must use HTTPS.

## Device acceptance

Verify on the phone before claiming this preview works end to end:

1. Create an account, sign out, and sign back in.
2. Create a task due today and check that it appears in Today.
3. Edit, complete/undo, and delete the task; check the refreshed data.
4. Restart the app and verify the session and stored records.
5. After populating the cache, disconnect the API and verify cached reading.
6. Sign out offline and verify that the next account cannot see cached data.
7. Set/change/clear estimated minutes, timed scheduling and recurrence. Verify
   refreshed cards, failed-save drafts and the completed-task undo requirement.
8. Create a weekly-target goal in a zone different from the account. Complete
   and skip occurrences, check its Monday–Sunday progress and history, then
   pause/resume it. Missing history must not appear as zero progress.
9. Set/change/remove a future task, goal and saved-event reminder. Verify device
   permission, one scheduled notification per active intent and actual delivery.
   Paused/completed targets remain inactive; undo/resume restores eligible intent.
10. Snooze a task/goal with active reminder intent; verify delivery is postponed
    while the original configuration stays visible. Apply quiet hours and category
    controls, then verify cancellation on removal, deletion, unsave and sign-out.
11. Check Today/Coming up deadline and schedule labels in the account timezone,
    including date-only values. Check local midnight/background resume and cached
    new-date plans while the API is unavailable; uncovered dates stay unavailable.

Task/goal/event controls and reminder reconciliation are implemented, but their
native interaction and delivery remain acceptance gates. Real Canvas imports
and a verified campus source also remain external MVP gates. The current Maestro
smoke scenario covers navigation to registration only; it does not verify this
acceptance list. The [2026-10-04 native report](android-native-acceptance-2026-10-04.md)
records successful Pixel 10 Pro XL checks for offline dates, account switching,
offline sign-out cleanup and actual background reminder delivery. The remaining
editor, reminder-lifecycle, midnight/DST and iOS gates are listed in that report;
these targeted results do not establish the entire acceptance list.

Official workflow references: [Expo local builds](https://docs.expo.dev/guides/local-app-development/)
and [installable Android APKs](https://docs.expo.dev/build-reference/apk/).
