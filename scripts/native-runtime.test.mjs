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
