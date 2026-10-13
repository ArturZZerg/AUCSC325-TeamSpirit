import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { inspectSimulatorBoot } from './ios-simulator-boot.mjs';
import { readSimulatedEntitlements } from './ios-simulated-entitlements.mjs';
import { inspectIosPreview as inspectProduct, inspectSimulatorSigning } from './ios-preview.mjs';
const require = createRequire(import.meta.url);
const api = 'http://127.0.0.1:3000';
const info = { DTPlatformName: 'iphonesimulator', CFBundleIdentifier: 'com.campusflow.mobile', CFBundleExecutable: 'CampusFlow',
  CFBundleURLTypes: [{ CFBundleURLSchemes: ['campusflow'] }], NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
  MinimumOSVersion: '15.1', DTSDKName: 'iphonesimulator26.2' };
const bundle = Buffer.from(`${api}\0A little help for your day.`);
const entitlements = { 'application-identifier': 'com.campusflow.mobile' };
const signature = 'Signature=adhoc\nTeamIdentifier=not set\n';
const inspectIosPreview = (info, bundle, arch, api) => inspectProduct(info, bundle, arch, api, {}, signature,
  Object.fromEntries(arch.map(value => [value, entitlements])));
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
    assert.throws(() => inspectSimulatorSigning({}, signature, value));
  for (const value of ['', 'code object is not signed at all', 'Signature=adhoc\nTeamIdentifier=ABC123\n', 'Authority=Apple Development\nTeamIdentifier=ABC123\n'])
    assert.throws(() => inspectSimulatorSigning({}, value, entitlements));
  for (const host of [entitlements, { 'keychain-access-groups': ['com.campusflow.mobile'] }, { 'aps-environment': 'development' }])
    assert.throws(() => inspectSimulatorSigning(host, signature, entitlements));
  assert.equal(inspectSimulatorSigning({}, signature, { ...entitlements, 'keychain-access-groups': ['com.campusflow.mobile'] }).keychainIdentifier, 'com.campusflow.mobile');
});

test('requires simulated capabilities in every installed architecture, not just the host signature', () => {
  assert.throws(() => inspectProduct(info, bundle, ['arm64', 'x86_64'], api, {}, signature, { arm64: entitlements }));
});

function simulatedExecutable(architecture = 'arm64') {
  const xml = Buffer.from(require('@expo/plist').default.build(entitlements));
  const binary = Buffer.alloc(184 + xml.length);
  binary.writeUInt32LE(0xfeedfacf); binary.writeUInt32LE(architecture === 'arm64' ? 0x0100000c : 0x01000007, 4);
  binary.writeUInt32LE(1, 16); binary.writeUInt32LE(152, 20);
  binary.writeUInt32LE(0x19, 32); binary.writeUInt32LE(152, 36); binary.writeUInt32LE(1, 96);
  binary.write('__entitlements', 104); binary.write('__TEXT', 120);
  binary.writeBigUInt64LE(BigInt(xml.length), 144); binary.writeUInt32LE(184, 152); xml.copy(binary, 184);
  return binary;
}
test('reads actual simulated entitlements from either supported Mach-O section', () => {
  for (const architecture of ['arm64', 'x86_64']) assert.deepEqual(readSimulatedEntitlements(simulatedExecutable(architecture), architecture), entitlements);
});
test('rejects missing, truncated, wrong-architecture and out-of-bounds simulator sections', () => {
  const missing = simulatedExecutable(); missing.write('__unrelated', 104);
  const bounds = simulatedExecutable(); bounds.writeUInt32LE(bounds.length + 100, 152);
  for (const value of [Buffer.alloc(0), simulatedExecutable().subarray(0, 150), missing, bounds])
    assert.throws(() => readSimulatedEntitlements(value, 'arm64'));
  assert.throws(() => readSimulatedEntitlements(simulatedExecutable(), 'x86_64'));
});

test('local simulator signing requests only the matching app-private Keychain namespace', () => {
  const value = require('@expo/plist').default.parse(readFileSync(new URL('./ios-simulator.entitlements', import.meta.url), 'utf8'));
  assert.deepEqual({ ...value }, { 'application-identifier': 'com.campusflow.mobile', 'keychain-access-groups': ['com.campusflow.mobile'] });
});

test('accepts completed boot only for the explicit fresh QA simulator', () => {
  const device = { udid: 'qa-uuid', name: 'CampusFlowIosQa', state: 'Booted' };
  assert.equal(inspectSimulatorBoot('Status=4294967295, isTerminal=YES\nFinished\n', { devices: { ios: [device] } }, device.udid).ready, true);
  for (const changed of [{ ...device, state: 'Shutdown' }, { ...device, name: 'User phone' }, { ...device, udid: 'other-uuid' }])
    assert.throws(() => inspectSimulatorBoot('Finished', { devices: { ios: [changed] } }, device.udid));
});

test('rejects actual failed migration even when bootstatus exits zero and inventory says Booted', () => {
  const inventory = { devices: { ios: [{ udid: 'qa-uuid', name: 'CampusFlowIosQa', state: 'Booted' }] } };
  for (const log of ['Status=3, isTerminal=YES\nData Migration Failed', 'Data Migration Failed\nFinished', 'Waiting on System App'])
    assert.throws(() => inspectSimulatorBoot(log, inventory, 'qa-uuid'));
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
  const generated = JSON.parse(result.stdout)._internal.modResults.ios;
  const plist = generated.infoPlist;
  assert.equal(plist.NSFaceIDUsageDescription, undefined);
  assert.equal(plist.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
  assert.equal(plist.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
  assert.deepEqual(Object.keys(plist).filter(key => /^NS.*UsageDescription$/.test(key)), []);
  assert.equal(generated.entitlements['aps-environment'], undefined, 'Local reminders must not request APNs remote-push entitlement.');
});

test('only the explicit simulator build puts private Keychain capabilities in Xcode input', () => {
  const result = spawnSync(process.execPath, ['../../node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
    cwd: fileURLToPath(new URL('../apps/mobile', import.meta.url)), encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', CAMPUSFLOW_IOS_SIMULATOR: '1', EXPO_PUBLIC_API_URL: api },
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout)._internal.modResults.ios.entitlements,
    { ...entitlements, 'keychain-access-groups': ['com.campusflow.mobile'] });
  assert.equal(require('../apps/mobile/app.config.cjs')().ios.entitlements, undefined);
});
