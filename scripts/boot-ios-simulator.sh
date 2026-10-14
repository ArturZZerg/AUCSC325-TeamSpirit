#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin && "${GITHUB_ACTIONS:-}" == true && -n "${GITHUB_ENV:-}" ]] || { echo 'Boot helper requires the disposable macOS Actions runner.' >&2; exit 1; }
mkdir -p .local artifacts/ios/evidence
udid=''
ready=0
cleanup_failed() {
  if [[ "$ready" == 0 && -n "$udid" ]]; then
    xcrun simctl shutdown "$udid" 2>/dev/null || true
    xcrun simctl delete "$udid"
  fi
}
trap cleanup_failed EXIT
for attempt in 1 2; do
  # Each UUID comes from this call; never erase/retry an existing user simulator.
  udid="$(xcrun simctl create CampusFlowIosQa com.apple.CoreSimulator.SimDeviceType.iPhone-16 com.apple.CoreSimulator.SimRuntime.iOS-26-2)"
  log="artifacts/ios/evidence/simulator-boot-$attempt.log"
  if xcrun simctl boot "$udid" && xcrun simctl bootstatus "$udid" -b 2>&1 | tee "$log"; then
    xcrun simctl list devices --json > .local/ios-simulator-inventory.json
    if IOS_BOOT_ATTEMPT="$attempt" node scripts/ios-simulator-boot.mjs "$log" .local/ios-simulator-inventory.json "$udid" artifacts/ios/evidence/boot.json; then
      ready=1
      printf 'IOS_SIMULATOR_UDID=%s\n' "$udid" >> "$GITHUB_ENV"
      exit 0
    fi
  fi
  cleanup_failed
  udid=''
done
echo 'Both fresh simulator boot attempts failed; app acceptance is unverified.' >&2
exit 1
