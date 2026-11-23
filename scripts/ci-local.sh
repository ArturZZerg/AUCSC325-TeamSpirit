#!/usr/bin/env bash
# The CampusFlow CI pipeline (ADR 028). Runs every check in Linux containers and
# reports the result to GitHub as the `local-verify` commit status, which branch
# protection on main requires.
#
# The server runs it automatically through ops/ci/server-ci.sh; a maintainer can
# run the same pipeline by hand on any machine with Docker. GitHub Actions is not
# used: the owner's account is billing-locked, which also blocks self-hosted runners.
#
# Usage:  scripts/ci-local.sh <pr-number>      # tests the PR merged into the current main
#         scripts/ci-local.sh --ref <git-ref>  # tests any ref, e.g. origin/main
# Add --no-status to run without posting a status.
# Needs: bash (Git Bash on Windows is fine), git, gh signed in with repo access
# (or GH_TOKEN), and Docker. Node is not needed on the host: everything runs in node:22.
# Optional: CI_RUNNER names the machine in the status text; CI_NODE_LIMITS adds
# docker run flags (e.g. "--cpus 1.5 --memory 2g") to the test container;
# JEST_TEST_TIMEOUT (ms) is passed to it for slow hosts.
# CI_PARALLEL=1 (a developer PC, ADR 029) runs lint, typechecks, tests and builds at the
# same time and gives mobile Jest JEST_MAX_WORKERS (default 6) workers and the 30 s test limit. The default is
# serial, for the capped server. Either way every step runs and must pass.
#
# A PR that changes only Markdown or files under docs/ skips the steps: nothing they
# check reads those files. A passing PR's status names the main it was merged into
# ("main=<sha>"), so server CI can merge a PR tested on another machine (ADR 029).
set -euo pipefail

REPO="${CI_LOCAL_REPO:-ArturZZerg/AUCSC325-TeamSpirit}"
CONTEXT="local-verify"
RUNNER="${CI_RUNNER:-locally}"
read -r -a NODE_LIMITS <<<"${CI_NODE_LIMITS:-}"
NODE_IMAGE="node:22-bookworm"
CI_IMAGE="campusflow-ci-node:22-pg17"   # NODE_IMAGE plus the PostgreSQL 17 client
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
status() { # state description
  [ "$post" = 1 ] || return 0
  gh api -X POST "repos/$REPO/statuses/$sha" -f state="$1" -f context="$CONTEXT" -f description="${2:0:140}" >/dev/null
}
if [ -n "$pr" ]; then
  # Test the PR merged into the current main. The merge is built here, not taken from
  # GitHub's refs/pull/N/merge: GitHub rebuilds that lazily and can leave it on an old main.
  git -C "$root" fetch -q origin "+refs/heads/main:refs/ci-local/main" "+refs/pull/$pr/head:refs/ci-local/$pr/head"
  sha="$(git -C "$root" rev-parse "refs/ci-local/$pr/head")"
  if ! tree="$(git -C "$root" merge-tree --write-tree refs/ci-local/main "$sha" 2>/dev/null | head -1)" || [ -z "$tree" ]; then
    status failure "Cannot test: the PR does not merge cleanly into main. Rebase or merge main."
    echo "FAIL at 'merge into main' ($sha): conflicts with main" >&2; exit 1
  fi
  merge="$(GIT_AUTHOR_NAME=campusflow-ci GIT_AUTHOR_EMAIL=ci@campusflow.invalid GIT_COMMITTER_NAME=campusflow-ci \
    GIT_COMMITTER_EMAIL=ci@campusflow.invalid git -C "$root" commit-tree "$tree" -p refs/ci-local/main -p "$sha" -m "CI merge of #$pr into main")"
  git -C "$root" update-ref "refs/ci-local/$pr/merge" "$merge"
  ref="refs/ci-local/$pr/merge"
else
  sha="$(git -C "$root" rev-parse "$ref")"
fi

main_sha="$(git -C "$root" rev-parse -q --verify refs/ci-local/main 2>/dev/null || true)"
docs_only=0
if [ -n "$pr" ]; then
  changed="$(git -C "$root" diff --name-only refs/ci-local/main "$merge")"
  if [ -n "$changed" ] && ! grep -qvE '^docs/|\.md$' <<<"$changed"; then docs_only=1; fi
fi
parallel="${CI_PARALLEL:-0}"

tmp="$(mktemp -d)"
log="$tmp/ci.log"
src="$tmp/source.tar"
cleanup() {
  docker rm -f "$API_NAME" "$PG_NAME" >/dev/null 2>&1 || true
}
step="setup"
finish() {
  code=$?
  cleanup
  local tested="${pr:+ main=$main_sha}" passed="All CI steps passed ($RUNNER, $NODE_IMAGE)"
  [ "$docs_only" = 1 ] && passed="Docs-only change: CI steps skipped ($RUNNER)"
  if [ "$code" = 0 ]; then status success "$passed$tested"; echo "PASS $sha (log: $log)"
  else status failure "Failed at: $step"; echo "FAIL at '$step' ($sha). Log: $log" >&2; fi
}
trap finish EXIT
run() { step="$1"; shift; echo "==> $step"; "$@" >>"$log" 2>&1 || { tail -80 "$log" >&2; return 1; }; }

status pending "Running CI steps ($RUNNER)"
echo "Testing $ref (status on $sha), log: $log"
if [ "$docs_only" = 1 ]; then echo "Only Markdown and docs/ changed; CI steps skipped."; step="done"; exit 0; fi
git -C "$root" archive --format=tar -o "$src" "$ref"
src_native="$(cygpath -w "$src" 2>/dev/null || echo "$src")"

# In parallel mode the production API image builds on the host while the node steps run.
api_build_rc="$tmp/api-build.rc"
if [ "$parallel" = 1 ]; then
  ( docker build -f ops/vps/Dockerfile --target runtime -t campusflow-api:ci - <"$src" >"$tmp/api-build.log" 2>&1; echo $? >"$api_build_rc" ) &
  api_build_pid=$!
fi

cleanup
# Postgres listens on 127.0.0.1:55435 inside its container. The node and API
# containers join its network namespace to share that loopback without publishing a port.
run "start postgres" docker run -d --name "$PG_NAME" \
  -e POSTGRES_USER=campusflow -e POSTGRES_PASSWORD=campusflow_ci -e POSTGRES_DB=campusflow_test "$PG_IMAGE" -p "$PG_PORT"
# node:22 plus the PostgreSQL 17 client for the restore rehearsal, built once and then
# taken from the Docker layer cache instead of running apt on every run.
run "CI node image" docker build -t "$CI_IMAGE" - <<DOCKERFILE
FROM $NODE_IMAGE
RUN apt-get update -qq && apt-get install -y -qq postgresql-common >/dev/null \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null \
 && apt-get install -y -qq postgresql-client-17 >/dev/null && rm -rf /var/lib/apt/lists/*
DOCKERFILE
for _ in $(seq 1 30); do docker exec "$PG_NAME" pg_isready -p "$PG_PORT" -U campusflow -d campusflow_test >/dev/null 2>&1 && break; sleep 2; done
DATABASE_URL="postgresql://campusflow:campusflow_ci@127.0.0.1:$PG_PORT/campusflow_test"

# npm ci, db:generate, db:migrate, npm run check, build:web and the restore rehearsal.
# Markers ("==> name") let the host report which step failed. In parallel mode the parts
# of `npm run check` and build:web run at once; each job's output follows in order.
node_steps='
set -euo pipefail
mark() { echo "==> $1 (+${SECONDS}s)" >&2; }
mkdir /work && tar -x -C /work -f /source.tar && cd /work
mark "npm ci";            npm ci
mark "db:generate";       npm run db:generate
mark "db:migrate";        npm run db:migrate
if [ "$CI_PARALLEL" = 1 ]; then
  mark "build:shared";    npm run build:shared
  jobs="lint typecheck test-packages test-api-db test-api-unit test-mobile test-scripts build-api build-web"
  # API suites that use PostgreSQL run one at a time against the one test database;
  # the rest run on several workers at the same time.
  api_db() { grep -lE "databaseSuite|DATABASE_URL|PrismaClient\(" apps/api/test/*.spec.ts | sed "s#^apps/api/##"; }
  job() { case "$1" in
    lint) npm run lint ;;
    typecheck) npm run typecheck --workspaces --if-present ;;
    test-packages) npm run test -w @campusflow/contracts -- --maxWorkers=2 && npm run test -w @campusflow/domain -- --maxWorkers=2 ;;
    test-api-db) cd apps/api && npx jest --runInBand $(cd /work && api_db) ;;
    test-api-unit) cd apps/api && npx jest --maxWorkers=4 --testPathIgnorePatterns "$(cd /work && api_db | paste -sd "|")" ;;
    # A leaked query-cache timer can keep Jest alive for minutes after the results.
    test-mobile) npm run test -w @campusflow/mobile -- --forceExit ;;
    test-scripts) npm run test:android-build && npm run test:ios-preview && npm run test:release ;;
    build-api) npm run build -w @campusflow/api ;;
    build-web) npm run build:web -w @campusflow/mobile ;;
  esac; }
  mark "check and build:web (parallel: $jobs)"
  for j in $jobs; do ( set +e; s=$SECONDS; job "$j" >"/tmp/job-$j.log" 2>&1; echo $? >"/tmp/job-$j.rc"; echo $((SECONDS - s)) >"/tmp/job-$j.time" ) & done
  wait
  failed=""
  for j in $jobs; do
    echo "---- $j ($(cat "/tmp/job-$j.time")s)"; cat "/tmp/job-$j.log"
    [ "$(cat "/tmp/job-$j.rc")" = 0 ] || failed="${failed:-$j}"
  done
  if [ -n "$failed" ]; then mark "$failed"; exit 1; fi
else
  mark "npm run check";   npm run check
  mark "build:web";       npm run build:web -w @campusflow/mobile
fi
mark "release:restore-rehearsal"
REHEARSAL_DATABASE_URL="$DATABASE_URL" PG_BIN=/usr/lib/postgresql/17/bin npm run release:restore-rehearsal
'
step="node steps"; echo "==> node steps in $NODE_IMAGE (npm ci, db, check, build:web, restore rehearsal)"
# The npm download cache and Prisma's engine downloads survive between runs in named
# volumes. npm ci checks every package against the lockfile's integrity hashes, and
# Prisma checks each engine against its published checksum, so a run cannot poison them.
if ! docker run --rm "${NODE_LIMITS[@]}" --network "container:$PG_NAME" -e CI=true -e "JEST_TEST_TIMEOUT=${JEST_TEST_TIMEOUT:-$([ "$parallel" = 1 ] && echo 30000 || true)}" -e "DATABASE_URL=$DATABASE_URL" \
     -e "CI_PARALLEL=$parallel" -e "JEST_MAX_WORKERS=${JEST_MAX_WORKERS:-$([ "$parallel" = 1 ] && echo 6 || true)}" \
     --mount "type=volume,source=campusflow-ci-npm-cache,target=/root/.npm" \
     --mount "type=volume,source=campusflow-ci-prisma-cache,target=/root/.cache/prisma" \
     --mount "type=bind,source=$src_native,target=/source.tar,readonly" "$CI_IMAGE" bash -c "$node_steps" >>"$log" 2>&1; then
  step="$(grep -o '^==> .*' "$log" | tail -1 | cut -c5- | sed 's/ (+[0-9]*s)$//')"
  tail -80 "$log" >&2; exit 1
fi

# Build the production API image and check it starts isolated and read-only.
if [ "$parallel" = 1 ]; then
  step="build API container"; echo "==> $step"
  wait "$api_build_pid" || true
  cat "$tmp/api-build.log" >>"$log"
  [ "$(cat "$api_build_rc" 2>/dev/null)" = 0 ] || { tail -80 "$tmp/api-build.log" >&2; exit 1; }
else
  run "build API container" docker build -f ops/vps/Dockerfile --target runtime -t campusflow-api:ci - <"$src"
fi
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
