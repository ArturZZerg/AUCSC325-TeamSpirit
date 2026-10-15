import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../', import.meta.url));
const expoConfigRequire = createRequire(require.resolve('@expo/config-plugins'));
const xcodeRequire = () => createRequire(expoConfigRequire.resolve('xcode'));

test('Xcode CommonJS tooling generates unique project references that survive writing and reparsing', t => {
  const xcode = expoConfigRequire('xcode'), fixture = fileURLToPath(new URL('./fixtures/xcode-minimal.pbxproj', import.meta.url));
  const project = xcode.project(fixture).parseSync();
  const ids = Array.from({ length: 100 }, (_, i) => project.addPbxGroup([], `Sources${i}`, `Sources${i}`).uuid);
  assert.equal(new Set(ids).size, 100);
  assert.ok(ids.every(id => /^[A-F0-9]{24}$/.test(id)));
  const base = path.resolve(tmpdir()), directory = mkdtempSync(path.join(base, 'campusflow-xcode-compat-'));
  t.after(() => {
    if (path.dirname(path.resolve(directory)) !== base || !path.basename(directory).startsWith('campusflow-xcode-compat-') || lstatSync(directory).isSymbolicLink())
      throw new Error('Unsafe temporary Xcode fixture cleanup');
    rmSync(directory, { recursive: true, force: true });
  });
  const output = path.join(directory, 'project.pbxproj');
  writeFileSync(output, project.writeSync());
  const restored = xcode.project(output).parseSync();
  assert.ok(ids.every(id => restored.allUuids().includes(id)));
  assert.equal(restored.getFirstProject().uuid, project.getFirstProject().uuid);
});

test('Xcode resolved UUID dependency preserves ordinary identifiers and caller buffer padding', () => {
  const uuid = xcodeRequire()('uuid');
  for (const name of ['v3', 'v5']) {
    const expected = uuid[name]('CampusFlow', uuid[name].DNS), bytes = new Uint8Array(24).fill(170);
    assert.equal(uuid[name]('CampusFlow', uuid[name].DNS, bytes, 4), bytes);
    assert.deepEqual([...bytes.subarray(4, 20)], [...Buffer.from(expected.replaceAll('-', ''), 'hex')]);
    assert.deepEqual([...bytes.subarray(0, 4)], Array(4).fill(170));
    assert.deepEqual([...bytes.subarray(20)], Array(4).fill(170));
  }
});

test('Xcode resolved UUID dependency rejects out-of-range output before modifying caller buffers', () => {
  const uuid = xcodeRequire()('uuid');
  for (const name of ['v3', 'v5', 'v6']) {
    for (const [length, offset] of [[8, 4], [16, 1], [16, -1]]) {
      const bytes = new Uint8Array(length).fill(170);
      const call = () => name === 'v6' ? uuid.v6({}, bytes, offset) : uuid[name]('CampusFlow', uuid[name].DNS, bytes, offset);
      assert.throws(call, RangeError);
      assert.deepEqual([...bytes], Array(length).fill(170));
    }
  }
});

test('shell quoting preserves ordinary arguments and rejects newlines following a comment', () => {
  const { quote } = require('shell-quote');
  assert.equal(quote(['node', '--version']), 'node --version');
  for (const newline of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => quote(['echo', 'safe', { comment: 'comment' }, `value${newline}unexpected`]), TypeError);
  }
});

test('indexed source maps resolve ordinary positions and reject unsafe section offsets before processing mappings', () => {
  const { SourceMapConsumer } = require('source-map-js');
  const section = { version: 3, sources: ['student.ts'], names: [], mappings: 'CAAA' };
  const indexed = line => ({ version: 3, sections: [{ offset: { line, column: 0 }, map: section }] });
  const ordinary = new SourceMapConsumer(indexed(0));
  assert.deepEqual(ordinary.originalPositionFor({ line: 1, column: 1 }), { source: 'student.ts', line: 1, column: 0, name: null });
  for (const offset of [Number.MAX_SAFE_INTEGER, Infinity, -1, 0.5]) {
    assert.throws(() => new SourceMapConsumer(indexed(offset)), /Section offset/);
  }
});

test('template compilation preserves escaping and rejects malformed public AST input', () => {
  const handlebars = require('handlebars');
  assert.equal(handlebars.compile('Hello {{name}}')({ name: '<student>' }), 'Hello &lt;student&gt;');
  const ast = handlebars.parse('Hello {{name}}');
  ast.body[1].path.parts = [{ value: 'name' }];
  assert.throws(() => handlebars.precompile(ast), /Invalid AST/);
});

test('Prisma configuration merging preserves ordinary nested configuration and handles circular input without stack exhaustion', () => {
  const configRequire = createRequire(require.resolve('@prisma/config'));
  const { deepmerge } = configRequire('deepmerge-ts');
  const original = { migrations: { path: 'migrations', seed: 'seed command' }, datasource: { url: 'configured-url' } };
  const merged = deepmerge(original, { migrations: { path: 'new-migrations' } });
  assert.deepEqual(merged, { migrations: { path: 'new-migrations', seed: 'seed command' }, datasource: { url: 'configured-url' } });
  assert.equal(original.migrations.path, 'migrations');
  const first = {}, second = {}; first.self = first; second.self = second;
  assert.doesNotThrow(() => deepmerge(first, second));
});

test('Prisma 6 CLI loads its patched configuration dependencies and validates real schema/input failures', t => {
  const base = path.resolve(tmpdir()), directory = mkdtempSync(path.join(base, 'campusflow-prisma-compat-'));
  t.after(() => {
    if (path.dirname(path.resolve(directory)) !== base || !path.basename(directory).startsWith('campusflow-prisma-compat-') || lstatSync(directory).isSymbolicLink())
      throw new Error('Unsafe temporary configuration cleanup');
    rmSync(directory, { recursive: true, force: true });
  });
  const config = path.join(directory, 'prisma.config.cjs'), schema = path.join(root, 'apps/api/prisma/schema.prisma');
  const configFor = schema => `const { defineConfig } = require(${JSON.stringify(require.resolve('@prisma/config'))});\nmodule.exports = defineConfig({ schema: ${JSON.stringify(schema)}, migrations: { path: ${JSON.stringify(path.join(root, 'apps/api/prisma/migrations'))} }, engine: 'classic', datasource: { url: process.env.DATABASE_URL } });\n`;
  writeFileSync(config, configFor(schema));
  const prismaPackage = require.resolve('prisma/package.json');
  const prismaBin = path.resolve(path.dirname(prismaPackage), JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma);
  const run = () => spawnSync(process.execPath, [prismaBin, 'validate', '--config', config], { cwd: root, encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'postgresql://compatibility_user:compatibility_password@127.0.0.1:55435/campusflow_test' }, timeout: 15_000, windowsHide: true });
  const valid = run();
  assert.equal(valid.status, 0, 'Prisma configuration must validate through the patched dependency graph');
  assert.match(valid.stdout + valid.stderr, /schema.*valid/i);
  assert.doesNotMatch(valid.stdout + valid.stderr, /compatibility_password/);
  const invalidSchema = path.join(directory, 'invalid.prisma');
  writeFileSync(invalidSchema, `${readFileSync(schema, 'utf8').split('model User {')[0]}model Invalid {\n id String? @id\n}\n`);
  writeFileSync(config, configFor(invalidSchema));
  const invalid = run();
  assert.equal(invalid.status, 1); assert.match(invalid.stdout + invalid.stderr, /P1012/);
  assert.doesNotMatch(invalid.stdout + invalid.stderr, /compatibility_password/);
});
