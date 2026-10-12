import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, lstatSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectRuntime } from './runtime-dependencies.mjs';

function fixture(t) {
  const base = path.resolve(tmpdir()), root = mkdtempSync(path.join(base, 'campusflow-runtime-'));
  t.after(() => {
    if (path.dirname(root) !== base || !path.basename(root).startsWith('campusflow-runtime-') || lstatSync(root).isSymbolicLink()) throw new Error('Unsafe runtime fixture cleanup');
    rmSync(root, { recursive: true, force: true });
  });
  const write = (file, value) => { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, value); };
  for (const workspace of ['apps/api', 'packages/contracts', 'packages/domain']) {
    write(`${workspace}/package.json`, JSON.stringify({ name: workspace, dependencies: { zod: '3.25.76' } }));
    write(`${workspace}/dist/${workspace === 'apps/api' ? 'src/main' : 'index'}.js`, '');
  }
  const pkg = (directory, name, version = '1.0.0') => { write(`${directory}/package.json`, JSON.stringify({ name, version, main: 'index.js' })); write(`${directory}/index.js`, ''); };
  pkg('node_modules/zod', 'zod', '3.25.76');
  write('node_modules/.prisma/client/default.js', '');
  return { root, write, pkg };
}

test('accepts compiled workspaces and installed runtime dependencies', t => {
  const { root, write } = fixture(t);
  write('node_modules/.prisma/client/package.json', JSON.stringify({ name: 'prisma-client-generated' }));
  const report = inspectRuntime(root);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.packages, [{ name: 'zod', version: '3.25.76', location: 'node_modules/zod' }]);
});

test('rejects nested test/CLI packages and uncompiled private source', t => {
  const { root, pkg, write } = fixture(t);
  pkg('node_modules/runtime/node_modules/@jest/core', '@jest/core');
  pkg('node_modules/runtime', 'runtime');
  pkg('apps/api/node_modules/prisma', 'prisma');
  write('apps/api/src/main.ts', '');
  assert.deepEqual(inspectRuntime(root).violations, [
    'Build/test package is shipped: @jest/core', 'Build/test package is shipped: prisma',
    'Non-runtime application files are shipped: apps/api/src'
  ]);
});

test('reports missing declared dependencies without loading application code', t => {
  const { root, write } = fixture(t);
  write('apps/api/package.json', JSON.stringify({ dependencies: { 'absent-runtime-module': '1.0.0' } }));
  write('node_modules/zod/index.js', 'throw new Error("Inventory must not execute packages");');
  assert.deepEqual(inspectRuntime(root).violations, ['Missing runtime dependency for apps/api: absent-runtime-module']);
});

test('inventories linked workspace dependencies once, without recursion through cycles', t => {
  const { root, write, pkg } = fixture(t);
  pkg('packages/contracts', '@campusflow/contracts');
  write('apps/api/package.json', JSON.stringify({ dependencies: { '@campusflow/contracts': '0.1.0' } }));
  mkdirSync(path.join(root, 'node_modules/@campusflow'), { recursive: true });
  symlinkSync(path.join(root, 'packages/contracts'), path.join(root, 'node_modules/@campusflow/contracts'), 'junction');
  mkdirSync(path.join(root, 'packages/contracts/node_modules'), { recursive: true });
  symlinkSync(path.join(root, 'node_modules/zod'), path.join(root, 'packages/contracts/node_modules/zod'), 'junction');
  symlinkSync(path.join(root, 'packages/contracts'), path.join(root, 'packages/contracts/node_modules/contracts'), 'junction');
  assert.deepEqual(inspectRuntime(root).violations, []);
  assert.equal(inspectRuntime(root).packages.filter(pkg => pkg.name === '@campusflow/contracts').length, 1);
});

test('rejects a package link outside the application instead of inspecting its files', t => {
  const { root } = fixture(t), outside = fixture(t);
  symlinkSync(path.join(outside.root, 'node_modules/zod'), path.join(root, 'node_modules/external'), 'junction');
  assert.deepEqual(inspectRuntime(root).violations, ['Package link escapes the application']);
});
