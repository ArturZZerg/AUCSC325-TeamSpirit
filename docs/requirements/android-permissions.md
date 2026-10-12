# Reviewed Android permission policy

The signed SDK 55 preview originally requested 30 permissions. Five had no
implemented CampusFlow use: display over other apps, legacy shared-storage
read/write and biometric/fingerprint authentication. The application must omit
those capabilities while retaining its network and local reminder behavior.

## Configuration and artifact gate

`apps/mobile/app.json` blocks the five full permission names through Expo's
supported `android.blockedPermissions` configuration. The installed SDK creates
manifest removal entries so library manifests cannot reintroduce them. See the
[Expo permission guide](https://docs.expo.dev/guides/permissions/).
Generated native projects remain build output rather than hand-edited source.

Before copying an Android preview into `artifacts/android`, `build-android.mjs`
uses installed Android SDK `aapt2` to inspect the actual assembled APK. The
permission gate requires the CampusFlow package identity, accepts only the
reviewed 25 app/SDK permission names, and rejects unknown permission declarations,
unknown capabilities, malformed/oversized output and incomplete inspection.
Internet, notification posting, reboot reminder recovery and vibration must have
unrestricted normal declarations; missing or SDK-limited substitutes fail.
Android SDK tool execution is bounded and raw tool errors are not echoed.
An unavailable inspector fails the build rather than skipping acceptance.

Reviewed optional SDK support includes network state, wake locks, Firebase
messaging/install-referrer declarations, the app's receiver permission and
launcher badge compatibility. A new SDK permission requires a reviewed purpose
before being added to the allowlist. This is a permission-name inventory, not a
claim about SDK data collection, component exports, complete manifest safety or
store data declarations.

## Compatibility evidence and boundaries

- Session storage uses SecureStore read/write/delete without authenticated
  access. The installed SDK defaults `requireAuthentication` to false and only
  opens biometric prompts when it is true. Encrypted storage remains in place;
  biometric unlock is not implemented. See
  [SDK 55 SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/).
- SQLite/account export files use app-specific storage. JSON sharing uses the
  installed SDK's FileProvider/URI grants rather than broad shared-storage
  access. Android documents that
  [internal app storage needs no storage permission](https://developer.android.com/training/data-storage/app-specific).
- No overlay flow is implemented. Reminder permissions and their installed SDK
  support remain; no exact-alarm or other new device permission is added.
- `android-permissions.test.mjs` covers reviewed output, all five rejected legacy
  capabilities, unexpected sensitive/conditional/custom permissions, missing or
  restricted core permissions, package identity, malformed/oversized output,
  Windows line endings and the installed Expo removal mod. The previous APK is
  also checked directly and must fail specifically for the five removals.
- Fresh APK inspection/signing and root checks are separate from physical
  acceptance. Verify ordinary sign-in/session restoration, offline cache, JSON
  share/cancel and delivered/edited/cancelled/rebooted reminders on authorized
  Android devices, including an older supported version. Do not erase existing
  app data to run those checks. iOS permissions/build and store declarations
  require their own acceptance.

For a standalone artifact, run:

```text
node scripts/android-permissions.mjs <path-to-reviewed.apk> <path-to-sdk-aapt2>
```

The JSON inventory contains public package/permission names only. Do not treat a
successful inventory as proof of native flows or an approved production release.

Local evidence on 2026-10-12: the previous signed APK fails specifically for the
five listed removals. The fresh SDK 55 APK has 25 permissions, with exactly those
five removals and no additions; it passes the build gate and v2 signature check
(SHA-256 `7940AC915A07D7CABC13281368A338157816FDB0E8A0FAD0EE98ACF616963260`).
Its selected local API/current Help content are present and known private QA
fixture values are absent. Root lint/boundaries/schema/types/tests/build pass
all 1,959 tests, including 14 Android-script checks. The Pixel has no USB/ADB
connection, so new-build physical compatibility is not claimed.
