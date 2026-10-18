#!/usr/bin/env bash
# Deploy the reviewed main commit to the owner's server (ADR 013, ADR 017).
# Run locally from a clean checkout of main. Builds images locally, transfers
# them, backs up the database, migrates, recreates the container and smoke-tests
# it, rolling back to the previous image if the new one is not ready.
#
#   SERVER=root@95.217.239.38 [BUILD_CA=path/to/public-ca.pem] ops/vps/deploy.sh
set -euo pipefail
SERVER=${SERVER:?Set SERVER, e.g. root@host}
PUBLIC_URL=${PUBLIC_URL:-https://workout.vakula-dev.com/campusflow-api}
cd "$(git rev-parse --show-toplevel)"

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "Deploy only from main" >&2; exit 1; }
git diff --quiet HEAD -- || { echo "Working tree has tracked changes" >&2; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "HEAD is not origin/main" >&2; exit 1; }
commit=$(git rev-parse --short=12 HEAD)

secret=()
[ -n "${BUILD_CA:-}" ] && secret=(--secret "id=build_ca,src=$BUILD_CA")
for target in build runtime; do
  name=$([ "$target" = build ] && echo campusflow-build || echo campusflow-api)
  docker image inspect "$name:$commit" > /dev/null 2>&1 ||
    docker build -q "${secret[@]}" -f ops/vps/Dockerfile --target "$target" -t "$name:$commit" .
done

if ! ssh "$SERVER" "docker image inspect campusflow-api:$commit campusflow-build:$commit" > /dev/null 2>&1; then
  docker save "campusflow-api:$commit" "campusflow-build:$commit" | gzip -1 | ssh "$SERVER" docker load
fi
scp -q ops/vps/compose.yaml ops/vps/backup.sh ops/vps/healthcheck.sh "$SERVER:/opt/campusflow/"

ssh "$SERVER" COMMIT="$commit" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/campusflow
chmod 700 backup.sh healthcheck.sh
previous=$(docker inspect --format '{{.Config.Image}}' campusflow-api 2>/dev/null || true)
./backup.sh
docker run --rm --network host --env-file /etc/campusflow/api.env --workdir /app/apps/api \
  "campusflow-build:$COMMIT" npx prisma migrate deploy --schema prisma/schema.prisma
CAMPUSFLOW_IMAGE="campusflow-api:$COMMIT" docker compose -p campusflow -f compose.yaml up -d --force-recreate
for _ in $(seq 1 30); do
  curl -fsS --max-time 4 http://127.0.0.1:8780/health/ready > /dev/null && { echo "ready campusflow-api:$COMMIT"; exit 0; }
  sleep 2
done
echo "not ready; rolling back to ${previous:-nothing}" >&2
docker logs --tail 30 campusflow-api >&2 || true
[ -n "$previous" ] && CAMPUSFLOW_IMAGE="$previous" docker compose -p campusflow -f compose.yaml up -d --force-recreate
exit 1
REMOTE

curl -fsS --max-time 10 "$PUBLIC_URL/health/ready"; echo
curl -fsS --max-time 10 "$PUBLIC_URL/auth/capability"; echo
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL/today")
[ "$code" = 401 ] || { echo "anonymous /today returned $code, expected 401" >&2; exit 1; }
echo "deployed $commit"
