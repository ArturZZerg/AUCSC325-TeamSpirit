import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSharedPackages } from './shared-packages.mjs';

test('builds the shared packages with the workspace script before bundling', () => {
  const calls = [];
  buildSharedPackages({ cwd: '/repo', spawn: (...args) => { calls.push(args); return { status: 0 }; } });
  assert.equal(calls.length, 1);
  const options = calls[0].at(-1);
  assert.match([calls[0][0], ...(Array.isArray(calls[0][1]) ? calls[0][1] : [])].join(' '), /^npm run build:shared$/);
  assert.equal(options.cwd, '/repo');
});

test('refuses to continue when the shared packages fail to build', () => {
  assert.throws(() => buildSharedPackages({ spawn: () => ({ status: 2 }) }), /build:shared/);
  assert.throws(() => buildSharedPackages({ spawn: () => ({ error: new Error('npm missing') }) }), /npm missing/);
});
