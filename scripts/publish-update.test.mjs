import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildManifest, latestRelease } from './publish-update.mjs';

const origin = 'https://updates.example.test/campusflow-updates';
function fakeExport(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'campusflow-update-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, '_expo/static/js/android'), { recursive: true }); mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, '_expo/static/js/android/entry-1.hbc'), 'bundle');
  writeFileSync(path.join(dir, 'assets/abc'), 'png-bytes'); writeFileSync(path.join(dir, 'assets/def'), 'png-bytes');
  writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ version: 0, bundler: 'metro', fileMetadata: { android: {
    bundle: '_expo/static/js/android/entry-1.hbc', assets: [{ path: 'assets/abc', ext: 'png' }, { path: 'assets/def', ext: 'ttf' }] } } }));
  return dir;
}
const sha = value => createHash('sha256').update(value).digest('hex');

test('builds a protocol v1 manifest with base64url SHA-256 hashes and content-addressed URLs', t => {
  const exportDir = fakeExport(t);
  const { manifest, copies, manifestPath } = buildManifest({ exportDir, runtimeVersion: '4', origin, id: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-10-24T05:00:00.000Z', expoClient: { name: 'CampusFlow' }, commit: 'abc123' });
  assert.equal(manifestPath, 'android/4/manifest.json');
  assert.deepEqual(manifest.launchAsset, { hash: createHash('sha256').update('bundle').digest('base64url'), key: createHash('md5').update('bundle').digest('hex'),
    contentType: 'application/javascript', url: `${origin}/assets/${sha('bundle')}` });
  assert.deepEqual(manifest.assets.map(item => [item.contentType, item.fileExtension]), [['image/png', '.png'], ['font/ttf', '.ttf']]);
  assert.ok(manifest.assets.every(item => !/[+/=]/.test(item.hash)));
  assert.deepEqual(manifest.extra, { expoClient: { name: 'CampusFlow' }, campusflowCommit: 'abc123' });
  assert.equal(manifest.runtimeVersion, '4'); assert.equal(manifest.createdAt, '2026-10-24T05:00:00.000Z');
  // Identical bytes share one stored file.
  assert.equal(new Set(copies.map(copy => copy.target)).size, 2);
});

test('refuses unsafe runtime versions and exports without an Android bundle', t => {
  const exportDir = fakeExport(t);
  assert.throws(() => buildManifest({ exportDir, runtimeVersion: '../1', origin }), /whole number/);
  assert.throws(() => buildManifest({ exportDir, runtimeVersion: '1', platform: 'ios', origin }), /no ios bundle/);
});

test('describes a native release with the APK checksum', t => {
  const exportDir = fakeExport(t), apkFile = path.join(exportDir, 'app.apk');
  writeFileSync(apkFile, 'apk');
  assert.deepEqual(latestRelease({ runtimeVersion: '2', version: '0.2.0', apkFile, origin, publishedAt: '2026-10-24T05:00:00.000Z' }),
    { runtimeVersion: '2', version: '0.2.0', sha256: sha('apk'), publishedAt: '2026-10-24T05:00:00.000Z', apkUrl: `${origin}/android/campusflow-2.apk` });
});
