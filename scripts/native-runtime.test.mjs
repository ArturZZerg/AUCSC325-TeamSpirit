import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLineEndings } from './native-runtime.mjs';

test('project text files hash identically with CRLF or LF; packages and binaries are untouched', () => {
  const file = filePath => ({ type: 'file', filePath });
  assert.equal(normalizeLineEndings(file('config/app-updates.cjs'), Buffer.from('a\r\nb\r\n')).toString(), 'a\nb\n');
  assert.equal(normalizeLineEndings(file('native-runtime.json'), 'x\r\n').toString(), 'x\n');
  const png = Buffer.from([0x89, 0x0d, 0x0a]);
  assert.equal(normalizeLineEndings(file('assets/icon.png'), png), png);
  const vendored = Buffer.from('a\r\n');
  assert.equal(normalizeLineEndings(file('../../node_modules/expo/app.plugin.js'), vendored), vendored);
  assert.equal(normalizeLineEndings({ type: 'contents', id: 'expoConfig' }, 'a\r\n'), 'a\r\n');
  assert.equal(normalizeLineEndings(file('app.json'), null), null);
});

test('Windows and Linux agree: tooling modules the Expo config loader pulled in are dropped', async () => {
  const { isLoaderToolingSource } = await import('./native-runtime.mjs');
  const loaded = filePath => ({ type: 'file', filePath, reasons: ['expoConfigPlugins'] });
  assert.equal(isLoaderToolingSource(loaded('../../node_modules/@expo/config-plugins/build/index.js')), true);
  assert.equal(isLoaderToolingSource(loaded('../../node_modules/@expo/config-plugins/node_modules/resolve-from/index.js')), true);
  assert.equal(isLoaderToolingSource(loaded('../../node_modules/chalk/source/index.js')), true);
  assert.equal(isLoaderToolingSource(loaded('../../node_modules/expo/config-plugins.js')), true);
  // Config plugins the app uses are native inputs and stay hashed on every platform.
  assert.equal(isLoaderToolingSource(loaded('../../node_modules/@react-native-community/datetimepicker/plugin/build/withDateTimePickerStyles.js')), false);
  assert.equal(isLoaderToolingSource(loaded('plugins/with-preview-network.cjs')), false);
  assert.equal(isLoaderToolingSource({ type: 'dir', filePath: '../../node_modules/@expo/log-box/android', reasons: ['expoAutolinkingAndroid'] }), false);
  assert.equal(isLoaderToolingSource({ ...loaded('../../node_modules/@expo/config/build/index.js'), reasons: ['expoConfigPlugins', 'other'] }), false);
});

test('rehashing sources reproduces the @expo/fingerprint hash', async () => {
  const { hashSources } = await import('./native-runtime.mjs');
  const { createHash } = await import('node:crypto');
  const sources = [{ type: 'contents', id: 'expoConfig', hash: 'a' }, { type: 'file', filePath: 'app.json', hash: 'b' },
    { type: 'dir', filePath: 'android', hash: null }, { type: 'dir', filePath: 'x', overrideHashKey: 'k', hash: 'c' }];
  assert.equal(hashSources(sources), createHash('sha1').update('expoConfig').update('a').update('app.json').update('b').update('k').update('c').digest('hex'));
});

test('the mirrored loader ignore list matches the installed @expo/fingerprint', async () => {
  const { loaderIgnoredPackages } = await import('./native-runtime.mjs');
  const { createRequire } = await import('node:module');
  const require = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
  const source = (await import('node:fs')).readFileSync(require.resolve('@expo/fingerprint/build/ExpoConfigLoader.js'), 'utf8');
  const from = source.indexOf('[', source.indexOf('DEFAULT_CONFIG_LOADING_IGNORE_PATHS = ['));
  // A plain array literal of strings in the installed dependency; evaluate it rather than re-parse it.
  const patterns = new Function(`return ${source.slice(from, source.indexOf('\n];', from) + 2)};`)();
  const installed = new Set();
  for (const pattern of patterns) {
    const match = /^\*\*\/node_modules\/(?:\{(.+)\}|(.+?))\/\*\*\/\*$/.exec(pattern);
    if (!match) continue; // package.json and the expo/config* files are handled separately
    for (const name of (match[1] ?? match[2]).split(',')) if (!name.startsWith('expo/')) installed.add(name);
  }
  assert.deepEqual([...installed].sort(), [...loaderIgnoredPackages].sort());
});
