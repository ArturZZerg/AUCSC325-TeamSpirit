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
[ -z "$(git status --porcelain --untracked-files=all -- package.json package-lock.json tsconfig.base.json apps/api apps/mobile/package.json packages ops/vps)" ] ||
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
release="/opt/campusflow/releases/$commit"
ssh "$SERVER" "install -d -m 700 '$release'"
scp -q ops/vps/compose.yaml ops/vps/*.sh "$SERVER:$release/"

ssh "$SERVER" COMMIT="$commit" RELEASE="$release" bash -s <<'REMOTE'
set -euo pipefail
exec 9> /run/campusflow.lock
flock -n 9 || { echo "Another CampusFlow operation holds the lock" >&2; exit 1; }
cd /opt/campusflow
chmod 700 "$RELEASE"/*.sh
previous=$(docker inspect --format '{{.Config.Image}}' campusflow-api 2>/dev/null || true)
ready() { for _ in $(seq 1 30); do curl -fsS --max-time 4 http://127.0.0.1:8780/health/ready > /dev/null 2>&1 && return 0; sleep 2; done; return 1; }

FLOCK_HELD=1 "$RELEASE/backup.sh"
docker run --rm --network host --env-file /etc/campusflow/api.env --workdir /app/apps/api \
  "campusflow-build:$COMMIT" node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

rollback() {
  trap - ERR
  echo "Deploy of $COMMIT failed; restoring ${previous:-nothing}" >&2
  docker logs --tail 30 campusflow-api >&2 2>&1 || true
  echo "Latest backup: $(ls -t /var/backups/campusflow/campusflow-*.dump 2>/dev/null | head -1 || true)" >&2
  if [ -z "$previous" ]; then echo "ROLLBACK IMPOSSIBLE: no previous image; service down" >&2; exit 1; fi
  CAMPUSFLOW_IMAGE="$previous" docker compose -p campusflow -f /opt/campusflow/compose.yaml up -d --force-recreate || true
  if ready; then echo "Rolled back to $previous and ready" >&2; else echo "ROLLBACK FAILED: $previous is not ready; service down" >&2; fi
  exit 1
}
trap rollback ERR
CAMPUSFLOW_IMAGE="campusflow-api:$COMMIT" docker compose -p campusflow -f "$RELEASE/compose.yaml" up -d --force-recreate
ready
# Accept the release: cron and future rollbacks use these files from now on.
cp -p "$RELEASE"/compose.yaml "$RELEASE"/*.sh /opt/campusflow/
echo "$COMMIT" > /opt/campusflow/current
trap - ERR
# Keep the current and previous images only; never prune anything else.
keep="campusflow-api:$COMMIT campusflow-build:$COMMIT $previous ${previous/campusflow-api/campusflow-build}"
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^campusflow-(api|build):' |
  while read -r image; do case " $keep " in *" $image "*) ;; *) docker rmi "$image" > /dev/null || true;; esac; done
ls -1dt /opt/campusflow/releases/* | tail -n +4 | xargs -r rm -rf --
echo "ready campusflow-api:$COMMIT"
REMOTE

fail() { echo "Public smoke failed: $1. The new container is serving; run deploy for the previous commit or fix forward." >&2; exit 1; }
curl -fsS --max-time 10 "$PUBLIC_URL/health/ready" || fail "readiness"; echo
curl -fsS --max-time 10 "$PUBLIC_URL/auth/capability" || fail "capability"; echo
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL/today")
[ "$code" = 401 ] || fail "anonymous /today returned $code"
echo "deployed $commit"
