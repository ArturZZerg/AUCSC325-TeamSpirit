#!/usr/bin/env bash
# Owner-triggered deploy from the server itself (ADR 017, ADR 028).
#   ssh root@<server> /opt/campusflow-ci/server-deploy.sh
# Deploys the current head of main, and only when server CI has posted a
# successful `local-verify` on that exact commit. It runs the unchanged
# ops/vps/deploy.sh inside node:22 (the host's Node is older and shared), with
# the host Docker daemon and an SSH connection back to this host, so the deploy
# keeps its backup, migration, rollback and smoke-test steps.
set -euo pipefail

REPO="${CI_LOCAL_REPO:-ArturZZerg/AUCSC325-TeamSpirit}"
STATE_DIR="${CI_STATE_DIR:-/var/lib/campusflow-ci}"
TOKEN_FILE="${CI_TOKEN_FILE:-/etc/campusflow-ci/github-token}"
GH_TOKEN="$(tr -d '[:space:]' <"$TOKEN_FILE")"
export GH_TOKEN

work="$STATE_DIR/deploy"
[ -d "$work/.git" ] || git clone -q "https://github.com/$REPO.git" "$work"
git -C "$work" fetch -q origin main
git -C "$work" checkout -q -B main origin/main
git -C "$work" reset -q --hard origin/main
git -C "$work" clean -qfdx
sha="$(git -C "$work" rev-parse HEAD)"

state="$(gh api "repos/$REPO/commits/$sha/statuses?per_page=100" --jq '[.[] | select(.context == "local-verify")] | first | .state // "missing"')"
[ "$state" = success ] || { echo "main $sha has local-verify=$state; deploy refused. Wait for server CI or fix main." >&2; exit 1; }
echo "Deploying main $sha (local-verify success)"

# Wait for a CI run in progress: the two together would starve the live API of memory.
exec 9>/run/campusflow-ci.lock
flock 9

docker run --rm --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /usr/bin/docker:/usr/bin/docker:ro \
  -v /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins:ro \
  -v /root/.ssh:/root/.ssh:ro \
  -v "$work:/work" -w /work \
  -e SERVER=root@127.0.0.1 \
  node:22-bookworm bash -c 'git config --global --add safe.directory /work && npm ci --no-audit --no-fund --loglevel=error && bash ops/vps/deploy.sh'
