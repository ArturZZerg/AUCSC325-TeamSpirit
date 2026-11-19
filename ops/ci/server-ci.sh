#!/usr/bin/env bash
# Server CI poller (ADR 028). A systemd timer starts it every two minutes. Each start
# tests at most one commit with scripts/ci-local.sh and posts `local-verify` on it.
#
# What gets tested, in order:
#   1. the head of main, after every merge;
#   2. open PRs from repository collaborators (OWNER, MEMBER, COLLABORATOR);
#   3. open PRs from anyone else only while a maintainer has added the `ci:run`
#      label. The label is removed after the run, so every new push needs a new
#      approval: outside code never runs on this shared server unreviewed.
# A commit that already has a `local-verify` status is skipped. A pending status
# older than STALE_MINUTES (crashed run) is tested again.
#
# The pipeline itself comes from INSTALL_DIR, installed from main by
# ops/ci/install.sh, never from the PR being tested.
set -euo pipefail

REPO="${CI_LOCAL_REPO:-ArturZZerg/AUCSC325-TeamSpirit}"
INSTALL_DIR="${CI_INSTALL_DIR:-/opt/campusflow-ci}"
STATE_DIR="${CI_STATE_DIR:-/var/lib/campusflow-ci}"
TOKEN_FILE="${CI_TOKEN_FILE:-/etc/campusflow-ci/github-token}"
LABEL="ci:run"
STALE_MINUTES=90
MIN_FREE_KB=$((4 * 1024 * 1024))   # leave production at least 4 GB of disk
export CI_RUNNER="server"
# Production and other sites share this host: cap the test container.
export CI_NODE_LIMITS="${CI_NODE_LIMITS:---cpus 1.5 --memory 2g --memory-swap 2g --pids-limit 4096}"
# The capped CPU makes a few heavy UI tests exceed Jest's 5 s default; allow 30 s here.
export JEST_TEST_TIMEOUT="${JEST_TEST_TIMEOUT:-30000}"

log() { echo "$(date -u +%FT%TZ) $*"; }

# One run at a time, and never while a deploy holds the CampusFlow lock.
exec 9>/run/campusflow-ci.lock
flock -n 9 || exit 0
if [ -e /run/campusflow.lock ] && ! flock -n /run/campusflow.lock true; then log "deploy running; waiting"; exit 0; fi

[ -r "$TOKEN_FILE" ] || { log "missing $TOKEN_FILE"; exit 1; }
GH_TOKEN="$(tr -d '[:space:]' <"$TOKEN_FILE")"
export GH_TOKEN

free_kb="$(df --output=avail -k / | tail -1 | tr -d ' ')"
[ "$free_kb" -ge "$MIN_FREE_KB" ] || { log "only ${free_kb} KB free on /; not starting CI"; exit 0; }

repo_dir="$STATE_DIR/repo"
[ -d "$repo_dir/.git" ] || git clone -q "https://github.com/$REPO.git" "$repo_dir"
git -C "$repo_dir" fetch -q --prune origin '+refs/heads/main:refs/remotes/origin/main'

# Prints "missing" when the commit needs a run, otherwise the latest state.
status_of() {
  gh api "repos/$REPO/commits/$1/statuses?per_page=100" --jq "
    [.[] | select(.context == \"local-verify\")] | first
    | if . == null then \"missing\"
      elif .state == \"pending\" and (now - (.updated_at | fromdateiso8601)) > ($STALE_MINUTES * 60) then \"missing\"
      else .state end"
}
post_status() { # sha state description
  gh api -X POST "repos/$REPO/statuses/$1" -f state="$2" -f context=local-verify -f description="${3:0:140}" >/dev/null
}

target="" kind="" pr="" fork_label=0
main_sha="$(git -C "$repo_dir" rev-parse origin/main)"
if [ "$(status_of "$main_sha")" = missing ]; then
  target="$main_sha" kind="main"
else
  # Oldest-updated first, so a busy PR cannot starve the others.
  while IFS=$'\t' read -r number sha association labelled; do
    trusted=0
    case "$association" in OWNER|MEMBER|COLLABORATOR) trusted=1 ;; esac
    [ "$trusted" = 1 ] || [ "$labelled" = true ] || continue
    [ "$(status_of "$sha")" = missing ] || continue
    target="$sha" kind="pr" pr="$number"
    [ "$trusted" = 1 ] || fork_label=1
    break
  done < <(gh api "repos/$REPO/pulls?state=open&sort=updated&direction=asc&per_page=100" --jq \
    ".[] | select(.draft | not) | [.number, .head.sha, .author_association, (any(.labels[]; .name == \"$LABEL\"))] | @tsv")
fi
[ -n "$target" ] || exit 0

run_dir="$STATE_DIR/runs/$(date -u +%Y%m%dT%H%M%SZ)-${pr:-main}-${target:0:12}"
mkdir -p "$run_dir"
export TMPDIR="$run_dir"
log "testing $kind ${pr:+#$pr }$target in $run_dir"

code=0
if [ "$kind" = main ]; then
  (cd "$repo_dir" && nice -n 10 "$INSTALL_DIR/ci-local.sh" --ref origin/main) >"$run_dir/runner.log" 2>&1 || code=$?
elif ! git -C "$repo_dir" fetch -q origin "+refs/pull/$pr/merge:refs/ci-local/$pr/merge" 2>/dev/null; then
  # No merge ref: GitHub could not merge the PR into main.
  post_status "$target" failure "Cannot test: the PR does not merge cleanly into main. Rebase or merge main."
  code=1
else
  (cd "$repo_dir" && nice -n 10 "$INSTALL_DIR/ci-local.sh" "$pr") >"$run_dir/runner.log" 2>&1 || code=$?
fi

if [ "$fork_label" = 1 ]; then
  gh api -X DELETE "repos/$REPO/issues/$pr/labels/$(printf %s "$LABEL" | jq -sRr @uri)" >/dev/null 2>&1 || true
fi

# A failing PR gets the end of the log as a comment: contributors cannot read this server.
if [ "$code" != 0 ] && [ "$kind" = pr ]; then
  ci_log="$(find "$run_dir" -name ci.log -print -quit)"
  tail_text="$(tail -60 "${ci_log:-$run_dir/runner.log}" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | cut -c1-300)"
  step="$(grep -o "FAIL at '[^']*'" "$run_dir/runner.log" | head -1 || true)"
  body="$(printf 'Server CI (`local-verify`) failed for %s. %s\n\n<details><summary>Last 60 log lines</summary>\n\n```text\n%s\n```\n</details>\n\nRun it yourself with `scripts/ci-local.sh %s`.' \
    "$target" "${step:-}" "$tail_text" "$pr")"
  gh api -X POST "repos/$REPO/issues/$pr/comments" -f body="$body" >/dev/null || true
fi
log "finished $kind ${pr:+#$pr }$target exit=$code"

# Housekeeping: keep logs for 14 days, drop sources, and old CI images and cache.
find "$run_dir" -name source.tar -delete 2>/dev/null || true
find "$STATE_DIR/runs" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} + 2>/dev/null || true
docker image prune -f --filter until=24h >/dev/null 2>&1 || true
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
exit 0
