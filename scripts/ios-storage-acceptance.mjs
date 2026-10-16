import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { sessionSchema, personalTaskSchema, createPersonalTaskSchema, dateSchema, saveFocusSessionSchema, focusSessionSchema,
  academicItemSchema, createManualAcademicItemSchema, manualAcademicSource } from '@campusflow/contracts';
import { addCalendarDays } from '@campusflow/domain';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiUrl = 'http://127.0.0.1:3000';
const requiredChecks = ['ordinary native sign-in, Secure Store write, and API-confirmed task capture',
  'cold session and owned SQLite task restoration with no API listener',
  'native sign-out revocation, zero owned SQLite rows, and retained server task',
  'cold signed-out state without API revocation fallback'];
const loginStages = ['EMAIL_AND_NEXT', 'PASSWORD_AND_HIDE', 'TODAY', 'COMPLETE'];
const offlineStages = ['RESTORED', 'UNAVAILABLE', 'RETURNED', 'COMPLETE'];
const nativeCases = {
  login: { prefix: 'LOGIN', method: 'testOrdinaryNativeLogin', stages: loginStages, label: 'login' },
  offline: { prefix: 'OFFLINE', method: 'testOfflineRecovery', stages: offlineStages, label: 'offline recovery' },
  courseworkCancel: { prefix: 'COURSEWORK_CANCEL', method: 'testCourseworkNoOpAndCancel',
    stages: ['OPENED', 'NO_OP', 'CANCELLED', 'COMPLETE'], label: 'coursework cancellation' },
  courseworkTitle: { prefix: 'COURSEWORK_TITLE', method: 'testCourseworkTitleSave',
    stages: ['OPENED', 'TITLE_CHANGED', 'SAVED', 'COMPLETE'], label: 'coursework title save' },
  courseworkClear: { prefix: 'COURSEWORK_CLEAR', method: 'testCourseworkDeadlineClear',
    stages: ['OPENED', 'DEADLINE_CLEARED', 'SAVED', 'COMPLETE'], label: 'coursework deadline clearing' },
  courseworkCreate: { prefix: 'COURSEWORK_CREATE', method: 'testCourseworkCreation',
    stages: ['OPENED', 'DRAFT_READY', 'SAVED', 'COMPLETE'], label: 'coursework creation' },
};
const nativeCase = kind => {
  if (!Object.hasOwn(nativeCases, kind)) throw new Error('Unsupported private native test.');
  return nativeCases[kind];
};

/** Never return raw XCTest output: ordinary typing activities contain credentials. */
export function privateLoginStages(log, kind = 'login') {
  const { prefix, stages } = nativeCase(kind);
  if (typeof log !== 'string' || log.length > 16_777_216) return [];
  return stages.filter(stage => log.includes(`\nCAMPUSFLOW_${prefix}_${stage}\n`));
}

export function privateLoginDiagnostics(log, kind = 'login') {
  const { method } = nativeCase(kind);
  const bounded = typeof log === 'string' && log.length <= 16_777_216 ? log : '';
  const namedTest = `Test Case '-[PrivateLoginTests.NativePrivateLoginTests ${method}]'`;
  return { completed: privateLoginStages(bounded, kind),
    started: bounded.includes(`${namedTest} started.`), failed: bounded.includes(`${namedTest} failed (`),
    sourceLines: [...new Set([...bounded.matchAll(/ios-private-login\.swift:(\d{1,4})(?::\d{1,4})?: error:/g)]
      .map(match => Number(match[1])).filter(line => line > 0))].slice(0, 20) };
}

function verifyNativeTest(log, context, kind) {
  const { prefix, method, stages, label } = nativeCase(kind);
  const fail = () => { throw new Error(`Complete source/device/run-matched native ${label} proof required.`); };
  if (!context || !/^[0-9a-f]{40}$/i.test(context.commit ?? '')
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(context.udid ?? '')
    || !/^[1-9][0-9]*$/.test(context.runId ?? '') || !/^[1-9][0-9]*$/.test(context.attempt ?? '')
    || typeof log !== 'string' || !log.length || log.length > 16_777_216) fail();
  const markers = [`CONTEXT=${[context.commit, context.udid, context.runId, context.attempt].join('|')}`, ...stages];
  let previous = -1;
  for (const marker of markers) {
    const line = `\nCAMPUSFLOW_${prefix}_${marker}\n`, index = log.indexOf(line);
    if (index <= previous || log.indexOf(line, index + 1) !== -1) fail();
    previous = index;
  }
  if (!log.includes(`Test Case '-[PrivateLoginTests.NativePrivateLoginTests ${method}]' passed (`)
    || !/Executed 1 test, with 0 failures \(0 unexpected\)/.test(log) || !/\*\* TEST SUCCEEDED \*\*/.test(log)
    || /Test Case .* failed \(|\*\* TEST FAILED \*\*/.test(log)) fail();
  return { commit: context.commit, udid: context.udid, runId: context.runId, attempt: context.attempt,
    result: 'passed', checks: [...stages] };
}
export const verifyNativeLogin = (log, context) => verifyNativeTest(log, context, 'login');
export const verifyNativeOfflineRecovery = (log, context) => verifyNativeTest(log, context, 'offline');
export function verifyNativeCoursework(log, context, kind) {
  if (!['courseworkCancel', 'courseworkTitle', 'courseworkClear', 'courseworkCreate'].includes(kind))
    throw new Error('Unsupported private native coursework test.');
  return verifyNativeTest(log, context, kind);
}

export function assertStorageAcceptanceProof(value, commit, context) {
  if (!/^[0-9a-f]{40}$/i.test(commit ?? '') || !value || value.commit !== commit || value.api !== apiUrl
    || value.result !== 'passed' || value.cleanup !== 'passed' || Object.hasOwn(value, 'failedStage') || Object.hasOwn(value, 'failureDiagnostics')
    || !Array.isArray(value.checks) || value.checks.length !== requiredChecks.length
    || !value.checks.every((check, index) => check === requiredChecks[index])
    || value.dayReview?.cancel !== 'unchanged' || value.dayReview?.save !== 'tomorrow with deadline retained'
    || value.dayReview?.taskCount !== 2 || value.dayReview?.studySeconds !== 1500 || value.dayReview?.studyBlocks !== 1
    || value.signedOut?.serverRevocation !== 'observed' || value.signedOut?.ownedCacheRows !== 0
    || value.signedOut?.appTermination !== 'after revocation and cache proof'
    || value.coursework?.noOp !== 'disabled' || value.coursework?.cancel !== 'unchanged'
    || value.coursework?.titleSave !== 'exact instant preserved' || value.coursework?.deadlineClear !== 'explicit null'
    || value.coursework?.creation !== 'date-only quiz' || value.coursework?.itemCount !== 2)
    throw new Error('Incomplete iOS storage acceptance proof for this source commit.');
  for (const [native, stages] of [[value.nativeLogin, loginStages], [value.nativeOfflineRecovery, offlineStages],
    ...['Cancel', 'Title', 'Clear', 'Create'].map(name => [value.coursework[`native${name}`], nativeCases[`coursework${name}`].stages])]) {
    if (native?.commit !== commit || native.result !== 'passed'
      || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(native.udid ?? '')
      || !/^[1-9][0-9]*$/.test(native.runId ?? '') || !/^[1-9][0-9]*$/.test(native.attempt ?? '')
      || ['udid', 'runId', 'attempt'].some(field => native[field] !== value.nativeLogin[field])
      || context && ['udid', 'runId', 'attempt'].some(field => native[field] !== context[field])
      || JSON.stringify(native.checks) !== JSON.stringify(stages))
      throw new Error('Incomplete iOS storage acceptance private native proof.');
  }
}

/** Real API reads prove native modal edits changed only the requested fields. */
export function assertCourseworkEdited(values, beforeValue, outcome, title) {
  const before = academicItemSchema.parse(beforeValue);
  assert.equal(before.source, manualAcademicSource); assert.equal(before.due?.kind, 'instant');
  assert.equal(values.length, 1);
  const actual = academicItemSchema.parse(values[0]);
  if (outcome === 'cancelled') assert.deepEqual(actual, before);
  else {
    assert.ok(['title', 'cleared'].includes(outcome));
    const changes = outcome === 'title' ? { title: createManualAcademicItemSchema.shape.title.parse(title) } : { due: null };
    if (outcome === 'title') assert.notEqual(changes.title, before.title);
    assert.deepEqual(actual, { ...before, ...changes, updatedAt: actual.updatedAt });
    assert.notEqual(actual.updatedAt, before.updatedAt);
  }
  return actual;
}

export function assertCourseworkCreated(values, beforeValue, title, date) {
  const before = academicItemSchema.parse(beforeValue);
  assert.equal(before.source, manualAcademicSource);
  const expected = createManualAcademicItemSchema.parse({ title, kind: 'quiz', courseId: null, due: { kind: 'date', date } });
  assert.equal(values.length, 2);
  const items = values.map(value => academicItemSchema.parse(value));
  assert.equal(new Set(items.map(item => item.id)).size, 2);
  assert.deepEqual(items.find(item => item.id === before.id), before);
  const created = items.find(item => item.id !== before.id);
  assert.deepEqual({ title: created.title, kind: created.kind, courseId: created.courseId, due: created.due }, expected);
  assert.equal(created.source, manualAcademicSource); assert.equal(created.submissionState, 'unsubmitted');
  assert.equal(created.mainGoalDate, null);
  return created;
}

/** Only stop the child created by this harness. Signal exits are terminal too. */
export async function stopOwnedApiProcess(child, { termMs = 10_000, killMs = 5_000 } = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (![termMs, killMs].every(value => Number.isSafeInteger(value) && value > 0 && value <= 60_000))
    throw new Error('Invalid API shutdown bounds.');
  await new Promise((resolve, reject) => {
    let termTimer, killTimer, settled = false;
    const clear = () => { clearTimeout(termTimer); clearTimeout(killTimer); child.removeListener('exit', done); child.removeListener('error', failed); };
    const done = () => { settled = true; clear(); resolve(); };
    const failed = () => { settled = true; clear(); reject(new Error('Owned loopback API did not stop.')); };
    child.once('exit', done); child.once('error', failed);
    try {
      child.kill('SIGTERM');
      if (!settled) termTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); if (!settled) killTimer = setTimeout(failed, killMs); }
        catch { failed(); }
      }, termMs);
    } catch { failed(); }
  });
}
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

/** Both original capture and explicit review editing must survive unchanged rules. */
export function assertDayReviewTasks(values, capturedValue, reviewValue, date, outcome) {
  dateSchema.parse(date);
  const captured = personalTaskSchema.parse(capturedValue), review = personalTaskSchema.parse(reviewValue);
  assert.notEqual(captured.id, review.id);
  assert.equal(values.length, 2);
  const tasks = values.map(value => personalTaskSchema.parse(value));
  assert.deepEqual(tasks.map(task => task.id).sort(), [captured.id, review.id].sort());
  assert.deepEqual(tasks.find(task => task.id === captured.id), captured);
  assert.deepEqual(review.due, { kind: 'date', date });
  assert.deepEqual(review.scheduled, { kind: 'date', date });
  assert.equal(review.recurrence, null); assert.equal(review.completedAt, null);
  const saved = tasks.find(task => task.id === review.id);
  if (outcome === 'cancelled') assert.deepEqual(saved, review);
  else {
    assert.equal(outcome, 'saved');
    assert.deepEqual(saved, { ...review, scheduled: { kind: 'date', date: addCalendarDays(date, 1) }, updatedAt: saved.updatedAt });
    assert.notEqual(saved.updatedAt, review.updatedAt);
  }
  return saved;
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
    'stopAppCommand', 'applyConfigurationCommand', 'defineVariablesCommand', 'takeScreenshotCommand', 'pressKeyCommand']);
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
    settingsTab: 'Settings, tab, 5 of 5', settings: 'Settings', signOut: 'Sign out', unavailable: 'This page isn’t available.',
    dayReview: 'Leave the day a little lighter.', existingEditor: 'Edit task',
    emailInput: 'auth-email', passwordInput: 'auth-password', signIn: 'Sign in', invalidCredentials: 'Invalid email or password',
    networkFailure: 'Network request failed', showPassword: 'Show password', hidePassword: 'Hide password' };
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

/** Structural diagnostics contain counts only, never UI attributes or text. */
export function privateHierarchyShape(hierarchy) {
  let objects = 0, strings = 0, visited = 0, depthLimited = false, truncated = false;
  const seen = new WeakSet();
  function visit(value, depth) {
    if (depth > 40) { depthLimited = true; return; }
    if (visited++ >= 4000) { truncated = true; return; }
    if (typeof value === 'string') { strings++; return; }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value); objects++;
    for (const child of Object.values(value)) {
      if (visited >= 4000) { truncated = true; break; }
      visit(child, depth + 1);
    }
  }
  visit(hierarchy, 0);
  return { objects, strings, depthLimited, truncated };
}

/** Only aggregate counts from this disposable account may enter failed proof. */
export function privateFailureCounts(value) {
  const count = input => Number.isSafeInteger(input) && input >= 0 ? input : null;
  return { activeSessions: count(value?.activeSessions), ownedTasks: count(value?.ownedTasks) };
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
  const email = `ios-${randomUUID()}@example.test`, title = `iOS study ${randomUUID().slice(0, 8)}`,
    reviewTitle = `iOS review ${randomUUID().slice(0, 8)}`;
  const academicTitle = `Native coursework ${randomUUID().slice(0, 8)}`,
    editedAcademicTitle = `Native revised ${randomUUID().slice(0, 8)}`,
    createdAcademicTitle = `Native added ${randomUUID().slice(0, 8)}`,
    academicDate = addCalendarDays(new Date().toISOString().slice(0, 10), 45);
  for (const value of [dbPassword, password, email, title, reviewTitle, academicTitle, editedAcademicTitle, createdAcademicTitle]) console.log(`::add-mask::${value}`);
  writeFileSync(path.join(runDir, 'pg-password'), dbPassword, { mode: 0o600 });
  const env = { ...process.env, DATABASE_URL: `postgresql://campusflow_ios:${dbPassword}@127.0.0.1:55439/campusflow_ios_test`,
    PGPASSWORD: dbPassword, NODE_ENV: 'development', PORT: '3000', HOST: '127.0.0.1', REGISTRATION_MODE: 'preview',
    CANVAS_MODE: 'disabled', RECOVERY_DELIVERY: 'disabled' };
  // No real accounts, SMTP, external Canvas, global PostgreSQL service or Metro.
  let apiProcess, dbStarted = false, prisma, registeredUserId, failure, stage = 'database setup';
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
      const failed = name.startsWith('private-') ? undefined
        : publicFlowFailure(readFileSync(path.join(runDir, `${name}.log`), 'utf8'),
          [email, password, dbPassword, title, reviewTitle, academicTitle, editedAcademicTitle, createdAcademicTitle]);
      if (failed) console.error(failed);
      reject(new Error(`Acceptance command failed: ${name}. Private diagnostics stay on the runner.`));
    });
  });
  const stopApi = () => stopOwnedApiProcess(apiProcess);
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
      await command(cli, ['--device', config.udid, 'test', '-e', `IOS_QA_EMAIL=${email}`, '-e', `IOS_QA_TASK=${title}`,
        '-e', `IOS_QA_REVIEW_TASK=${reviewTitle}`,
        '--debug-output', path.join(runDir, name), '--test-output-dir', path.join(runDir, name), `.maestro/${name}.yaml`], name);
    } catch (error) {
      try {
        // Default hierarchy reinstalls XCTest and can change the foreground UI.
        await command(cli, ['--device', config.udid, 'hierarchy', '--no-reinstall-driver'], 'private-hierarchy');
        const raw = readFileSync(path.join(runDir, 'private-hierarchy.log'), 'utf8');
        const hierarchy = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        writeFileSync(path.join(root, `artifacts/ios/evidence/${name}-view.json`), `${JSON.stringify({ ...privateViewSummary(hierarchy), structure: privateHierarchyShape(hierarchy) }, null, 2)}\n`);
      } catch { /* No raw hierarchy fallback. Failure stage/timeline remain available. */ }
      throw error;
    }
  };
  const check = name => { proof.checks.push(name); console.log(`iOS storage acceptance passed: ${name}.`); };
  const nativeTest = async (kind, context) => {
    const { method } = nativeCase(kind), name = `private-${kind}`;
    console.log(`iOS storage native stage: ${kind}.`);
    try {
      await command('xcodebuild', ['test', '-project', path.join(runDir, 'PrivateLogin.xcodeproj'), '-scheme', 'PrivateLoginTests',
        `-only-testing:PrivateLoginTests/NativePrivateLoginTests/${method}`,
        '-configuration', 'Release', '-sdk', 'iphonesimulator', '-destination', `platform=iOS Simulator,id=${config.udid}`,
        '-parallel-testing-enabled', 'NO', '-derivedDataPath', path.join(runDir, 'login-derived'),
        '-resultBundlePath', path.join(runDir, `${kind}.xcresult`),
        'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'DEVELOPMENT_TEAM='], name);
      return verifyNativeTest(readFileSync(path.join(runDir, `${name}.log`), 'utf8'), context, kind);
    } catch (error) {
      let diagnostics = privateLoginDiagnostics(undefined, kind);
      try { diagnostics = privateLoginDiagnostics(readFileSync(path.join(runDir, `${name}.log`), 'utf8'), kind); } catch { /* No raw fallback. */ }
      writeFileSync(path.join(root, `artifacts/ios/evidence/${name}-stages.json`), JSON.stringify({ ...context, ...diagnostics }));
      throw error;
    }
  };
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
    registeredUserId = session.user.id;
    // Registration token stays in memory; the UI logs in normally and gets its own token.
    console.log(`::add-mask::${session.accessToken}`);
    stage = 'coursework fixture creation';
    const academicResponse = await fetch(`${apiUrl}/academic-items`, { method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(createManualAcademicItemSchema.parse({ title: academicTitle, kind: 'discussion', courseId: null,
        due: { kind: 'instant', at: `${academicDate}T12:34:56.789Z` } })), signal: AbortSignal.timeout(5000) });
    assert.equal(academicResponse.status, 201);
    const academicItem = academicItemSchema.parse(await academicResponse.json());
    const readAcademic = async () => {
      const response = await fetch(`${apiUrl}/academic-items`, { headers: { Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200); return response.json();
    };
    assertCourseworkEdited(await readAcademic(), academicItem, 'cancelled');
    stage = 'ordinary native XCTest login';
    const loginContext = { commit: proof.commit, udid: config.udid, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT };
    writeFileSync(path.join(runDir, 'login-context.json'), JSON.stringify({ ...loginContext, email, password, task: title,
      academicTitle, editedAcademicTitle, createdAcademicTitle, academicDate }), { mode: 0o600 });
    await command('ruby', ['scripts/ios-private-login.rb', runDir], 'private-login-project');
    proof.nativeLogin = await nativeTest('login', loginContext);
    assert.equal(await prisma.session.count({ where: { userId: session.user.id, revokedAt: null } }), 2);
    stage = 'native task capture';
    // XCTest used ordinary UI sign-in; Maestro must still capture a real owned task.
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

    // A second owned disposable task preserves every original capture/cache gate.
    // Its deadline stays today, so scheduling it tomorrow must not move that deadline.
    stage = 'day-review fixture creation';
    const reviewDate = new Date().toISOString().slice(0, 10);
    const reviewResponse = await fetch(`${apiUrl}/tasks`, { method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(createPersonalTaskSchema.parse({ title: reviewTitle, category: 'university', priority: 'medium',
        due: { kind: 'date', date: reviewDate }, scheduled: { kind: 'date', date: reviewDate }, estimatedMinutes: 25 })),
      signal: AbortSignal.timeout(5000) });
    assert.equal(reviewResponse.status, 201);
    const reviewTask = personalTaskSchema.parse(await reviewResponse.json());
    const endedAt = new Date().toISOString();
    const focusResponse = await fetch(`${apiUrl}/focus-sessions`, { method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(saveFocusSessionSchema.parse({ requestKey: `ios-review-${randomUUID()}`, taskId: reviewTask.id,
        title: reviewTitle, startedAt: new Date(Date.parse(endedAt) - 1500_000).toISOString(), endedAt,
        plannedMinutes: 25, focusedSeconds: 1500, outcome: 'completed' })), signal: AbortSignal.timeout(5000) });
    assert.equal(focusResponse.status, 201);
    const focus = focusSessionSchema.parse(await focusResponse.json());
    assert.equal(focus.taskId, reviewTask.id); assert.equal(focus.focusedSeconds, 1500);
    assert.equal(await prisma.focusSession.count({ where: { userId: session.user.id, id: focus.id, taskId: reviewTask.id } }), 1);
    const readTasks = async () => {
      const response = await fetch(`${apiUrl}/tasks`, { headers: { Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200); return response.json();
    };
    stage = 'native day-review cancellation'; await flow('ios-session-day-review-cancel');
    assertDayReviewTasks(await readTasks(), task, reviewTask, reviewDate, 'cancelled');
    stage = 'native day-review tomorrow save'; await flow('ios-session-day-review-save');
    assertDayReviewTasks(await readTasks(), task, reviewTask, reviewDate, 'saved');
    assert.equal(await prisma.personalTask.count({ where: { userId: session.user.id } }), 2);
    proof.dayReview = { cancel: 'unchanged', save: 'tomorrow with deadline retained', taskCount: 2, studySeconds: 1500, studyBlocks: 1 };

    // Native UI must perform every operation; ordinary API reads independently
    // verify each result. No API mutation substitutes for a failed UI action.
    stage = 'native coursework no-op and cancellation';
    const nativeCancel = await nativeTest('courseworkCancel', loginContext);
    assertCourseworkEdited(await readAcademic(), academicItem, 'cancelled');
    stage = 'native coursework title save';
    const nativeTitle = await nativeTest('courseworkTitle', loginContext);
    const revisedAcademic = assertCourseworkEdited(await readAcademic(), academicItem, 'title', editedAcademicTitle);
    stage = 'native coursework deadline clearing';
    const nativeClear = await nativeTest('courseworkClear', loginContext);
    const clearedAcademic = assertCourseworkEdited(await readAcademic(), revisedAcademic, 'cleared');
    stage = 'native coursework creation';
    const nativeCreate = await nativeTest('courseworkCreate', loginContext);
    assertCourseworkCreated(await readAcademic(), clearedAcademic, createdAcademicTitle, academicDate);
    proof.coursework = { noOp: 'disabled', cancel: 'unchanged', titleSave: 'exact instant preserved',
      deadlineClear: 'explicit null', creation: 'date-only quiz', itemCount: 2,
      nativeCancel, nativeTitle, nativeClear, nativeCreate };

    stage = 'offline cold restoration'; await stopApi(); await unusedPort(3000);
    await flow('ios-session-offline');
    stage = 'offline authenticated native recovery'; await unusedPort(3000);
    proof.nativeOfflineRecovery = await nativeTest('offline', loginContext);
    await unusedPort(3000);
    check('cold session and owned SQLite task restoration with no API listener');
    stage = 'native sign-out cleanup'; await startApi(); await flow('ios-session-cleanup');
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await prisma.session.count({ where: { userId: session.user.id, revokedAt: null } }) === 1) break;
      await delay(250);
    }
    assert.equal(await prisma.session.count({ where: { userId: session.user.id, revokedAt: null } }), 1);
    assert.equal(await prisma.personalTask.count({ where: { userId: session.user.id, id: task.id } }), 1);
    assert.equal(await prisma.personalTask.count({ where: { userId: session.user.id, id: reviewTask.id } }), 1);
    assert.equal(cachedCount(), 0);
    // Local logout deliberately returns without awaiting its bounded network
    // request. Terminating at the Auth screen could cancel that request before
    // the online-revocation assertion observes it. Preserve every assertion and
    // stop only after both server and owned-cache cleanup have been proved.
    await command('xcrun', ['simctl', 'terminate', config.udid, 'com.campusflow.mobile'], 'stop-after-logout-proof');
    proof.signedOut = { serverRevocation: 'observed', ownedCacheRows: 0, appTermination: 'after revocation and cache proof' };
    check('native sign-out revocation, zero owned SQLite rows, and retained server task');
    stage = 'offline cold signed-out state'; await stopApi(); await unusedPort(3000);
    await flow('ios-session-signed-out');
    check('cold signed-out state without API revocation fallback');
    proof.result = 'passed';
  } catch {
    proof.result = 'failed'; proof.failedStage = stage;
    if (prisma && registeredUserId) {
      try {
        proof.failureDiagnostics = privateFailureCounts({
          activeSessions: await prisma.session.count({ where: { userId: registeredUserId, revokedAt: null } }),
          ownedTasks: await prisma.personalTask.count({ where: { userId: registeredUserId } }),
        });
      } catch { proof.failureDiagnostics = privateFailureCounts(undefined); }
    }
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
  assertStorageAcceptanceProof(proof, process.env.CAMPUSFLOW_BUILD_SHA ?? process.env.GITHUB_SHA,
    { udid: config.udid, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify-proof') {
    try {
      const proof = JSON.parse(readFileSync(path.join(root, 'artifacts/ios/evidence/storage.json'), 'utf8'));
      assertStorageAcceptanceProof(proof, process.env.CAMPUSFLOW_BUILD_SHA ?? process.env.GITHUB_SHA,
        { udid: process.env.IOS_SIMULATOR_UDID, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT });
      console.log('Complete source-matched native storage and process-cleanup proof verified.');
    } catch { console.error('Complete source-matched iOS storage proof is missing or invalid.'); process.exitCode = 1; }
  } else if (process.argv[2]) { console.error('Unsupported storage acceptance argument.'); process.exitCode = 1; }
  else run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
