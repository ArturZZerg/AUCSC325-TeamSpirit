import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../', import.meta.url));
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
