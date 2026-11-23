#!/usr/bin/env bash
# PC CI runner (ADR 029): tests PRs on a developer PC with all its cores, so a queue of
# PRs clears in minutes instead of hours on the capped server.
#   scripts/pc-ci.sh            # keep testing until stopped (Ctrl+C)
#   scripts/pc-ci.sh --once     # test at most one commit, then exit
#
# It takes work from the same queue as server CI (scripts/ci-queue.sh), runs
# scripts/ci-local.sh in parallel mode and posts `local-verify` as you (gh auth). While
# it runs it touches a heartbeat on the server, so the server stops testing and only
# merges `automerge` PRs and deploys; within 5 minutes of this runner stopping, the
# server tests again. Nothing depends on the PC being on.
#
# The runner works in its own clone (CI_PC_DIR, default ~/.campusflow-ci) and runs the
# pipeline from main, never from the PR under test. PR code runs only inside Docker,
# under the same trust rules as the server: collaborators, or PRs labelled `ci:run`.
# Needs: Git Bash, gh signed in, Docker, and SSH access to SERVER.
set -euo pipefail

REPO="${CI_LOCAL_REPO:-ArturZZerg/AUCSC325-TeamSpirit}"
SERVER="${SERVER:-root@95.217.239.38}"
PC_DIR="${CI_PC_DIR:-$HOME/.campusflow-ci}"
POLL_SECONDS="${CI_POLL_SECONDS:-30}"
once=0; [ "${1:-}" = --once ] && once=1

export CI_RUNNER="${CI_RUNNER:-pc}" CI_PARALLEL=1
log() { echo "$(date +%T) $*"; }
heartbeat() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$SERVER" 'touch /var/lib/campusflow-ci/pc-heartbeat' >/dev/null 2>&1 || true; }
# Lets the server merge a just-passed `automerge` PR now instead of at its next tick.
nudge_server() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$SERVER" 'systemctl start --no-block campusflow-ci.service' >/dev/null 2>&1 || true; }

repo_dir="$PC_DIR/repo"
mkdir -p "$PC_DIR/runs"
[ -d "$repo_dir/.git" ] || git clone -q "https://github.com/$REPO.git" "$repo_dir"

heartbeat
( while sleep 60; do heartbeat; done ) &
beat_pid=$!
trap 'kill "$beat_pid" 2>/dev/null || true' EXIT
log "PC CI runner started (repo $REPO, clone $repo_dir). The server now only merges and deploys."

while true; do
  git -C "$repo_dir" fetch -q --prune origin '+refs/heads/main:refs/remotes/origin/main'
  git -C "$repo_dir" checkout -q --detach origin/main
  main="$(git -C "$repo_dir" rev-parse origin/main)"
  # shellcheck source=ci-queue.sh
  . "$repo_dir/scripts/ci-queue.sh"
  IFS=$'\t' read -r kind pr target labelled <<<"$(ci_next "$main")" || true
  if [ -n "${target:-}" ]; then
    run_dir="$PC_DIR/runs/$(date +%Y%m%dT%H%M%S)-${pr:-main}-${target:0:12}"
    mkdir -p "$run_dir"
    log "testing $kind ${pr:+#$pr }${target:0:12}"
    start=$SECONDS code=0
    if [ "$kind" = main ]; then
      (cd "$repo_dir" && TMPDIR="$run_dir" bash scripts/ci-local.sh --ref origin/main) >"$run_dir/runner.log" 2>&1 || code=$?
    else
      (cd "$repo_dir" && TMPDIR="$run_dir" bash scripts/ci-local.sh "$pr") >"$run_dir/runner.log" 2>&1 || code=$?
    fi
    [ "$labelled" = 1 ] && ci_unlabel "$pr"
    [ "$code" != 0 ] && [ "$kind" = pr ] && ci_fail_comment "$pr" "$target" "$run_dir" "$run_dir/runner.log"
    log "$([ "$code" = 0 ] && echo PASS || echo FAIL) $kind ${pr:+#$pr }${target:0:12} in $((SECONDS - start))s (log: $run_dir)"
    nudge_server
    find "$run_dir" -name source.tar -delete 2>/dev/null || true
  fi
  [ "$once" = 1 ] && exit 0
  [ -n "${target:-}" ] || sleep "$POLL_SECONDS"
done
