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
# A commit that already has a `local-verify` status is skipped, unless its PR has
# the `ci:run` label: the label asks for a (re-)run of any PR. A pending status
# older than STALE_MINUTES (crashed run) is tested again.
#
# ci-local.sh tests each PR merged into the current main (it builds the merge
# itself) and reports a PR that conflicts with main as a failure.
#
# Opt-in auto-merge and deploy (ADR 029): a green PR with the `automerge` label is
# merged when its head and main are unchanged since the run and no review requests
# changes. If main moved, the PR gets `ci:run` and is re-tested first. The next
# green run of main then deploys it with server-deploy.sh, and the merged PR is told.
#
# The pipeline itself comes from INSTALL_DIR, installed from main by
# ops/ci/install.sh, never from the PR being tested.
set -euo pipefail

REPO="${CI_LOCAL_REPO:-ArturZZerg/AUCSC325-TeamSpirit}"
INSTALL_DIR="${CI_INSTALL_DIR:-/opt/campusflow-ci}"
STATE_DIR="${CI_STATE_DIR:-/var/lib/campusflow-ci}"
TOKEN_FILE="${CI_TOKEN_FILE:-/etc/campusflow-ci/github-token}"
LABEL="ci:run"
AUTOMERGE_LABEL="automerge"
STALE_MINUTES=90
MIN_FREE_KB=$((4 * 1024 * 1024))   # leave production at least 4 GB of disk
export CI_RUNNER="server"
# Production and other sites share this host: cap the test container.
export CI_NODE_LIMITS="${CI_NODE_LIMITS:---cpus 1.5 --memory 2g --memory-swap 2g --pids-limit 4096}"
# The capped CPU makes a few heavy UI tests exceed Jest's 5 s default; allow 30 s here.
export JEST_TEST_TIMEOUT="${JEST_TEST_TIMEOUT:-30000}"

log() { echo "$(date -u +%FT%TZ) $*"; }
comment() { gh api -X POST "repos/$REPO/issues/$1/comments" -f body="$2" >/dev/null || true; }

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
deploy_queue="$STATE_DIR/deploy-queue"   # PRs merged by CI and not yet deployed
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

target="" kind="" pr="" labelled_run=0
main_sha="$(git -C "$repo_dir" rev-parse origin/main)"
if [ "$(status_of "$main_sha")" = missing ]; then
  target="$main_sha" kind="main"
else
  # Oldest-updated first, so a busy PR cannot starve the others.
  while IFS=$'\t' read -r number sha association labelled; do
    trusted=0
    case "$association" in OWNER|MEMBER|COLLABORATOR) trusted=1 ;; esac
    [ "$trusted" = 1 ] || [ "$labelled" = true ] || continue
    [ "$labelled" = true ] || [ "$(status_of "$sha")" = missing ] || continue
    target="$sha" kind="pr" pr="$number"
    [ "$labelled" = true ] && labelled_run=1
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
else
  (cd "$repo_dir" && nice -n 10 "$INSTALL_DIR/ci-local.sh" "$pr") >"$run_dir/runner.log" 2>&1 || code=$?
fi

if [ "$labelled_run" = 1 ]; then
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

if [ "$code" = 0 ] && [ "$kind" = pr ]; then
  info="$(gh api "repos/$REPO/pulls/$pr" --jq "[.state, .head.sha, (any(.labels[]; .name == \"$AUTOMERGE_LABEL\"))] | @tsv" 2>/dev/null || true)"
  IFS=$'\t' read -r pr_state pr_head wants_merge <<<"$info" || true
  if [ "${wants_merge:-false}" = true ] && [ "${pr_state:-}" = open ]; then
    # The merge CI tested was built on this main (scripts/ci-local.sh).
    tested_main="$(git -C "$repo_dir" rev-parse -q --verify refs/ci-local/main || true)"
    current_main="$(gh api "repos/$REPO/commits/main" --jq .sha 2>/dev/null || true)"
    # Each reviewer's latest approving or blocking review counts; comments do not.
    blocked="$(gh api "repos/$REPO/pulls/$pr/reviews?per_page=100" --jq \
      '[group_by(.user.login)[] | map(select(.state != "COMMENTED")) | last | select(. != null) | .state] | any(. == "CHANGES_REQUESTED")' 2>/dev/null || echo unknown)"
    if [ "$pr_head" != "$target" ]; then
      log "#$pr has new commits since the run; not merging"
    elif [ "$blocked" != false ]; then
      log "#$pr: a review requests changes (or reviews could not be read); not merging"
      comment "$pr" "Server CI passed, but a review still requests changes, so \`$AUTOMERGE_LABEL\` is waiting. Once it is addressed and the review is updated, push or add \`$LABEL\` to re-run."
    elif [ -z "$tested_main" ] || [ "$tested_main" != "$current_main" ]; then
      log "#$pr: main moved during the run; asking for a re-test"
      gh api -X POST "repos/$REPO/issues/$pr/labels" -f "labels[]=$LABEL" >/dev/null || true
    elif gh api -X PUT "repos/$REPO/pulls/$pr/merge" -f sha="$target" -f merge_method=merge >/dev/null 2>"$run_dir/merge.err"; then
      log "#$pr merged automatically"
      echo "$pr" >>"$deploy_queue"
      comment "$pr" "Server CI passed and this PR has \`$AUTOMERGE_LABEL\`, so it was merged. It deploys once \`main\` passes server CI."
    else
      log "#$pr: merge refused"
      comment "$pr" "Server CI passed, but GitHub refused the automatic merge: $(head -c 400 "$run_dir/merge.err" | tr '\n' ' ')"
    fi
  fi
fi

# Deploy auto-merged PRs once main passes (ADR 029). Only the commit just tested is
# deployed; if main moved meanwhile, its own run deploys it.
if [ "$kind" = main ] && [ -s "$deploy_queue" ]; then
  prs="$(sort -un "$deploy_queue" | tr '\n' ' ')"
  if [ "$code" != 0 ]; then
    log "main $target failed; deploy of ${prs}held"
    for p in $prs; do comment "$p" "\`main\` failed server CI at $target after this merge, so the deploy is held until \`main\` is green again."; done
  elif [ "$(gh api "repos/$REPO/commits/main" --jq .sha 2>/dev/null || true)" = "$target" ]; then
    log "deploying main $target for ${prs}"
    deploy_code=0
    CI_LOCK_HELD=1 "$INSTALL_DIR/server-deploy.sh" >"$run_dir/deploy.log" 2>&1 || deploy_code=$?
    rm -f "$deploy_queue"
    log "deploy of $target exit=$deploy_code"
    if [ "$deploy_code" = 0 ]; then msg="Deployed to production with \`main\` $target."
    else msg="The production deploy of \`main\` $target failed (exit $deploy_code); \`ops/vps/deploy.sh\` rolls back on failure. The owner can read \`$run_dir/deploy.log\` on the server and retry with \`server-deploy.sh\`."; fi
    for p in $prs; do comment "$p" "$msg"; done
  fi
fi

# Housekeeping: keep logs for 14 days, drop sources, and old CI images and cache.
find "$run_dir" -name source.tar -delete 2>/dev/null || true
find "$STATE_DIR/runs" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} + 2>/dev/null || true
docker image prune -f --filter until=24h >/dev/null 2>&1 || true
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
exit 0
