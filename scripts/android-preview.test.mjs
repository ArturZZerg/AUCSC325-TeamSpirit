import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const plugin = require('../apps/mobile/plugins/with-preview-network.cjs');

async function apply(config, manifest, directory) {
  const modRequest = { platform: 'android', platformProjectRoot: directory };
  await config.mods.android.dangerous({ modRequest });
  return (await config.mods.android.manifest({ modRequest, modResults: manifest })).modResults;
}

test('preview configuration permits HTTP only for its selected private host', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'campusflow-plugin-'));
  t.after(() => {
    assert.equal(path.dirname(directory), tmpdir());
    assert.ok(path.basename(directory).startsWith('campusflow-plugin-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const manifest = { manifest: { application: [{ $: {} }] } };
  await apply(plugin({}, { enabled: true, apiUrl: 'http://192.168.1.2:3000' }), manifest, directory);
  const file = path.join(directory, 'app/src/main/res/xml/campusflow_preview_network.xml');
  const xml = readFileSync(file, 'utf8');
  assert.match(xml, /base-config cleartextTrafficPermitted="false"/);
  assert.match(xml, /<domain includeSubdomains="false">192\.168\.1\.2<\/domain>/);
  assert.equal(manifest.manifest.application[0].$['android:networkSecurityConfig'], '@xml/campusflow_preview_network');

  // Regenerating a normal build must also remove a previous preview exception.
  await apply(plugin({}, { enabled: false, apiUrl: 'http://192.168.1.2:3000' }), manifest, directory);
  assert.equal(manifest.manifest.application[0].$['android:networkSecurityConfig'], undefined);
  assert.equal(existsSync(file), false);
});

test('preview rejects public HTTP and credentials in local URLs', () => {
  for (const apiUrl of ['http://example.test', 'http://localhost:3000@public.example', 'http://user:password@localhost:3000', 'ftp://localhost']) {
    assert.throws(() => plugin({}, { enabled: true, apiUrl }));
  }
});

test('HTTPS builds do not add an HTTP exception or change another network policy', async () => {
  const config = plugin({}, { enabled: true, apiUrl: 'https://api.example.test' });
  const manifest = { manifest: { application: [{ $: { 'android:networkSecurityConfig': '@xml/existing_policy' } }] } };
  await config.mods.android.manifest({ modRequest: { platform: 'android' }, modResults: manifest });
  assert.equal(manifest.manifest.application[0].$['android:networkSecurityConfig'], '@xml/existing_policy');
});
