#!/usr/bin/env bash
# Install or update server CI from a clean checkout of main (ADR 028).
#   SERVER=root@95.217.239.38 ops/ci/install.sh
# Copies the pipeline to /opt/campusflow-ci, so PRs under test can never change
# the runner, and enables the polling timer. Re-run it after CI scripts change on main.
set -euo pipefail
SERVER=${SERVER:?Set SERVER, e.g. root@host}
cd "$(git rev-parse --show-toplevel)"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "Install only from main" >&2; exit 1; }
[ -z "$(git status --porcelain -- scripts/ci-local.sh ops/ci)" ] || { echo "ops/ci or ci-local.sh has local changes" >&2; exit 1; }

ssh "$SERVER" 'install -d -m 755 /opt/campusflow-ci && install -d -m 700 /etc/campusflow-ci /var/lib/campusflow-ci /var/lib/campusflow-ci/runs'
scp -q scripts/ci-local.sh ops/ci/server-ci.sh ops/ci/server-deploy.sh "$SERVER:/opt/campusflow-ci/"
scp -q ops/ci/campusflow-ci.service ops/ci/campusflow-ci.timer "$SERVER:/etc/systemd/system/"
ssh "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
chmod 755 /opt/campusflow-ci/*.sh
# server-deploy.sh runs deploy.sh in a container that connects back to this host.
# Allow root's own key from loopback only.
key="$(cat /root/.ssh/id_ed25519.pub)"
grep -qF "$key" /root/.ssh/authorized_keys || echo "from=\"127.0.0.1,::1\" $key" >> /root/.ssh/authorized_keys
ssh-keygen -F 127.0.0.1 -f /root/.ssh/known_hosts >/dev/null || ssh-keyscan -t ed25519 127.0.0.1 2>/dev/null >> /root/.ssh/known_hosts
docker pull -q node:22-bookworm >/dev/null && docker pull -q postgres:17-alpine >/dev/null
systemctl daemon-reload
if [ -s /etc/campusflow-ci/github-token ]; then
  systemctl enable --now campusflow-ci.timer
  echo "server CI enabled; log: /var/log/campusflow-ci.log"
else
  echo "Timer not started: put a fine-grained GitHub token (this repo only; Commit statuses RW," >&2
  echo "Pull requests RW, Issues RW, Contents RW for automerge, ADR 029) in /etc/campusflow-ci/github-token (mode 600), then" >&2
  echo "  systemctl enable --now campusflow-ci.timer" >&2
fi
REMOTE
