#!/usr/bin/env bash
# Deploy the reviewed main commit to the owner's server (ADR 013, ADR 017).
# Run locally from a clean checkout of main. Builds images locally, transfers
# them, backs up the database, migrates, recreates the container and smoke-tests
# it. Any failure after the old container is touched restores the previous image
# and release files, then verifies that the rollback is serving.
#
# Migrations must stay backward-compatible with the previous image
# (expand/contract): an image rollback does not roll back the schema.
#
#   SERVER=root@95.217.239.38 [BUILD_CA=path/to/public-ca.pem] ops/vps/deploy.sh
set -euo pipefail
SERVER=${SERVER:?Set SERVER, e.g. root@host}
PUBLIC_URL=${PUBLIC_URL:-https://workout.vakula-dev.com/campusflow-api}
cd "$(git rev-parse --show-toplevel)"

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "Deploy only from main" >&2; exit 1; }
# Untracked files inside the build context would enter an image tagged as this commit.
[ -z "$(git status --porcelain --untracked-files=all -- package.json package-lock.json tsconfig.base.json apps/api apps/mobile packages ops/vps scripts/build-hosted-web.mjs)" ] ||
  { echo "Build context has local changes or untracked files" >&2; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "HEAD is not origin/main" >&2; exit 1; }
commit=$(git rev-parse --short=12 HEAD)

secret=()
[ -n "${BUILD_CA:-}" ] && secret=(--secret "id=build_ca,src=$BUILD_CA")
# Always build: the layer cache keeps this fast, and a hand-built tag is never trusted.
docker build -q "${secret[@]}" -f ops/vps/Dockerfile --target build -t "campusflow-build:$commit" . > /dev/null
docker build -q "${secret[@]}" -f ops/vps/Dockerfile --target runtime -t "campusflow-api:$commit" . > /dev/null
local_id=$(docker image inspect --format '{{.Id}}' "campusflow-api:$commit")
remote_id=$(ssh "$SERVER" "docker image inspect --format '{{.Id}}' campusflow-api:$commit 2>/dev/null" || true)
if [ "$local_id" != "$remote_id" ] || ! ssh "$SERVER" "docker image inspect campusflow-build:$commit" > /dev/null 2>&1; then
  docker save "campusflow-api:$commit" "campusflow-build:$commit" | gzip -1 | ssh "$SERVER" docker load
fi
# Build and verify the web app before the database or containers change.
web=$(mktemp -d)
trap 'rm -rf "$web"' EXIT
npm run build:shared > /dev/null
node scripts/build-hosted-web.mjs "$web/out" > /dev/null
# A unique directory per upload: redeploying a commit never touches the live release.
web_release="$commit-$(date -u +%Y%m%dT%H%M%SZ)"
ssh "$SERVER" "install -d -m 755 /var/www/campusflow-site/releases/$web_release.partial"
tar -C "$web/out" -czf - . | ssh "$SERVER" "tar -xzf - --no-same-owner -m -C /var/www/campusflow-site/releases/$web_release.partial && chmod -R a+rX,go-w /var/www/campusflow-site/releases/$web_release.partial && mv /var/www/campusflow-site/releases/$web_release.partial /var/www/campusflow-site/releases/$web_release"

release="/opt/campusflow/releases/$commit"
ssh "$SERVER" "install -d -m 700 '$release'"
scp -q ops/vps/compose.yaml ops/vps/*.sh "$SERVER:$release/"

ssh "$SERVER" COMMIT="$commit" RELEASE="$release" WEB_RELEASE="$web_release" bash -s <<'REMOTE'
set -euo pipefail
exec 9> /run/campusflow.lock
flock -n 9 || { echo "Another CampusFlow operation holds the lock" >&2; exit 1; }
cd /opt/campusflow
chmod 700 "$RELEASE"/*.sh
previous=$(docker inspect --format '{{.Config.Image}}' campusflow-api 2>/dev/null || true)
ready() { for _ in $(seq 1 30); do curl -fsS --max-time 4 http://127.0.0.1:8780/health/ready > /dev/null 2>&1 && return 0; sleep 2; done; return 1; }

# Preflight: the new image must accept the server's current configuration before anything changes.
# (2026-10-21: an env edited ahead of its code made both the new and the rollback image refuse to start.)
docker run --rm --network none --read-only --env-file /etc/campusflow/api.env --entrypoint node "campusflow-api:$COMMIT"   -e "require('/app/apps/api/dist/src/runtime-config.js').runtimeConfig()" ||
  { echo "Preflight failed: /etc/campusflow/api.env is not valid for campusflow-api:$COMMIT; nothing was changed." >&2; exit 1; }
FLOCK_HELD=1 "$RELEASE/backup.sh"
docker run --rm --network host --env-file /etc/campusflow/api.env --workdir /app/apps/api \
  "campusflow-build:$COMMIT" /app/node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

rollback() {
  trap - ERR HUP INT TERM
  echo "Deploy of $COMMIT failed; restoring ${previous:-nothing}" >&2
  docker logs --tail 30 campusflow-api >&2 2>&1 || true
  echo "Latest backup: $(ls -t /var/backups/campusflow/campusflow-*.dump 2>/dev/null | head -1 || true)" >&2
  if [ -z "$previous" ]; then echo "ROLLBACK IMPOSSIBLE: no previous image; service down" >&2; exit 1; fi
  CAMPUSFLOW_IMAGE="$previous" docker compose -p campusflow -f /opt/campusflow/compose.yaml up -d --force-recreate || true
  if ready; then echo "Rolled back to $previous and ready" >&2; else echo "ROLLBACK FAILED: $previous is not ready; service down" >&2; fi
  exit 1
}
trap rollback ERR
trap rollback HUP INT TERM
CAMPUSFLOW_IMAGE="campusflow-api:$COMMIT" docker compose -p campusflow -f "$RELEASE/compose.yaml" up -d --force-recreate
ready
# Accept the release: cron and future rollbacks use these files from now on.
cp -p "$RELEASE"/compose.yaml "$RELEASE"/*.sh /opt/campusflow/
echo "$COMMIT" > /opt/campusflow/current
trap - ERR HUP INT TERM
# Point the web app at this release only now that its API is serving (atomic rename).
site=/var/www/campusflow-site
ln -sfn "releases/$WEB_RELEASE" "$site/campusflow.next" && mv -T "$site/campusflow.next" "$site/campusflow"
# Prune by name (UTC upload stamp), never the live target; drop failed uploads.
live=$(basename "$(readlink -f "$site/campusflow")")
find "$site/releases" -maxdepth 1 -name '*.partial' -mmin +60 -exec rm -rf -- {} + || true
ls -1 "$site/releases" | grep -v '\.partial$' | sort -t- -k2 | head -n -3 | grep -vx "$live" | sed "s#^#$site/releases/#" | xargs -r rm -rf -- || true
# Keep the current and previous images only; never prune anything else.
keep="campusflow-api:$COMMIT campusflow-build:$COMMIT $previous ${previous/campusflow-api/campusflow-build}"
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^campusflow-(api|build):' |
  while read -r image; do case " $keep " in *" $image "*) ;; *) docker rmi "$image" > /dev/null || true;; esac; done || true
ls -1dt /opt/campusflow/releases/* | tail -n +4 | xargs -r rm -rf -- || true
echo "ready campusflow-api:$COMMIT"
REMOTE

fail() { echo "Public smoke failed: $1. The new container is serving; run deploy for the previous commit or fix forward." >&2; exit 1; }
curl -fsS --max-time 10 "$PUBLIC_URL/health/ready" || fail "readiness"; echo
curl -fsS --max-time 10 "$PUBLIC_URL/auth/capability" || fail "capability"; echo
WEB_URL=${WEB_URL:-https://workout.vakula-dev.com/campusflow/}
headers=$(curl -fsS -D - -o "$web/discard" --max-time 10 "$WEB_URL") || fail "web app"
grep -qi '^cross-origin-embedder-policy: require-corp' <<< "$headers" || fail "web isolation headers"
page=$(curl -fsS --max-time 10 "$WEB_URL") || fail "web app body"
entry=$(grep -o '/campusflow/_expo/static/js/web/entry-[a-f0-9]*\.js' <<< "$page" | head -1 || true)
[ -n "$entry" ] || fail "web entry bundle"
bundle=$(curl -fsS -D - -o "$web/discard" --max-time 10 "${WEB_URL%/campusflow/}$entry") || fail "entry bundle"
grep -qi '^cross-origin-embedder-policy: require-corp' <<< "$bundle" || fail "bundle isolation headers"
code=$(curl -s -o "$web/discard" -w '%{http_code}' --max-time 10 "$PUBLIC_URL/today")
[ "$code" = 401 ] || fail "anonymous /today returned $code"
echo "deployed $commit"

# Over-the-air update for installed apps (ADR 021), only after the API it calls is serving.
set +e
node scripts/publish-update.mjs --out "$web/updates" --commit "$commit"
published=$?
set -e
if [ "$published" = 3 ]; then
  echo "Native code changed since the installed app runtime: no over-the-air update was published." >&2
  echo "Bump the runtime, build a new APK and publish it (docs/development/app-updates.md)." >&2
elif [ "$published" = 0 ]; then
  SERVER="$SERVER" ops/vps/upload-update.sh "$web/updates"
else
  echo "Publishing the over-the-air update failed; the API and web app are deployed." >&2
  exit 1
fi
