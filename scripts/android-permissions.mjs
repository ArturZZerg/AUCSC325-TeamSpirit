import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const application = 'com.campusflow.mobile';
const receiver = `${application}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;
// Reviewed from the actual SDK 55 APK. SDK notification/network/launcher support
// is retained; a new permission needs a purpose review before entering this list.
const allowed = new Set([
  'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.VIBRATE', 'android.permission.WAKE_LOCK', receiver,
  'com.google.android.c2dm.permission.RECEIVE',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
  'com.sec.android.provider.badge.permission.READ', 'com.sec.android.provider.badge.permission.WRITE',
  'com.htc.launcher.permission.READ_SETTINGS', 'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.sonyericsson.home.permission.BROADCAST_BADGE', 'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT', 'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.huawei.android.launcher.permission.CHANGE_BADGE', 'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS', 'android.permission.READ_APP_BADGE',
  'com.oppo.launcher.permission.READ_SETTINGS', 'com.oppo.launcher.permission.WRITE_SETTINGS',
  'me.everything.badger.permission.BADGE_COUNT_READ', 'me.everything.badger.permission.BADGE_COUNT_WRITE',
]);
const required = ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.VIBRATE'];
const name = '[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)+';
const usage = new RegExp(`^uses-permission(?:-sdk-\\d+)?: name='(${name})'(?: maxSdkVersion='(\\d+)')?$`);
const declaration = new RegExp(`^permission: (${name})$`);

export function checkAndroidPermissionReport(report) {
  if (typeof report !== 'string' || !report.trim() || report.length > 262144)
    throw new Error('Missing or oversized Android permission report.');
  const lines = report.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 512) throw new Error('Oversized Android permission report.');
  let packageName;
  const permissions = new Set(), declarations = new Set(), unrestricted = new Set();
  for (const line of lines) {
    if (line.startsWith('package: ')) {
      if (packageName || line !== `package: ${application}`) throw new Error('APK package does not match CampusFlow.');
      packageName = application; continue;
    }
    const used = usage.exec(line), declared = declaration.exec(line);
    if (used) {
      permissions.add(used[1]);
      if (line.startsWith('uses-permission: ') && used[2] === undefined) unrestricted.add(used[1]);
    } else if (declared) declarations.add(declared[1]);
    else throw new Error('Unrecognized Android permission report; inspect the SDK output.');
  }
  if (!packageName) throw new Error('Missing APK package identity.');
  const unknown = [...permissions].filter(permission => !allowed.has(permission));
  if (unknown.length) throw new Error(`Unreviewed Android permissions: ${unknown.sort().join(', ')}`);
  if ([...declarations].some(permission => permission !== receiver)) throw new Error('Unreviewed custom Android permission.');
  const missing = required.filter(permission => !unrestricted.has(permission));
  if (missing.length) throw new Error(`Missing unrestricted app/reminder permissions: ${missing.join(', ')}`);
  return { packageName, permissions: [...permissions].sort(), declaredPermissions: [...declarations].sort() };
}

export function inspectAndroidPermissions(apk, aapt) {
  let report;
  try { report = execFileSync(aapt, ['dump', 'permissions', apk], { encoding: 'utf8', timeout: 15000, maxBuffer: 262144, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('Cannot inspect APK permissions using Android SDK aapt2.'); }
  return checkAndroidPermissionReport(report);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/android-permissions.mjs <apk> <aapt2>');
    console.log(JSON.stringify(inspectAndroidPermissions(process.argv[2], process.argv[3]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
