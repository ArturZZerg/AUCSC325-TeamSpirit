import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectIosPreview as inspectProduct, inspectSimulatorSigning } from './ios-preview.mjs';
const require = createRequire(import.meta.url);
const api = 'http://127.0.0.1:3000';
const info = { DTPlatformName: 'iphonesimulator', CFBundleIdentifier: 'com.campusflow.mobile', CFBundleExecutable: 'CampusFlow',
  CFBundleURLTypes: [{ CFBundleURLSchemes: ['campusflow'] }], NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
  MinimumOSVersion: '15.1', DTSDKName: 'iphonesimulator26.2' };
const bundle = Buffer.from(`${api}\0A little help for your day.`);
const entitlements = { 'application-identifier': 'com.campusflow.mobile' };
const signature = 'Signature=adhoc\nTeamIdentifier=not set\n';
const inspectIosPreview = (info, bundle, arch, api) => inspectProduct(info, bundle, arch, api, entitlements, signature);
test('accepts actual simulator metadata and either supported bundle string encoding', () => {
  for (const encoding of ['utf8', 'utf16le']) {
    const proof = inspectIosPreview(info, Buffer.from(bundle.toString(), encoding), ['arm64', 'x86_64'], api);
    assert.equal(proof.keychainIdentifier, 'com.campusflow.mobile'); assert.deepEqual(proof.usageDescriptions, []);
  }
});
test('rejects device archives, wrong identifiers, missing link schemes and invalid architectures', () => {
  for (const change of [{ DTPlatformName: 'iphoneos' }, { CFBundleIdentifier: 'other.app' }, { CFBundleExecutable: 'Other' }, { CFBundleURLTypes: [] }])
    assert.throws(() => inspectIosPreview({ ...info, ...change }, bundle, ['arm64'], api));
  for (const arch of [[], ['armv7'], ['arm64', 'unknown']]) assert.throws(() => inspectIosPreview(info, bundle, arch, api));
});
test('rejects unused sensitive capabilities, background work and global insecure networking', () => {
  for (const key of ['NSFaceIDUsageDescription', 'NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSUserTrackingUsageDescription'])
    assert.throws(() => inspectIosPreview({ ...info, [key]: 'unused' }, bundle, ['arm64'], api));
  assert.throws(() => inspectIosPreview({ ...info, UIBackgroundModes: ['remote-notification'] }, bundle, ['arm64'], api));
  assert.throws(() => inspectIosPreview({ ...info, NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } }, bundle, ['arm64'], api));
});
test('rejects stale bundles and alternative APIs in this loopback preview', () => {
  assert.throws(() => inspectIosPreview(info, Buffer.from('old API and screen'), ['arm64'], api));
  assert.throws(() => inspectIosPreview(info, bundle, ['arm64'], 'https://other.example.test'));
});

test('requires effective Keychain entitlements and actual local simulator signing', () => {
  for (const value of [undefined, {}, { 'application-identifier': 'other.app' },
    { ...entitlements, 'keychain-access-groups': [] }, { ...entitlements, 'keychain-access-groups': ['shared.app'] },
    { ...entitlements, 'keychain-access-groups': ['com.campusflow.mobile', 'shared.app'] },
    { ...entitlements, 'aps-environment': 'development' }, { ...entitlements, 'com.apple.developer.team-identifier': 'invented' }])
    assert.throws(() => inspectSimulatorSigning(value, signature));
  for (const value of ['', 'code object is not signed at all', 'Signature=adhoc\nTeamIdentifier=ABC123\n', 'Authority=Apple Development\nTeamIdentifier=ABC123\n'])
    assert.throws(() => inspectSimulatorSigning(entitlements, value));
  assert.equal(inspectSimulatorSigning({ ...entitlements, 'keychain-access-groups': ['com.campusflow.mobile'] }, signature).keychainIdentifier, 'com.campusflow.mobile');
});
test('configuration uses the established app identity and removes unused Face ID access', () => {
  const config = require('../apps/mobile/app.config.cjs')();
  assert.equal(config.ios.bundleIdentifier, config.android.package);
  assert.deepEqual(config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-secure-store'), ['expo-secure-store', { faceIDPermission: false }]);
  assert.equal(config.plugins.find(plugin => Array.isArray(plugin) && plugin[0].includes('preview-network'))[1].enabled, false);
});
test('generated native plist removes Face ID and global cleartext access after applying all installed plugins', () => {
  const result = spawnSync(process.execPath, ['../../node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
    cwd: fileURLToPath(new URL('../apps/mobile', import.meta.url)), encoding: 'utf8',
    env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_API_URL: api }, timeout: 30_000,
  });
  assert.equal(result.status, 0, 'Installed Expo plugins must generate a valid native configuration.');
  const plist = JSON.parse(result.stdout)._internal.modResults.ios.infoPlist;
  assert.equal(plist.NSFaceIDUsageDescription, undefined);
  assert.equal(plist.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
  assert.equal(plist.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
  assert.deepEqual(Object.keys(plist).filter(key => /^NS.*UsageDescription$/.test(key)), []);
});
