#!/usr/bin/env bash
# Uploads a directory written by scripts/publish-update.mjs (ADR 021).
#   SERVER=root@host ops/vps/upload-update.sh DIR
# Assets and APKs go first; manifests and latest.json are renamed into place
# last, so phones never see a manifest whose files are missing.
set -euo pipefail
SERVER=${SERVER:?Set SERVER, e.g. root@host}
DIR=${1:?Pass the publish-update.mjs output directory}
[ -d "$DIR/assets" ] || { echo "$DIR has no assets/ directory" >&2; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
incoming="/var/www/campusflow-updates/.incoming-$stamp"
ssh "$SERVER" "install -d -m 755 /var/www/campusflow-updates/assets /var/www/campusflow-updates/android '$incoming'"
tar -C "$DIR" -czf - . | ssh "$SERVER" "tar -xzf - --no-same-owner -m -C '$incoming'"
ssh "$SERVER" INCOMING="$incoming" bash -s <<'REMOTE'
set -euo pipefail
root=/var/www/campusflow-updates
cd "$INCOMING"
chmod -R a+rX,go-w .
# Content-addressed: an existing file already has these bytes.
find assets -type f -exec sh -c 'for f; do [ -e "/var/www/campusflow-updates/$f" ] || mv "$f" "/var/www/campusflow-updates/$f"; done' sh {} +
for apk in android/campusflow-*.apk; do
  if [ -e "$apk" ]; then mv -f "$apk" "$root/$apk.next"; mv -f "$root/$apk.next" "$root/$apk"; echo "published $apk"; fi
done
for manifest in android/*/manifest.json ios/*/manifest.json; do
  [ -e "$manifest" ] || continue
  install -d -m 755 "$root/$(dirname "$manifest")"
  mv -f "$manifest" "$root/$manifest.next" && mv -f "$root/$manifest.next" "$root/$manifest"
  echo "published $manifest"
done
if [ -e android/latest.json ]; then
  mv -f android/latest.json "$root/android/latest.json.next"; mv -f "$root/android/latest.json.next" "$root/android/latest.json"; echo "published android/latest.json"
fi
cd / && rm -rf "$INCOMING"
REMOTE
