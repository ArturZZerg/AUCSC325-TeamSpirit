#!/usr/bin/env bash
# Server CI (ADR 028, ADR 029). A systemd timer starts it every two minutes. Each start:
#   1. merges `automerge` PRs that passed on the current main, and deploys merged work;
#   2. unless the owner's PC runner is active (heartbeat), tests at most one commit with
#      scripts/ci-local.sh and posts `local-verify` on it; then runs step 1 again.
# What gets tested, and in which order, is scripts/ci-queue.sh: the head of main, then
# collaborator PRs, then PRs from anyone else only while a maintainer has added `ci:run`
# (removed after the run, so outside code never runs here unreviewed).
#
# Automatic merge is opt-in with the `automerge` label. A PR is merged when its latest
# `local-verify` passed on the current main (from this server or the PC runner) and no
# reviewer's latest review requests changes. When GitHub's merge commit has exactly the
# tested tree, it is marked verified and deployed at once; otherwise the next green run
# of main deploys it. Each merged PR is told what happened.
#
# The pipeline itself comes from INSTALL_DIR, installed from main by
# ops/ci/install.sh, never from the PR being tested.
set -euo pipefail

REPO="${CI_LOCAL_REPO:-ArturZZerg/AUCSC325-TeamSpirit}"
INSTALL_DIR="${CI_INSTALL_DIR:-/opt/campusflow-ci}"
STATE_DIR="${CI_STATE_DIR:-/var/lib/campusflow-ci}"
TOKEN_FILE="${CI_TOKEN_FILE:-/etc/campusflow-ci/github-token}"
MIN_FREE_KB=$((4 * 1024 * 1024))   # leave production at least 4 GB of disk
PC_HEARTBEAT="$STATE_DIR/pc-heartbeat"   # touched by scripts/pc-ci.sh while it runs
PC_FRESH_MINUTES=5
export CI_RUNNER="server"
# Production and other sites share this host: cap the test container.
export CI_NODE_LIMITS="${CI_NODE_LIMITS:---cpus 1.5 --memory 2g --memory-swap 2g --pids-limit 4096}"
# The capped CPU makes a few heavy UI tests exceed Jest's 5 s default; allow 30 s here.
export JEST_TEST_TIMEOUT="${JEST_TEST_TIMEOUT:-30000}"
# shellcheck source=../../scripts/ci-queue.sh
. "$INSTALL_DIR/ci-queue.sh"

log() { echo "$(date -u +%FT%TZ) $*"; }
comment() { gh api -X POST "repos/$REPO/issues/$1/comments" -f body="$2" >/dev/null || true; }
# Comments once per key, so a PR waiting on a review is not told again every tick.
comment_once() { # key pr body
  local mark="$STATE_DIR/notified/$1"
  [ -e "$mark" ] && return 0
  mkdir -p "$STATE_DIR/notified" && touch "$mark"
  comment "$2" "$3"
}

# One run at a time, and never while a deploy holds the CampusFlow lock.
exec 9>/run/campusflow-ci.lock
flock -n 9 || exit 0
if [ -e /run/campusflow.lock ] && ! flock -n /run/campusflow.lock true; then log "deploy running; waiting"; exit 0; fi

[ -r "$TOKEN_FILE" ] || { log "missing $TOKEN_FILE"; exit 1; }
GH_TOKEN="$(tr -d '[:space:]' <"$TOKEN_FILE")"
export GH_TOKEN

repo_dir="$STATE_DIR/repo"
deploy_queue="$STATE_DIR/deploy-queue"   # PRs merged by CI and not yet deployed
work_dir="$STATE_DIR/runs/$(date -u +%Y%m%dT%H%M%SZ)-tick"
[ -d "$repo_dir/.git" ] || git clone -q "https://github.com/$REPO.git" "$repo_dir"
fetch_main() { git -C "$repo_dir" fetch -q --prune origin '+refs/heads/main:refs/remotes/origin/main'; git -C "$repo_dir" rev-parse origin/main; }

# Deploys main commit $1 for every queued auto-merged PR and tells each PR.
deploy_main() {
  local sha="$1" prs deploy_code=0 msg
  prs="$(sort -un "$deploy_queue" | tr '\n' ' ')"
  mkdir -p "$work_dir"
  log "deploying main $sha for ${prs}"
  CI_LOCK_HELD=1 "$INSTALL_DIR/server-deploy.sh" >"$work_dir/deploy.log" 2>&1 || deploy_code=$?
  rm -f "$deploy_queue"
  log "deploy of $sha exit=$deploy_code"
  if [ "$deploy_code" = 0 ]; then msg="Deployed to production with \`main\` $sha."
  else msg="The production deploy of \`main\` $sha failed (exit $deploy_code); \`ops/vps/deploy.sh\` rolls back on failure. The owner can read \`$work_dir/deploy.log\` on the server and retry with \`server-deploy.sh\`."; fi
  for p in $prs; do comment "$p" "$msg"; done
}

# Merges at most one ready `automerge` PR (main moves after a merge, so the others need
# a fresh run), then deploys anything merged once main is verified.
merge_and_deploy() {
  local main number sha state tested blocked merged tested_tree merged_tree err
  main="$(fetch_main)"
  while IFS=$'\t' read -r number sha; do
    [ -n "$number" ] || continue
    read -r state tested <<<"$(ci_status "$sha")"
    [ "$state" = success ] && [ "$tested" = "$main" ] || continue
    # Each reviewer's latest approving or blocking review counts; comments do not.
    blocked="$(gh api "repos/$REPO/pulls/$number/reviews?per_page=100" --jq \
      '[group_by(.user.login)[] | map(select(.state != "COMMENTED")) | last | select(. != null) | .state] | any(. == "CHANGES_REQUESTED")' 2>/dev/null || echo unknown)"
    if [ "$blocked" != false ]; then
      comment_once "$number-$sha-review" "$number" "CI passed, but a review still requests changes, so \`$AUTOMERGE_LABEL\` is waiting. It merges once the review is updated."
      continue
    fi
    err="$(mktemp)"
    if merged="$(gh api -X PUT "repos/$REPO/pulls/$number/merge" -f sha="$sha" -f merge_method=merge --jq .sha 2>"$err")"; then
      log "#$number merged automatically as $merged"
      echo "$number" >>"$deploy_queue"
      # The tested merge is main + the PR head (scripts/ci-local.sh builds it the same way).
      git -C "$repo_dir" fetch -q origin "+refs/pull/$number/head:refs/ci-local/$number/head" || true
      tested_tree="$(git -C "$repo_dir" merge-tree --write-tree "$main" "$sha" 2>/dev/null | head -1 || true)"
      main="$(fetch_main)"
      merged_tree="$(git -C "$repo_dir" rev-parse -q --verify "$merged^{tree}" 2>/dev/null || true)"
      if [ -n "$tested_tree" ] && [ "$tested_tree" = "$merged_tree" ] && [ "$main" = "$merged" ] \
        && gh api -X POST "repos/$REPO/statuses/$merged" -f state=success -f context=local-verify \
             -f description="Same code as the tested merge of #$number" >/dev/null; then
        comment "$number" "CI passed and this PR has \`$AUTOMERGE_LABEL\`, so it was merged as $merged. That commit has exactly the code CI tested, so it deploys now."
      else
        comment "$number" "CI passed and this PR has \`$AUTOMERGE_LABEL\`, so it was merged. It deploys once \`main\` passes CI."
      fi
    else
      log "#$number: merge refused"
      comment_once "$number-$sha-refused" "$number" "CI passed, but GitHub refused the automatic merge: $(head -c 400 "$err" | tr '\n' ' ')"
    fi
    rm -f "$err"
    break
  done < <(gh api "repos/$REPO/pulls?state=open&sort=updated&direction=asc&per_page=100" --jq \
    ".[] | select(.draft | not) | select(any(.labels[]; .name == \"$AUTOMERGE_LABEL\")) | [.number, .head.sha] | @tsv")

  [ -s "$deploy_queue" ] || return 0
  main="$(fetch_main)"
  read -r state tested <<<"$(ci_status "$main")"
  case "$state" in
    success) deploy_main "$main" ;;
    failure|error)
      for p in $(sort -un "$deploy_queue"); do
        comment_once "$p-$main-held" "$p" "\`main\` failed CI at $main after this merge, so the deploy is held until \`main\` is green again."
      done ;;
  esac
}

merge_and_deploy

# While the PC runner is active it does the testing; the server only merges and deploys.
if [ -n "$(find "$PC_HEARTBEAT" -mmin -"$PC_FRESH_MINUTES" 2>/dev/null)" ]; then exit 0; fi

free_kb="$(df --output=avail -k / | tail -1 | tr -d ' ')"
[ "$free_kb" -ge "$MIN_FREE_KB" ] || { log "only ${free_kb} KB free on /; not starting CI"; exit 0; }

IFS=$'\t' read -r kind pr target labelled_run <<<"$(ci_next "$(fetch_main)")" || true
[ -n "${target:-}" ] || exit 0

run_dir="$STATE_DIR/runs/$(date -u +%Y%m%dT%H%M%SZ)-${pr:-main}-${target:0:12}"
mkdir -p "$run_dir"
export TMPDIR="$run_dir"
log "testing $kind ${pr:+#$pr }$target in $run_dir"

code=0
if [ "$kind" = main ]; then
  (cd "$repo_dir" && nice -n 10 "$INSTALL_DIR/ci-local.sh" --ref origin/main) >"$run_dir/runner.log" 2>&1 || code=$?
else
  (cd "$repo_dir" && nice -n 10 "$INSTALL_DIR/ci-local.sh" "$pr") >"$run_dir/runner.log" 2>&1 || code=$?
fi
[ "$labelled_run" = 1 ] && ci_unlabel "$pr"
[ "$code" != 0 ] && [ "$kind" = pr ] && ci_fail_comment "$pr" "$target" "$run_dir" "$run_dir/runner.log"
log "finished $kind ${pr:+#$pr }$target exit=$code"

merge_and_deploy

# Housekeeping: keep logs for 14 days, drop sources, and old CI images and cache.
find "$run_dir" -name source.tar -delete 2>/dev/null || true
find "$STATE_DIR/runs" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} + 2>/dev/null || true
find "$STATE_DIR/notified" -type f -mtime +14 -delete 2>/dev/null || true
docker image prune -f --filter until=24h >/dev/null 2>&1 || true
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
exit 0
