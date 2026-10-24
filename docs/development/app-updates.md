# App updates (ADR 021)

Installed Android apps download JavaScript updates from
`https://workout.vakula-dev.com/campusflow-updates`. Only builds that target the
production API have updates enabled; local and emulator previews never do.

## One-time server setup

```bash
install -d -m 755 /var/www/campusflow-updates
cp ops/vps/nginx-updates-map.conf /etc/nginx/conf.d/campusflow-updates-map.conf
cp ops/vps/nginx-updates.conf /etc/nginx/snippets/campusflow-updates.conf
# add "include snippets/campusflow-updates.conf;" to the HTTPS server block next to the other CampusFlow snippets
nginx -t && systemctl reload nginx
```

## Everyday changes (JavaScript, screens, copy, assets)

`ops/vps/deploy.sh` publishes an update after the API and web smoke checks pass.
Phones download it on the next launch (or overnight, or from **Settings → App
updates → Check for updates**) and use it after a restart. To publish without a
full deploy:

```bash
node scripts/publish-update.mjs --out <dir> --commit "$(git rev-parse --short=12 HEAD)"
SERVER=root@95.217.239.38 ops/vps/upload-update.sh <dir>
```

Publish only from a clean `main`; the update must match what the API serves.
Rolling back means publishing the previous commit again.

## Native changes (new native module, permission, Expo SDK, config plugin)

`scripts/publish-update.mjs` and production APK builds refuse to run when the
native fingerprint no longer matches `apps/mobile/native-fingerprint.json`
(exit code 3; `deploy.sh` then ships the API and web app and says so). Then:

```bash
node scripts/native-runtime.mjs --bump   # runtime N+1, records the new fingerprint; commit both files
```

Build the APK against the production API (PowerShell, short checkout path):

```powershell
$env:EXPO_PUBLIC_API_URL = 'https://workout.vakula-dev.com/campusflow-api'
node scripts/build-android.mjs
```

Publish it so installed apps offer **Download version …** in Settings:

```bash
node scripts/publish-update.mjs --out <dir> --apk artifacts/android/campusflow-preview.apk
SERVER=root@95.217.239.38 ops/vps/upload-update.sh <dir>
```

Fingerprints are computed on the owner's Windows checkout; run these commands
there (line endings of config files are part of the fingerprint).
