#!/usr/bin/env bash
# Deploy from the server itself (ADR 017, ADR 028, ADR 029).
#   ssh root@<server> /opt/campusflow-ci/server-deploy.sh
# The owner runs it by hand; server-ci.sh starts it as its own systemd unit
# (campusflow-deploy, own timeout) after an `automerge` PR is merged.
# Deploys the current head of main, and only when CI has posted a successful
# `local-verify` on that exact commit. It runs the unchanged ops/vps/deploy.sh
# inside node:22 (the host's Node is older and shared), with the host Docker daemon
# and an SSH connection back to this host, so the deploy keeps its backup,
# migration, rollback and smoke-test steps.
#
# Either way it then tells the PRs that server CI merged and queued
# ($STATE_DIR/deploy-queue) whether they are live, and clears the queue. A refused
# deploy (main not verified yet) keeps the queue for the next attempt.
set -euo pipefail

REPO="${CI_LOCAL_REPO:-ArturZZerg/AUCSC325-TeamSpirit}"
STATE_DIR="${CI_STATE_DIR:-/var/lib/campusflow-ci}"
TOKEN_FILE="${CI_TOKEN_FILE:-/etc/campusflow-ci/github-token}"
LOG_HINT="${CI_DEPLOY_LOG:-the output of server-deploy.sh}"
GH_TOKEN="$(tr -d '[:space:]' <"$TOKEN_FILE")"
export GH_TOKEN
queue="$STATE_DIR/deploy-queue"

# Posts $1 on every queued PR, then clears the queue.
notify_queue() {
  [ -s "$queue" ] || return 0
  local p
  for p in $(sort -un "$queue"); do
    gh api -X POST "repos/$REPO/issues/$p/comments" -f body="$1" >/dev/null || true
  done
  rm -f "$queue"
}

work="$STATE_DIR/deploy"
[ -d "$work/.git" ] || git clone -q "https://github.com/$REPO.git" "$work"
git -C "$work" fetch -q origin main
git -C "$work" checkout -q -B main origin/main
git -C "$work" reset -q --hard origin/main
git -C "$work" clean -qfdx
sha="$(git -C "$work" rev-parse HEAD)"

state="$(gh api "repos/$REPO/commits/$sha/statuses?per_page=100" --jq '[.[] | select(.context == "local-verify")] | first | .state // "missing"')"
[ "$state" = success ] || { echo "main $sha has local-verify=$state; deploy refused. Wait for CI or fix main." >&2; exit 1; }
echo "Deploying main $sha (local-verify success)"

# Wait for a CI run in progress: the two together would starve the live API of memory.
exec 9>/run/campusflow-ci.lock
flock 9

code=0
docker run --rm --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /usr/bin/docker:/usr/bin/docker:ro \
  -v /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins:ro \
  -v /root/.ssh:/root/.ssh:ro \
  -v "$work:/work" -w /work \
  -e SERVER=root@127.0.0.1 \
  node:22-bookworm bash -c 'git config --global --add safe.directory /work && npm ci --no-audit --no-fund --loglevel=error && bash ops/vps/deploy.sh' || code=$?

if [ "$code" = 0 ]; then
  notify_queue "Deployed to production with \`main\` $sha."
else
  notify_queue "The production deploy of \`main\` $sha failed (exit $code). \`ops/vps/deploy.sh\` rolls back a failed deploy, so the previous release should still be live. The owner can check $LOG_HINT on the server and retry with \`server-deploy.sh\`."
fi
exit "$code"
