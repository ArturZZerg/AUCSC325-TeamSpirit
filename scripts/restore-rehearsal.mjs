import 'reflect-metadata';
import { PrismaClient, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
export function rehearsalConfig(env) {
  let url;
  try { url = new URL(env.REHEARSAL_DATABASE_URL); } catch { throw new Error('Invalid REHEARSAL_DATABASE_URL'); }
  const database = url.pathname.slice(1), schema = url.searchParams.get('schema') ?? 'public';
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    !url.port || Number(url.port) < 1024 || Number(url.port) > 65535 || url.port === '5432' ||
    !/^campusflow_(?:[a-z0-9_]+_)?test$/.test(database) || !url.username || url.hash ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(schema) || url.searchParams.getAll('schema').length > 1 ||
    [...url.searchParams.keys()].some(key => key !== 'schema'))
    throw new Error('Rehearsal requires an explicitly named CampusFlow test database on an isolated loopback port; default port 5432 is refused');
  if (env.PG_DOCKER_CONTAINER && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(env.PG_DOCKER_CONTAINER)) throw new Error('Invalid PG_DOCKER_CONTAINER');
  return { url, database, schema, bin: env.PG_BIN, container: env.PG_DOCKER_CONTAINER };
}
export function restoreName() { return `campusflow_restore_${randomUUID().replace(/-/g, '')}`; }
export function assertRestoreTarget(name, source) {
  if (!/^campusflow_restore_[a-f0-9]{32}$/.test(name) || name === source) throw new Error('Unsafe restore database target');
}
function identifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) throw new Error('Unsafe database identifier');
  return Prisma.raw(`"${name}"`);
}

async function pgTool(tool, arguments_, config, { input, output } = {}) {
  const executable = config.container ? 'docker' : config.bin ? path.join(config.bin, `${tool}${process.platform === 'win32' ? '.exe' : ''}`) : tool;
  const args = config.container ? ['exec', '-i', '-e', 'PGPASSWORD', config.container, tool, ...arguments_] : arguments_;
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(config.url.password), PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable' };
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGOPTIONS']) delete env[key];
  const child = spawn(executable, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostic = '';
  child.stderr.on('data', chunk => { if (diagnostic.length < 4000) diagnostic += chunk.toString(); });
  let timer;
  const completed = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(`${tool} could not start; configure PG_BIN or PG_DOCKER_CONTAINER`)));
    child.once('close', code => {
      const reason = ['server version mismatch', 'password authentication failed', 'permission denied', 'invalid snapshot identifier',
        'does not exist', 'could not connect', 'unrecognized option'].find(reason => diagnostic.includes(reason)) ?? 'client or database operation failed';
      if (code === 0) resolve(); else reject(new Error(`${tool}: ${reason}`));
    });
    timer = setTimeout(() => { child.kill(); reject(new Error(`${tool} exceeded the 60 second local rehearsal limit`)); }, 60_000);
  });
  const transfer = output ? pipeline(child.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 })) : Promise.resolve(child.stdout.resume());
  const supply = input ? pipeline(createReadStream(input), child.stdin) : Promise.resolve(child.stdin.end());
  try {
    const results = await Promise.allSettled([completed, transfer, supply]);
    if (results[0].status === 'rejected') throw results[0].reason;
    for (const result of results.slice(1)) if (result.status === 'rejected') throw new Error(`${tool}: file transfer failed`);
  } finally { clearTimeout(timer); child.kill(); }
}
async function fingerprints(db, schema, tables) {
  const result = {};
  for (const table of [...tables, '_prisma_migrations']) {
    const rows = await db.$queryRaw(Prisma.sql`SELECT row_to_json(t)::text AS value FROM ${identifier(schema)}.${identifier(table)} t LIMIT 100001`);
    if (rows.length > 100000) throw new Error('Local rehearsal table exceeds the supported test dataset size');
    const hashes = rows.map(row => createHash('sha256').update(row.value).digest('hex')).sort();
    result[table] = { count: rows.length, sha256: createHash('sha256').update(hashes.join('\n')).digest('hex') };
  }
  const constraints = await db.$queryRaw`SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} ORDER BY c.relname, con.conname`;
  const indexes = await db.$queryRaw`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = ${schema} ORDER BY tablename, indexname`;
  result.schema = { sha256: createHash('sha256').update(JSON.stringify({ constraints, indexes })).digest('hex'), constraints, indexes };
  return result;
}

export async function restoreRehearsal(config, { report = console.log } = {}) {
  config = rehearsalConfig({ REHEARSAL_DATABASE_URL: config.url.toString(), PG_BIN: config.bin, PG_DOCKER_CONTAINER: config.container });
  const local = path.join(root, '.local'); await mkdir(local, { recursive: true });
  if ((await lstat(local)).isSymbolicLink() || path.relative(await realpath(root), await realpath(local)) !== '.local')
    throw new Error('Rehearsal output must remain in this workspace .local directory');
  const base = path.join(local, 'restore-rehearsals'); await mkdir(base, { recursive: true });
  if ((await lstat(base)).isSymbolicLink() || path.dirname(await realpath(base)) !== await realpath(local)) throw new Error('Unsafe rehearsal output directory');
  const directory = await mkdtemp(path.join(base, 'run-')), dump = path.join(directory, 'database.dump');
  const target = restoreName(); assertRestoreTarget(target, config.database);
  const sourceUrl = config.url.toString(), adminUrl = new URL(sourceUrl), targetUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres'; adminUrl.search = ''; targetUrl.pathname = `/${target}`;
  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  const restored = new PrismaClient({ datasources: { db: { url: targetUrl.toString() } } });
  let created = false, result, failure, phase = 'source snapshot';
  try {
    const { requiredSchema } = require('../apps/api/dist/src/schema-manifest.js');
    const connection = ['--host', config.container ? '127.0.0.1' : config.url.hostname.replace(/^\[|\]$/g, ''),
      '--port', config.container ? '5432' : config.url.port, '--username', decodeURIComponent(config.url.username)];
    const before = await source.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [{ snapshot }] = await tx.$queryRaw`SELECT pg_export_snapshot() AS snapshot`;
      phase = 'pg_dump snapshot';
      await pgTool('pg_dump', [...connection, '--dbname', config.database, '--format=custom', '--no-owner', '--no-acl', '--snapshot', snapshot], config, { output: dump });
      phase = 'source record fingerprint';
      return fingerprints(tx, config.schema, requiredSchema.tables.map(table => table.name));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 120_000 });
    phase = 'create disposable database';
    await admin.$executeRaw(Prisma.sql`CREATE DATABASE ${identifier(target)} TEMPLATE template0`); created = true;
    phase = 'pg_restore';
    await pgTool('pg_restore', [...connection, '--dbname', target, '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction'], config, { input: dump });
    phase = 'restored record and relationship verification';
    const after = await fingerprints(restored, config.schema, requiredSchema.tables.map(table => table.name));
    const mismatches = Object.keys(before).filter(table => JSON.stringify(before[table]) !== JSON.stringify(after[table]));
    if (mismatches.length) {
      await writeFile(path.join(directory, 'comparison.json'), JSON.stringify({ mismatches, before, after }, null, 2), { mode: 0o600 });
      throw new Error('Restored records, migration metadata or relationships differ from the source snapshot');
    }
    phase = 'restored dependency readiness';
    const { HealthService } = require('../apps/api/dist/src/health.js');
    const previous = process.env.DATABASE_URL;
    try { process.env.DATABASE_URL = targetUrl.toString();
      if (!await new HealthService(restored).ready()) throw new Error('Restored application schema is not ready');
    } finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
    result = { mode: 'isolated-local-rehearsal', verifiedAt: new Date().toISOString(), tables: Object.keys(before).length - 1,
      records: Object.values(before).reduce((sum, table) => sum + (table.count ?? 0), 0), sourcePreserved: true, restoreRemoved: false };
  } catch (error) {
    const detail = /^(pg_dump|pg_restore): (server version mismatch|password authentication failed|permission denied|invalid snapshot identifier|does not exist|could not connect|unrecognized option|client or database operation failed|file transfer failed)$/.test(error.message) ? ` ${error.message}.` : '';
    failure = new Error(`Local restore rehearsal failed during ${phase}.${detail} Source is preserved; check tooling, schema, versions and test privileges. Private output remains under .local/restore-rehearsals.`);
  }
  finally {
    const disconnected = await Promise.allSettled([source.$disconnect(), restored.$disconnect()]);
    if (disconnected.some(result => result.status === 'rejected')) failure = new Error('Local rehearsal client cleanup failed');
    try { if (created) { assertRestoreTarget(target, config.database); await admin.$executeRaw(Prisma.sql`DROP DATABASE ${identifier(target)}`); } }
    catch { failure = new Error(`Disposable restore cleanup failed for ${target}; source database was not selected for deletion`); }
    try { await admin.$disconnect(); } catch { failure = new Error('Local rehearsal administrative client cleanup failed'); }
  }
  if (failure) throw failure;
  result.restoreRemoved = true;
  await writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  report(`Local restore passed: ${result.tables} tables, ${result.records} records; source preserved and disposable restore removed`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await restoreRehearsal(rehearsalConfig(process.env)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
