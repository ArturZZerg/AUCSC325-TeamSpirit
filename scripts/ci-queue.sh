# CI work queue shared by ops/ci/server-ci.sh and scripts/pc-ci.sh (ADR 028, ADR 029).
# Source it after setting REPO; it needs gh signed in (or GH_TOKEN).
#
# What needs a `local-verify` run, in order:
#   1. the head of main;
#   2. open PRs from collaborators (OWNER, MEMBER, COLLABORATOR) without a result, and
#      `automerge` PRs whose passing result was for an older main (re-test, then merge);
#   3. any PR a maintainer labelled `ci:run`. Outside code never runs unlabelled.
# A pending status older than STALE_MINUTES (crashed run) counts as no result.

CI_LABEL="ci:run"
AUTOMERGE_LABEL="automerge"
STALE_MINUTES="${STALE_MINUTES:-90}"

# "missing", or "<state> <main sha the PR was tested on, or ->" for the latest status.
ci_status() {
  gh api "repos/$REPO/commits/$1/statuses?per_page=100" --jq "
    [.[] | select(.context == \"local-verify\")] | first
    | if . == null then \"missing\"
      elif .state == \"pending\" and (now - (.updated_at | fromdateiso8601)) > ($STALE_MINUTES * 60) then \"missing\"
      else .state + \" \" + (((.description // \"\") | capture(\"main=(?<m>[0-9a-f]{40})\") | .m) // \"-\") end"
}

# Prints "kind<TAB>pr<TAB>sha<TAB>labelled" for the next commit to test, or nothing.
# Oldest-updated PRs first, so a busy PR cannot starve the others.
ci_next() {
  local main="$1" number sha association ci_run automerge state tested
  if [ "$(ci_status "$main")" = missing ]; then printf 'main\t\t%s\t0\n' "$main"; return 0; fi
  while IFS=$'\t' read -r number sha association ci_run automerge; do
    case "$association" in OWNER|MEMBER|COLLABORATOR) ;; *) [ "$ci_run" = true ] || continue ;; esac
    if [ "$ci_run" != true ]; then
      read -r state tested <<<"$(ci_status "$sha")"
      if [ "$state" = missing ]; then :
      elif [ "$automerge" = true ] && [ "$state" = success ] && [ "$tested" != "$main" ]; then :
      else continue; fi
    fi
    printf 'pr\t%s\t%s\t%s\n' "$number" "$sha" "$([ "$ci_run" = true ] && echo 1 || echo 0)"
    return 0
  done < <(gh api "repos/$REPO/pulls?state=open&sort=updated&direction=asc&per_page=100" --jq \
    ".[] | select(.draft | not) | [.number, .head.sha, .author_association,
      (any(.labels[]; .name == \"$CI_LABEL\")), (any(.labels[]; .name == \"$AUTOMERGE_LABEL\"))] | @tsv")
}

# Removes the one-run `ci:run` approval after a labelled run.
# The label is URL-encoded without jq, which Git Bash on Windows does not ship.
ci_unlabel() {
  gh api -X DELETE "repos/$REPO/issues/$1/labels/${CI_LABEL//:/%3A}" >/dev/null 2>&1     || echo "could not remove $CI_LABEL from #$1; remove it by hand or the PR is tested again" >&2
}

# Posts the end of a failed run's log on the PR: contributors cannot read the runner's disk.
ci_fail_comment() { # pr sha run_log_dir runner_log
  local pr="$1" sha="$2" dir="$3" runner_log="$4" ci_log tail_text step body
  ci_log="$(find "$dir" -name ci.log -print -quit 2>/dev/null || true)"
  tail_text="$(tail -60 "${ci_log:-$runner_log}" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | cut -c1-300)"
  step="$(grep -o "FAIL at '[^']*'" "$runner_log" | head -1 || true)"
  body="$(printf 'CI (`local-verify`, %s) failed for %s. %s\n\n<details><summary>Last 60 log lines</summary>\n\n```text\n%s\n```\n</details>\n\nRun it yourself with `scripts/ci-local.sh %s`.' \
    "${CI_RUNNER:-ci}" "$sha" "${step:-}" "$tail_text" "$pr")"
  gh api -X POST "repos/$REPO/issues/$pr/comments" -f body="$body" >/dev/null || true
}
