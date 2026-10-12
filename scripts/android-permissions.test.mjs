import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { checkAndroidPermissionReport } from './android-permissions.mjs';

const require = createRequire(import.meta.url);
// Representative actual aapt2 output; optional SDK support may be absent, but
// network access and the local reminder capabilities must remain unrestricted.
const core = `package: com.campusflow.mobile
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.RECEIVE_BOOT_COMPLETED'
uses-permission: name='android.permission.VIBRATE'
`;
const unused = ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT'];

test('accepts app/reminder and reviewed SDK support permissions from an APK report', () => {
  const result = checkAndroidPermissionReport(core + `uses-permission: name='android.permission.ACCESS_NETWORK_STATE'
uses-permission: name='android.permission.WAKE_LOCK'
uses-permission: name='com.google.android.c2dm.permission.RECEIVE'
uses-permission: name='com.sec.android.provider.badge.permission.WRITE'
permission: com.campusflow.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
uses-permission: name='com.campusflow.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
`);
  assert.equal(result.packageName, 'com.campusflow.mobile'); assert.equal(result.permissions.length, 9);
  assert.deepEqual(result.declaredPermissions, ['com.campusflow.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']);
});
for (const permission of unused) test(`rejects the unused ${permission} even when limited to old Android`, () => {
  assert.throws(() => checkAndroidPermissionReport(core + `uses-permission: name='${permission}' maxSdkVersion='32'\n`), /Unreviewed Android permissions/);
});
test('rejects newly introduced sensitive or conditional permissions instead of accepting an SDK addition', () => {
  for (const permission of ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.READ_CONTACTS'])
    assert.throws(() => checkAndroidPermissionReport(core + `uses-permission-sdk-23: name='${permission}'\n`), /Unreviewed Android permissions/);
  assert.throws(() => checkAndroidPermissionReport(core + 'permission: com.campusflow.mobile.UNREVIEWED\n'), /custom Android permission/);
});
test('rejects lost or SDK-restricted core app/reminder capabilities', () => {
  for (const permission of ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.VIBRATE']) {
    const removed = core.replace(`uses-permission: name='${permission}'\n`, '');
    assert.throws(() => checkAndroidPermissionReport(removed), /Missing unrestricted/);
    assert.throws(() => checkAndroidPermissionReport(removed + `uses-permission: name='${permission}' maxSdkVersion='32'\n`), /Missing unrestricted/);
    assert.throws(() => checkAndroidPermissionReport(removed + `uses-permission-sdk-23: name='${permission}'\n`), /Missing unrestricted/);
  }
});
test('rejects a wrong/missing/duplicate package and incomplete or malformed reports', () => {
  for (const report of ['', undefined, 'x'.repeat(262145), core.replace('com.campusflow.mobile', 'com.unrelated.app'),
    core.replace('package: com.campusflow.mobile\n', ''), core + 'package: com.campusflow.mobile\n',
    core + 'uses-permission: malformed-private-output\n', core + 'unrecognized SDK output\n'])
    assert.throws(() => checkAndroidPermissionReport(report));
  try { checkAndroidPermissionReport(core + 'malformed-private-output\n'); } catch (error) { assert.ok(!error.message.includes('malformed-private-output')); }
});
test('normalizes Windows line endings and duplicate reviewed permission entries', () => {
  const result = checkAndroidPermissionReport((core + "uses-permission-sdk-23: name='android.permission.INTERNET'\n").replace(/\n/g, '\r\n'));
  assert.equal(result.permissions.length, 4);
});
test('actual Expo blocked-permission mod removes inherited capabilities and retains app/reminder entries', async () => {
  const config = require('../apps/mobile/app.config.cjs')();
  const { withInternalBlockedPermissions } = require('@expo/config-plugins/build/android/Permissions.js');
  const entries = [...unused, 'android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS',
    'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.VIBRATE'].map(permission => ({ $: { 'android:name': permission } }));
  const modded = withInternalBlockedPermissions(config);
  const manifest = (await modded.mods.android.manifest({ modRequest: { platform: 'android' }, modResults: {
    manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, 'uses-permission': entries },
  } })).modResults.manifest;
  for (const permission of unused) assert.deepEqual(manifest['uses-permission'].filter(entry => entry.$['android:name'] === permission),
    [{ $: { 'android:name': permission, 'tools:node': 'remove' } }]);
  for (const permission of ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.VIBRATE'])
    assert.equal(manifest['uses-permission'].find(entry => entry.$['android:name'] === permission).$['tools:node'], undefined);
});
