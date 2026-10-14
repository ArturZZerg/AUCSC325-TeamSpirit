import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { storageAcceptanceConfig, assertOwnedTask, publicFlowFailure, privateFlowTimeline, privateViewSummary, saveFlowTimeline,
  stopOwnedApiProcess, assertStorageAcceptanceProof } from './ios-storage-acceptance.mjs';
const env = { GITHUB_ACTIONS: 'true', RUNNER_OS: 'macOS', IOS_SIMULATOR_UDID: '11111111-2222-3333-4444-555555555555', IOS_PG_BIN: '/opt/postgres/bin' };

test('stops an owned real child and makes repeated cleanup after a signal exit idempotent', { timeout: 5000 }, async t => {
  const child = spawn(process.execPath, ['-e', "setInterval(() => {}, 1000); process.send('ready');"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); } });
  await once(child, 'message');
  await stopOwnedApiProcess(child, { termMs: 500, killMs: 500 });
  assert.equal(child.exitCode, null); assert.ok(child.signalCode);
  await stopOwnedApiProcess(child, { termMs: 500, killMs: 500 });
  assert.equal(child.listenerCount('exit'), 0);
});
test('cleanup also returns for a child that already exited normally', { timeout: 5000 }, async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  await once(child, 'exit'); await stopOwnedApiProcess(child);
  assert.equal(child.exitCode, 0); assert.equal(child.listenerCount('exit'), 0);
});
test('an owned process that never confirms termination fails within both shutdown bounds', { timeout: 1000 }, async () => {
  const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null, kill: () => false });
  await assert.rejects(stopOwnedApiProcess(child, { termMs: 10, killMs: 10 }), /Owned loopback API did not stop/);
  assert.equal(child.listenerCount('exit'), 0); assert.equal(child.listenerCount('error'), 0);
});
test('a synchronous termination does not retain escalation timers or listeners', async () => {
  const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null });
  let signals = 0;
  child.kill = () => { signals++; child.emit('exit', 0); return true; };
  await stopOwnedApiProcess(child, { termMs: 10, killMs: 10 });
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(signals, 1);
  assert.equal(child.listenerCount('exit'), 0);
});
const commit = 'a'.repeat(40);
const complete = () => ({ commit, api: 'http://127.0.0.1:3000', result: 'passed', cleanup: 'passed', checks: [
  'ordinary native sign-in, Secure Store write, and API-confirmed task capture',
  'cold session and owned SQLite task restoration with no API listener',
  'native sign-out revocation, zero owned SQLite rows, and retained server task',
  'cold signed-out state without API revocation fallback'] });
test('accepts only completed native and process-cleanup evidence for the exact source', () => {
  assert.doesNotThrow(() => assertStorageAcceptanceProof(complete(), commit));
});
test('rejects missing, partial, replayed and failed proof without echoing private values', () => {
  const privateValue = 'private-token-must-not-appear';
  for (const value of [undefined, {}, { ...complete(), result: 'failed' }, { ...complete(), cleanup: undefined },
    { ...complete(), commit: 'b'.repeat(40) }, { ...complete(), api: privateValue }, { ...complete(), failedStage: privateValue },
    { ...complete(), checks: complete().checks.slice(0, 3) }, { ...complete(), checks: complete().checks.toReversed() }]) {
    assert.throws(() => assertStorageAcceptanceProof(value, commit), error => !error.message.includes(privateValue) && /Incomplete iOS storage/.test(error.message));
  }
});

test('requires an explicit disposable macOS runner and UUID, without an external API', () => {
  assert.equal(storageAcceptanceConfig(env, 'darwin').apiUrl, 'http://127.0.0.1:3000');
  for (const changed of [{ GITHUB_ACTIONS: 'false' }, { RUNNER_OS: 'Windows' }, { IOS_SIMULATOR_UDID: undefined },
    { IOS_SIMULATOR_UDID: 'booted' }, { IOS_PG_BIN: 'relative/bin' }, { EXPO_PUBLIC_API_URL: 'https://production.example.test' }])
    assert.throws(() => storageAcceptanceConfig({ ...env, ...changed }, 'darwin'));
  assert.throws(() => storageAcceptanceConfig(env, 'win32'));
});

test('publishes only a bounded redacted assertion, excluding raw private commands', () => {
  const log = 'Input text: private-password\n[Failed] flow (Assertion is false: "private@example.test" is visible)\nUI dump with private-password';
  assert.equal(publicFlowFailure(log, ['private@example.test', 'private-password']), 'Assertion is false: "[private]" is visible)');
  assert.equal(publicFlowFailure('Input text: private-password', ['private-password']), undefined);
  assert.equal(publicFlowFailure(`\x1b[31mElement not found: ${'x'.repeat(500)}\x1b[0m`, []).length, 250);
});

test('private flow timeline publishes only known actions, states and numeric timing', () => {
  const privateText = 'private@example.test secret-password';
  const result = privateFlowTimeline([{ command: { inputTextCommand: { text: privateText } },
    metadata: { status: 'COMPLETED', duration: 500, sequenceNumber: 2, hierarchy: privateText } },
  { command: { defineVariablesCommand: { env: { PASSWORD: privateText } } }, metadata: { status: privateText, sequenceNumber: 1 } }]);
  assert.deepEqual(result, [{ sequence: 1, action: 'defineVariablesCommand', status: 'UNKNOWN', durationMs: null },
    { sequence: 2, action: 'inputTextCommand', status: 'COMPLETED', durationMs: 500 }]);
  assert.ok(!JSON.stringify(result).includes(privateText));
  assert.deepEqual(privateFlowTimeline(undefined), []);
});

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local/ios-timeline-tests');
function withTimelineFixture(run) {
  mkdirSync(fixtureRoot, { recursive: true });
  const directory = mkdtempSync(path.join(fixtureRoot, 'run-'));
  try { run(directory); }
  finally {
    const resolved = realpathSync(directory), parent = realpathSync(fixtureRoot);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('run-'));
    rmSync(resolved, { recursive: true });
  }
}
test('publishes sanitized timelines from both legacy and flat driver bundles', () => {
  for (const filename of ['commands-(login).json', 'commands.json']) withTimelineFixture(directory => {
    const flow = path.join(directory, 'flow'); mkdirSync(flow);
    const privateText = 'student@example.test secret-password';
    writeFileSync(path.join(flow, filename), JSON.stringify([{ command: { scrollUntilVisible: { selector: privateText } },
      metadata: { status: 'FAILED', sequenceNumber: 3, duration: 42, error: privateText, artifacts: [{ path: privateText }] } }]));
    const output = path.join(directory, 'sanitized.json');
    assert.equal(saveFlowTimeline(flow, output), true);
    const text = readFileSync(output, 'utf8');
    assert.deepEqual(JSON.parse(text), [{ sequence: 3, action: 'scrollUntilVisible', status: 'FAILED', durationMs: 42 }]);
    assert.ok(!text.includes(privateText));
  });
});
test('malformed command bundles do not publish raw diagnostics or use manifest fallback', () => withTimelineFixture(directory => {
  writeFileSync(path.join(directory, 'commands.json'), '{"private":"secret-password",');
  writeFileSync(path.join(directory, 'manifest.json'), '{"private":"student@example.test"}');
  const output = path.join(directory, 'sanitized.json');
  assert.equal(saveFlowTimeline(directory, output), false);
  assert.equal(existsSync(output), false);
}));

test('private screen diagnostics output fixed label-presence booleans only', () => {
  const result = privateViewSummary({ children: [{ attributes: { text: 'Your daily flow', id: 'today-add-task' } },
    { attributes: { text: 'private@example.test', input: 'secret-password', token: 'private-token' } }] });
  assert.deepEqual(result, { auth: false, today: true, editor: false, capture: true, titleInput: false, save: false, cleanupRetry: false,
    savePassword: false, notNow: false, passwords: false, settingsTab: false, settings: false, signOut: false });
  assert.ok(Object.values(result).every(value => typeof value === 'boolean'));
  assert.ok(!JSON.stringify(result).includes('private'));
  const overlay = privateViewSummary({ children: [{ attributes: { text: 'Save Password' } },
    { attributes: { text: 'Not Now', value: 'secret-password' } }] });
  assert.equal(overlay.savePassword, true);
  assert.equal(overlay.notNow, true);
  assert.equal(overlay.passwords, false);
  assert.ok(!JSON.stringify(overlay).includes('secret-password'));
  const settings = privateViewSummary({ children: [{ attributes: { accessibilityText: 'Settings, tab, 5 of 5' } },
    { attributes: { text: 'Settings' } }, { attributes: { text: 'Sign out', email: 'private@example.test' } }] });
  assert.equal(settings.settingsTab, true);
  assert.equal(settings.settings, true);
  assert.equal(settings.signOut, true);
  assert.ok(!JSON.stringify(settings).includes('private@example.test'));
});

const task = { id: '11111111-2222-4333-8444-555555555555', title: 'Synthetic study', description: null,
  priority: 'medium', category: 'personal', due: null, scheduled: { kind: 'date', date: '2026-10-13' },
  recurrence: null, reminder: null, estimatedMinutes: null, completedAt: null, snoozedUntil: null, mainGoalDate: null,
  createdAt: '2026-10-13T12:00:00Z', updatedAt: '2026-10-13T12:00:00Z' };
test('accepts the one API-confirmed task captured through Today', () => {
  assert.equal(assertOwnedTask([task], task.title, '2026-10-13').id, task.id);
});
test('rejects duplicates, missing tasks, different titles and deadline/schedule substitution', () => {
  for (const values of [[], [task, task], [{ ...task, title: 'Other' }], [{ ...task, scheduled: null }],
    [{ ...task, due: task.scheduled }], [{ ...task, reminder: { kind: 'instant', at: '2026-10-13T13:00:00Z' } }]])
    assert.throws(() => assertOwnedTask(values, task.title, '2026-10-13'));
  assert.throws(() => assertOwnedTask([task], task.title, '2026-10-14'));
});
