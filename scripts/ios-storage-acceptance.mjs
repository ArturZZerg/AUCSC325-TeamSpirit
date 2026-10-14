import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { sessionSchema, personalTaskSchema } from '@campusflow/contracts';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiUrl = 'http://127.0.0.1:3000';
export function storageAcceptanceConfig(env, platform) {
  if (platform !== 'darwin' || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_OS !== 'macOS')
    throw new Error('Storage acceptance requires the disposable macOS Actions runner.');
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(env.IOS_SIMULATOR_UDID ?? ''))
    throw new Error('An explicit job-owned simulator UUID is required.');
  if (!path.isAbsolute(env.IOS_PG_BIN ?? '')) throw new Error('An absolute PostgreSQL tool directory is required.');
  if (env.EXPO_PUBLIC_API_URL && env.EXPO_PUBLIC_API_URL !== apiUrl)
    throw new Error('Only the fixed loopback simulator API is allowed.');
  return { udid: env.IOS_SIMULATOR_UDID, pgBin: env.IOS_PG_BIN, apiUrl };
}

export function assertOwnedTask(values, title, date) {
  assert.equal(values.length, 1, 'The fresh account must have exactly one task.');
  const task = personalTaskSchema.parse(values[0]);
  assert.equal(task.title, title); assert.deepEqual(task.scheduled, { kind: 'date', date });
  assert.equal(task.due, null); assert.equal(task.reminder, null);
  return task;
}

export function publicFlowFailure(log, privateValues) {
  const clean = log.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
  const match = clean.match(/(?:Assertion is false:|Element not found:|Unable to find element:)[^\r\n]*/);
  if (!match) return undefined;
  return privateValues.reduce((text, value) => text.replaceAll(value, '[private]'), match[0]).slice(0, 250);
}

/** Diagnostic structure only: omit selectors, inputs, variables and UI hierarchy. */
export function privateFlowTimeline(records) {
  const actions = new Set(['launchAppCommand', 'openLinkCommand', 'runFlowCommand', 'tapOnElement', 'inputTextCommand',
    'hideKeyboardCommand', 'assertConditionCommand', 'waitForAnimationToEndCommand', 'scrollUntilVisible', 'scrollUntilVisibleCommand',
    'stopAppCommand', 'applyConfigurationCommand', 'defineVariablesCommand', 'takeScreenshotCommand']);
  const states = new Set(['COMPLETED', 'FAILED', 'RUNNING', 'PENDING']);
  if (!Array.isArray(records)) return [];
  return records.slice(0, 200).map((record, index) => {
    const action = Object.keys(record?.command ?? {}).find(name => actions.has(name)) ?? 'unknown';
    const metadata = record?.metadata ?? {};
    return { sequence: Number.isSafeInteger(metadata.sequenceNumber) ? metadata.sequenceNumber : index,
      action, status: states.has(metadata.status) ? metadata.status : 'UNKNOWN',
      durationMs: Number.isFinite(metadata.duration) ? Math.max(0, Math.min(metadata.duration, 3_600_000)) : null };
  }).sort((a, b) => a.sequence - b.sequence);
}

export function privateViewSummary(hierarchy) {
  const known = { auth: 'Welcome back', today: 'Your daily flow', editor: 'New task', capture: 'today-add-task',
    titleInput: 'task-title', save: 'Save task', cleanupRetry: 'Retry device cleanup',
    savePassword: 'Save Password', notNow: 'Not Now', passwords: 'Passwords',
    settingsTab: 'Settings, tab, 5 of 5', settings: 'Settings', signOut: 'Sign out' };
  const result = Object.fromEntries(Object.keys(known).map(name => [name, false]));
  function visit(value, depth) {
    if (depth > 40 || value === null || typeof value !== 'object') return;
    for (const child of Object.values(value)) {
      if (typeof child === 'string') {
        for (const [name, label] of Object.entries(known)) if (child === label) result[name] = true;
      } else visit(child, depth + 1);
    }
  }
  visit(hierarchy, 0);
  return result;
}

export function saveFlowTimeline(directory, output, depth = 0) {
  if (depth > 3) return false;
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return false; }
  for (const entry of entries.slice(0, 50)) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && saveFlowTimeline(file, output, depth + 1)) return true;
    if (entry.isFile() && /^(commands|commands-.*)\.json$/.test(entry.name)) {
      try { writeFileSync(output, `${JSON.stringify(privateFlowTimeline(JSON.parse(readFileSync(file, 'utf8'))), null, 2)}\n`); return true; }
      catch { /* No raw data fallback; the generic failure stage remains visible. */ }
    }
  }
  return false;
}

async function unusedPort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error('Acceptance requires unoccupied loopback ports.')));
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise(resolve => server.close(resolve));
}

async function run() {
  const config = storageAcceptanceConfig(process.env, process.platform);
  const simulator = spawnSync('xcrun', ['simctl', 'list', 'devices', '--json'], { encoding: 'utf8' });
  if (simulator.status !== 0) throw new Error('Could not inspect the selected simulator.');
  const selected = Object.values(JSON.parse(simulator.stdout).devices).flat().find(device => device.udid === config.udid);
  if (selected?.name !== 'CampusFlowIosQa' || selected.state !== 'Booted') throw new Error('Only this job’s booted QA simulator is allowed.');
  await unusedPort(3000); await unusedPort(55439);
  const runDir = path.join(root, '.local', `ios-storage-${randomUUID()}`);
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const pg = name => path.join(config.pgBin, name);
  const dbPassword = randomBytes(24).toString('hex'), password = randomBytes(24).toString('hex');
  const email = `ios-${randomUUID()}@example.test`, title = `iOS study ${randomUUID().slice(0, 8)}`;
  for (const value of [dbPassword, password, email]) console.log(`::add-mask::${value}`);
  writeFileSync(path.join(runDir, 'pg-password'), dbPassword, { mode: 0o600 });
  const env = { ...process.env, DATABASE_URL: `postgresql://campusflow_ios:${dbPassword}@127.0.0.1:55439/campusflow_ios_test`,
    PGPASSWORD: dbPassword, NODE_ENV: 'development', PORT: '3000', HOST: '127.0.0.1', REGISTRATION_MODE: 'preview',
    CANVAS_MODE: 'disabled', RECOVERY_DELIVERY: 'disabled' };
  // No real accounts, SMTP, external Canvas, global PostgreSQL service or Metro.
  let apiProcess, dbStarted = false, prisma, failure, stage = 'database setup';
  const proof = { commit: process.env.CAMPUSFLOW_BUILD_SHA ?? process.env.GITHUB_SHA,
    api: apiUrl, database: 'disposable PostgreSQL 17 with ordinary NestJS preview registration', checks: [] };
  const command = (executable, args, name, extraEnv = {}) => new Promise((resolve, reject) => {
    const log = openSync(path.join(runDir, `${name}.log`), 'a', 0o600);
    const child = spawn(executable, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: ['ignore', log, log] });
    closeSync(log);
    child.once('error', () => reject(new Error(`Acceptance command could not start: ${name}.`)));
    child.once('exit', code => {
      if (name.startsWith('ios-session-')) saveFlowTimeline(path.join(runDir, name), path.join(root, `artifacts/ios/evidence/${name}-timeline.json`));
      if (code === 0) return resolve();
      // Publish only a bounded assertion summary, never raw Maestro commands/UI dumps.
      const failed = publicFlowFailure(readFileSync(path.join(runDir, `${name}.log`), 'utf8'), [email, password, dbPassword]);
      if (failed) console.error(failed);
      reject(new Error(`Acceptance command failed: ${name}. Private diagnostics stay on the runner.`));
    });
  });
  const stopApi = async () => {
    if (!apiProcess?.pid || apiProcess.exitCode !== null) return;
    const child = apiProcess;
    const done = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
    try { await done; } finally { clearTimeout(timeout); }
  };
  const startApi = async () => {
    const log = openSync(path.join(runDir, 'api.log'), 'a', 0o600);
    apiProcess = spawn(process.execPath, ['apps/api/dist/src/main.js'], { cwd: root, env, stdio: ['ignore', log, log] });
    closeSync(log);
    let failed = false; apiProcess.once('error', () => { failed = true; });
    for (let attempt = 0; attempt < 60; attempt++) {
      if (failed || apiProcess.exitCode !== null) throw new Error('The loopback API did not start.');
      try {
        const response = await fetch(`${apiUrl}/health/ready`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch { /* Bounded readiness polling; private responses are never printed. */ }
      await delay(500);
    }
    throw new Error('Loopback API readiness timed out.');
  };
  const flow = async name => {
    const cli = path.join(root, '.local/maestro/bin/maestro');
    try {
      await command(cli, ['--device', config.udid, 'test', '-e', `IOS_QA_EMAIL=${email}`, '-e', `IOS_QA_PASSWORD=${password}`, '-e', `IOS_QA_TASK=${title}`,
        '--debug-output', path.join(runDir, name), '--test-output-dir', path.join(runDir, name), `.maestro/${name}.yaml`], name);
    } catch (error) {
      try {
        // Default hierarchy reinstalls XCTest and can change the foreground UI.
        await command(cli, ['--device', config.udid, 'hierarchy', '--no-reinstall-driver'], 'private-hierarchy');
        const raw = readFileSync(path.join(runDir, 'private-hierarchy.log'), 'utf8');
        const hierarchy = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        writeFileSync(path.join(root, `artifacts/ios/evidence/${name}-view.json`), `${JSON.stringify(privateViewSummary(hierarchy), null, 2)}\n`);
      } catch { /* No raw hierarchy fallback. Failure stage/timeline remain available. */ }
      throw error;
    }
  };
  const check = name => { proof.checks.push(name); console.log(`iOS storage acceptance passed: ${name}.`); };
  try {
    await command(pg('initdb'), ['-D', path.join(runDir, 'pg'), '-U', 'campusflow_ios', '--auth-host=scram-sha-256',
      '--auth-local=scram-sha-256', `--pwfile=${path.join(runDir, 'pg-password')}`, '--encoding=UTF8', '--no-locale'], 'initdb');
    await command(pg('pg_ctl'), ['-D', path.join(runDir, 'pg'), '-l', path.join(runDir, 'postgres.log'),
      '-o', '-h 127.0.0.1 -p 55439 -k ""', '-w', 'start'], 'pg-start'); dbStarted = true;
    await command(pg('createdb'), ['-h', '127.0.0.1', '-p', '55439', '-U', 'campusflow_ios', 'campusflow_ios_test'], 'createdb');
    await command('npm', ['run', 'db:generate'], 'generate');
    await command('npm', ['run', 'db:migrate'], 'migrate');
    await command('npm', ['run', 'build'], 'api-build');
    const { PrismaClient } = await import('@prisma/client'); prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    await startApi();
    stage = 'ordinary account registration';
    const response = await fetch(`${apiUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName: 'iOS simulator acceptance', timeZone: 'UTC' }), signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 201); const session = sessionSchema.parse(await response.json());
    // Registration token stays in memory; the UI logs in normally and gets its own token.
    console.log(`::add-mask::${session.accessToken}`);
    stage = 'native login and task capture';
    // The public flow ends on Help: the flow opens Today through the normal sign-in gate.
    await flow('ios-session-login');
    const tasks = await fetch(`${apiUrl}/tasks`, { headers: { Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(5000) });
    assert.equal(tasks.status, 200);
    const task = assertOwnedTask(await tasks.json(), title, new Date().toISOString().slice(0, 10));
    assert.equal(await prisma.session.count({ where: { userId: session.user.id, revokedAt: null } }), 2);
    const container = spawnSync('xcrun', ['simctl', 'get_app_container', config.udid, 'com.campusflow.mobile', 'data'], { encoding: 'utf8' });
    assert.equal(container.status, 0);
    assert.match(session.user.id, /^[0-9a-f-]{36}$/i);
    const cachedCount = () => {
      const result = spawnSync('/usr/bin/sqlite3', ['-readonly', path.join(container.stdout.trim(), 'Documents/SQLite/campusflow-cache.db'),
        `SELECT COUNT(*) FROM snapshots WHERE account_id = '${session.user.id}';`], { encoding: 'utf8' });
      assert.equal(result.status, 0); assert.match(result.stdout.trim(), /^\d+$/); return Number(result.stdout.trim());
    };
    assert.ok(cachedCount() > 0, 'The account must have persisted cache rows before offline restoration.');
    check('ordinary native sign-in, Secure Store write, and API-confirmed task capture');
    stage = 'offline cold restoration'; await stopApi(); await unusedPort(3000);
    await flow('ios-session-offline');
    check('cold session and owned SQLite task restoration with no API listener');
    stage = 'native sign-out cleanup'; await startApi(); await flow('ios-session-cleanup');
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await prisma.session.count({ where: { userId: session.user.id, revokedAt: null } }) === 1) break;
      await delay(250);
    }
    assert.equal(await prisma.session.count({ where: { userId: session.user.id, revokedAt: null } }), 1);
    assert.equal(await prisma.personalTask.count({ where: { userId: session.user.id, id: task.id } }), 1);
    assert.equal(cachedCount(), 0);
    check('native sign-out revocation, zero owned SQLite rows, and retained server task');
    stage = 'offline cold signed-out state'; await stopApi(); await unusedPort(3000);
    await flow('ios-session-signed-out');
    check('cold signed-out state without API revocation fallback');
    proof.result = 'passed';
  } catch {
    proof.result = 'failed'; proof.failedStage = stage;
    failure = new Error(`iOS storage acceptance failed at ${stage}. Credentials, UI dumps and private logs are not published.`);
  } finally {
    const cleanup = await Promise.allSettled([stopApi(), ...(prisma ? [prisma.$disconnect()] : []),
      ...(dbStarted ? [command(pg('pg_ctl'), ['-D', path.join(runDir, 'pg'), '-m', 'fast', '-w', 'stop'], 'pg-stop')] : [])]);
    const failed = cleanup.some(result => result.status === 'rejected');
    proof.cleanup = failed ? 'failed' : 'passed';
    if (failed) { proof.result = 'failed'; proof.failedStage = 'process cleanup'; }
    writeFileSync(path.join(root, 'artifacts/ios/evidence/storage.json'), `${JSON.stringify(proof, null, 2)}\n`);
    if (failed) failure = new Error('iOS storage acceptance process cleanup failed.');
  }
  if (failure) throw failure;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
