#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'iOS simulator builds require macOS with Xcode 26 or newer.' >&2
  exit 1
fi
for tool in node pod xcodebuild xcrun plutil ditto codesign; do command -v "$tool" >/dev/null; done
xcode_version="$(xcodebuild -version | sed -n '1p')"
[[ "$xcode_version" =~ ^Xcode\ (2[6-9]|[3-9][0-9])\. ]] || { echo 'Xcode 26 or newer is required.' >&2; exit 1; }
if [[ "${1:-}" == '--check' ]]; then printf '%s\n' "$xcode_version"; exit 0; fi
[[ $# == 0 ]] || { echo 'Only --check is supported.' >&2; exit 1; }
export CI=1 NODE_ENV=production EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1
export EXPO_PUBLIC_API_URL='http://127.0.0.1:3000'
export CAMPUSFLOW_BUILD_SHA="$(git rev-parse HEAD)"
mkdir -p .local artifacts/ios/evidence
root="$PWD"
# Release embeds its own JS bundle: no Metro server or account credentials.
cd apps/mobile
node ../../node_modules/expo/bin/cli prebuild --platform ios --no-install
git diff --exit-code -- "$root/package-lock.json" "$root/apps/mobile/package.json"
cd "$root"
cp apps/mobile/ios/CampusFlow/AppDelegate.swift artifacts/ios/evidence/generated-AppDelegate.swift
cd apps/mobile
cd ios
pod install
xcodebuild -workspace CampusFlow.xcworkspace -scheme CampusFlow -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$root/.local/ios-derived-data" CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES \
  CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= \
  -quiet 2>&1 | tee "$root/.local/ios-build.log"
cd "$root"
app='.local/ios-derived-data/Build/Products/Release-iphonesimulator/CampusFlow.app'
plutil -convert json -o artifacts/ios/evidence/info.json "$app/Info.plist"
codesign --verify --deep --strict "$app"
codesign -dv --verbose=4 "$app" 2> artifacts/ios/evidence/signature.txt
# Inspect Xcode's effective entitlements; do not invent an Apple team or access group.
codesign -d --entitlements :- "$app" > artifacts/ios/evidence/entitlements.plist
plutil -convert json -o artifacts/ios/evidence/entitlements.json artifacts/ios/evidence/entitlements.plist
architectures="$(xcrun lipo -archs "$app/CampusFlow")"
node scripts/ios-preview.mjs artifacts/ios/evidence/info.json "$app/main.jsbundle" "$architectures" artifacts/ios/evidence/product.json \
  artifacts/ios/evidence/entitlements.json artifacts/ios/evidence/signature.txt
ditto -c -k --sequesterRsrc --keepParent "$app" artifacts/ios/campusflow-simulator.zip
shasum -a 256 artifacts/ios/campusflow-simulator.zip > artifacts/ios/evidence/archive-sha256.txt
printf '%s\n' "$xcode_version" > artifacts/ios/evidence/xcode.txt
echo 'Ad-hoc signed Release simulator preview built; not an App Store or physical-device build.'
