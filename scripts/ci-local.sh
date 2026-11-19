#!/usr/bin/env bash
# The CampusFlow CI pipeline (ADR 028). Runs every check in Linux containers and
# reports the result to GitHub as the `local-verify` commit status, which branch
# protection on main requires.
#
# The server runs it automatically through ops/ci/server-ci.sh; a maintainer can
# run the same pipeline by hand on any machine with Docker. GitHub Actions is not
# used: the owner's account is billing-locked, which also blocks self-hosted runners.
#
# Usage:  scripts/ci-local.sh <pr-number>      # tests GitHub's merge ref for the PR
#         scripts/ci-local.sh --ref <git-ref>  # tests any ref, e.g. origin/main
# Add --no-status to run without posting a status.
# Needs: bash (Git Bash on Windows is fine), git, gh signed in with repo access
# (or GH_TOKEN), and Docker. Node is not needed on the host: everything runs in node:22.
# Optional: CI_RUNNER names the machine in the status text; CI_NODE_LIMITS adds
# docker run flags (e.g. "--cpus 1.5 --memory 2g") to the test container.
set -euo pipefail

REPO="${CI_LOCAL_REPO:-ArturZZerg/AUCSC325-TeamSpirit}"
CONTEXT="local-verify"
RUNNER="${CI_RUNNER:-locally}"
read -r -a NODE_LIMITS <<<"${CI_NODE_LIMITS:-}"
NODE_IMAGE="node:22-bookworm"
PG_IMAGE="postgres:17-alpine"
PG_NAME="campusflow-ci-pg"
API_NAME="campusflow-ci-api"
PG_PORT=55435                   # the restore rehearsal refuses 5432
API_PORT=8780
# Git Bash on Windows rewrites /paths in arguments; docker must get them unchanged.
docker() { MSYS_NO_PATHCONV=1 command docker "$@"; }

pr="" ref="" post=1
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) ref="$2"; shift 2 ;;
    --no-status) post=0; shift ;;
    *) pr="$1"; shift ;;
  esac
done
[ -n "$pr$ref" ] || { echo "usage: $0 <pr-number> | --ref <git-ref> [--no-status]" >&2; exit 2; }

root="$(git rev-parse --show-toplevel)"
if [ -n "$pr" ]; then
  git -C "$root" fetch -q origin "+refs/pull/$pr/merge:refs/ci-local/$pr/merge"
  ref="refs/ci-local/$pr/merge"
  sha="$(gh pr view "$pr" -R "$REPO" --json headRefOid --jq .headRefOid)"
else
  sha="$(git -C "$root" rev-parse "$ref")"
fi

tmp="$(mktemp -d)"
log="$tmp/ci.log"
src="$tmp/source.tar"
status() { # state description
  [ "$post" = 1 ] || return 0
  gh api -X POST "repos/$REPO/statuses/$sha" -f state="$1" -f context="$CONTEXT" -f description="${2:0:140}" >/dev/null
}
cleanup() {
  docker rm -f "$API_NAME" "$PG_NAME" >/dev/null 2>&1 || true
}
step="setup"
finish() {
  code=$?
  cleanup
  if [ "$code" = 0 ]; then status success "All CI steps passed ($RUNNER, $NODE_IMAGE)"; echo "PASS $sha (log: $log)"
  else status failure "Failed at: $step"; echo "FAIL at '$step' ($sha). Log: $log" >&2; fi
}
trap finish EXIT
run() { step="$1"; shift; echo "==> $step"; "$@" >>"$log" 2>&1 || { tail -80 "$log" >&2; return 1; }; }

status pending "Running CI steps ($RUNNER)"
echo "Testing $ref (status on $sha), log: $log"
git -C "$root" archive --format=tar -o "$src" "$ref"
src_native="$(cygpath -w "$src" 2>/dev/null || echo "$src")"

cleanup
# Postgres listens on 127.0.0.1:55435 inside its container. The node and API
# containers join its network namespace to share that loopback without publishing a port.
run "start postgres" docker run -d --name "$PG_NAME" \
  -e POSTGRES_USER=campusflow -e POSTGRES_PASSWORD=campusflow_ci -e POSTGRES_DB=campusflow_test "$PG_IMAGE" -p "$PG_PORT"
for _ in $(seq 1 30); do docker exec "$PG_NAME" pg_isready -p "$PG_PORT" -U campusflow -d campusflow_test >/dev/null 2>&1 && break; sleep 2; done
DATABASE_URL="postgresql://campusflow:campusflow_ci@127.0.0.1:$PG_PORT/campusflow_test"

# npm ci, db:generate, db:migrate, npm run check, build:web and the restore rehearsal.
# Markers ("==> name") let the host report which step failed.
node_steps='
set -euo pipefail
mark() { echo "==> $1" >&2; }
mkdir /work && tar -x -C /work -f /source.tar && cd /work
mark "npm ci";            npm ci
mark "db:generate";       npm run db:generate
mark "db:migrate";        npm run db:migrate
mark "npm run check";     npm run check
mark "build:web";         npm run build:web -w @campusflow/mobile
mark "install pg 17 client"
apt-get update -qq && apt-get install -y -qq postgresql-common >/dev/null
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null && apt-get install -y -qq postgresql-client-17 >/dev/null
mark "release:restore-rehearsal"
REHEARSAL_DATABASE_URL="$DATABASE_URL" PG_BIN=/usr/lib/postgresql/17/bin npm run release:restore-rehearsal
'
step="node steps"; echo "==> node steps in $NODE_IMAGE (npm ci, db, check, build:web, restore rehearsal)"
if ! docker run --rm "${NODE_LIMITS[@]}" --network "container:$PG_NAME" -e CI=true -e "DATABASE_URL=$DATABASE_URL" \
     --mount "type=bind,source=$src_native,target=/source.tar,readonly" "$NODE_IMAGE" bash -c "$node_steps" >>"$log" 2>&1; then
  step="$(grep -o '^==> .*' "$log" | tail -1 | cut -c5-)"
  tail -80 "$log" >&2; exit 1
fi

# Build the production API image and check it starts isolated and read-only.
run "build API container" docker build -f ops/vps/Dockerfile --target runtime -t campusflow-api:ci - <"$src"
check="$tmp/runtime-dependencies.mjs"
git -C "$root" show "$ref:scripts/runtime-dependencies.mjs" >"$check"
run "runtime dependency check" docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --entrypoint node \
  --mount "type=bind,source=$(cygpath -w "$check" 2>/dev/null || echo "$check"),target=/check.mjs,readonly" campusflow-api:ci /check.mjs
AUTH_RATE_KEY="$(head -c 32 /dev/urandom | base64)"
# The API listens on HOST=127.0.0.1 inside the shared namespace, so the probes
# below run inside it.
run "start API container" docker run -d --name "$API_NAME" --network "container:$PG_NAME" --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 768m --pids-limit 128 --env "DATABASE_URL=$DATABASE_URL" --env "AUTH_RATE_KEY=$AUTH_RATE_KEY" \
  --env NODE_ENV=production --env HOST=127.0.0.1 --env PORT=$API_PORT --env AUTH_SOURCE_MODE=loopback \
  --env CORS_ORIGIN=https://app.example.test --env REGISTRATION_MODE=closed \
  --env RECOVERY_DELIVERY=disabled --env CANVAS_MODE=disabled campusflow-api:ci
probe() { # GET a loopback URL from inside the API container's namespace; fails on non-2xx
  docker exec "$API_NAME" node -e 'fetch(process.argv[1],{signal:AbortSignal.timeout(4000)}).then(async r=>{if(!r.ok)process.exit(1);process.stdout.write(await r.text())}).catch(()=>process.exit(1))' "$1"
}
step="API container health"; echo "==> $step"
ready=0
for _ in $(seq 1 20); do probe "http://127.0.0.1:$API_PORT/health/ready" >/dev/null 2>&1 && { ready=1; break; }; sleep 1; done
[ "$ready" = 1 ] || { docker logs "$API_NAME" 2>&1 | tail -40 >&2; exit 1; }
step="auth capability check"; echo "==> $step"
capability="$(probe "http://127.0.0.1:$API_PORT/auth/capability")"
echo "$capability" | grep -q '"registration":"closed"' && echo "$capability" | grep -q '"verificationAvailable":false'
step="done"
