# ADR 021 — Self-hosted app updates

Status: Accepted.

Date: 2026-10-24

## Context

The Android app is a locally signed APK installed by hand (no Play Store). Every
change, even a one-line copy fix, needs a new APK build, a USB install and a
manual check. The owner wants the app to update itself: on launch, at night, or
when the student taps **Update**. Expo's `expo-updates` implements the open
[Expo Updates protocol v1](https://docs.expo.dev/technical-specs/expo-updates-1/),
which any server can host; no Expo account or EAS service is required.

Over-the-air updates can only replace JavaScript and bundled assets. Anything
native (a new native module, a permission, an Expo SDK upgrade, app config
plugins) still needs a new APK. Shipping JavaScript that expects native code the
installed APK lacks crashes the app, so that boundary must be enforced, not
remembered.

## Decision

- **Static hosting on the existing server.** Updates are files under
  `/var/www/campusflow-updates`, served by the existing nginx host
  (`ops/vps/nginx-updates.conf`). No new service, database or queue.
  - `GET /campusflow-updates/manifest` is the fixed update URL. nginx selects
    `<platform>/<runtime>/manifest.json` from the `expo-platform` and
    `expo-runtime-version` request headers. Header values are allow-listed by
    `map` (platform `android|ios`, runtime `^[0-9]{1,6}$`) so they cannot
    escape the directory; unknown values return 400 or 404. The response is a
    plain JSON manifest with `expo-protocol-version: 1`, `expo-sfv-version: 0`
    and `cache-control: private, max-age=0`. JSON mode cannot carry directives,
    so there is no remote "roll back to embedded"; rolling back means
    publishing the previous commit again (a newer `createdAt`).
  - Bundles and assets live under `/campusflow-updates/assets/<sha256>` and are
    immutable. The manifest is written last with an atomic rename, so a client
    never sees a manifest whose files are missing.
- **Explicit native runtime.** `apps/mobile/native-runtime.json` holds an
  integer `runtimeVersion` and the `@expo/fingerprint` hash of every native
  input (generated `android/` and `ios/` folders are excluded; they are rebuilt
  from config). `app.config.cjs` reads it. `scripts/native-runtime.mjs --check`
  recomputes the fingerprint; the publisher and the production APK build refuse
  to run when it differs. `--bump` increments the runtime and records the new
  fingerprint, which then requires a new APK. Fingerprints are computed with
  the production build environment so they are reproducible.
- **Updates only in production builds.** Updates are enabled only when a build
  targets the production API (`https://workout.vakula-dev.com/campusflow-api`).
  Local and emulator previews keep `updates.enabled = false`, so they can never
  download production JavaScript.
- **Publishing.** `scripts/publish-update.mjs` runs `expo export --platform
  android` and writes the manifest (UUID `id`, ISO `createdAt`, runtime,
  `launchAsset` and `assets` with base64url SHA-256 hashes and content types)
  plus content-addressed files to an output directory. With `--apk` it also
  copies the APK and writes `android/latest.json` (`runtimeVersion`, `version`,
  `apkUrl`, `sha256`). `ops/vps/upload-update.sh` uploads that directory.
  `deploy.sh` publishes after the API is ready, because the new JavaScript may
  call the new API. If the native fingerprint changed, the deploy still ships
  the API and web app, skips the OTA update and says a new APK is needed.
- **In the app.**
  - `checkAutomatically: ON_LOAD` with `fallbackToCacheTimeout: 0`: launch is
    never delayed; a downloaded update applies on the next cold start.
  - Settings shows an **App updates** card: installed runtime and update date,
    **Check for updates**, and **Restart to update** once one is downloaded.
  - A background task (`expo-background-task`, Android WorkManager) runs about
    hourly while the OS allows it and only downloads updates between 01:00 and
    05:00 device-local time. It never restarts the app.
  - When `latest.json` names a higher runtime than the installed one, Settings
    offers **Download new version**, which opens the APK URL in the browser.
    Android asks the student to confirm the install. No
    `REQUEST_INSTALL_PACKAGES` permission is added.
  - All update logic lives in `src/services/app-updates.ts` behind
    `Updates.isEnabled`; the web build and development builds use no-op paths.

## Consequences

- Most changes reach installed phones without USB or a store.
- Trust is the same as for the APK today: whoever controls the server and its
  TLS certificate controls the code phones run. Expo code signing (keys kept
  off the server) is a possible later hardening step.
- Forgetting a runtime bump fails closed: the publisher refuses, and a stale
  fingerprint never reaches phones.
- Background downloads are best effort; Android decides when WorkManager runs.
