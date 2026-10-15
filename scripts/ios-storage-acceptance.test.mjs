import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { storageAcceptanceConfig, assertOwnedTask, publicFlowFailure, privateFlowTimeline, privateViewSummary, saveFlowTimeline,
  stopOwnedApiProcess, assertStorageAcceptanceProof, assertDayReviewTasks, privateHierarchyShape, privateFailureCounts,
  verifyNativeLogin, privateLoginStages, privateLoginDiagnostics } from './ios-storage-acceptance.mjs';
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
const loginContext = { commit, udid: env.IOS_SIMULATOR_UDID, runId: '123', attempt: '1' };
const loginMarkers = ['EMAIL_AND_NEXT', 'PASSWORD_AND_HIDE', 'TODAY', 'COMPLETE'];
const loginLog = () => `Private activities stay here: private@example.test secret-password\nCAMPUSFLOW_LOGIN_CONTEXT=${Object.values(loginContext).join('|')}\n`
  + loginMarkers.map(marker => `CAMPUSFLOW_LOGIN_${marker}\n`).join('')
  + "Test Case '-[PrivateLoginTests.NativePrivateLoginTests testOrdinaryNativeLogin]' passed (1.0 seconds).\n"
  + 'Executed 1 test, with 0 failures (0 unexpected)\n** TEST SUCCEEDED **\n';
const complete = () => ({ commit, api: 'http://127.0.0.1:3000', result: 'passed', cleanup: 'passed',
  nativeLogin: verifyNativeLogin(loginLog(), loginContext),
  dayReview: { cancel: 'unchanged', save: 'tomorrow with deadline retained', taskCount: 2, studySeconds: 1500, studyBlocks: 1 }, checks: [
  'ordinary native sign-in, Secure Store write, and API-confirmed task capture',
  'cold session and owned SQLite task restoration with no API listener',
  'native sign-out revocation, zero owned SQLite rows, and retained server task',
  'cold signed-out state without API revocation fallback'] });
test('accepts only completed native and process-cleanup evidence for the exact source', () => {
  assert.doesNotThrow(() => assertStorageAcceptanceProof(complete(), commit));
  assert.doesNotThrow(() => assertStorageAcceptanceProof(complete(), commit, loginContext));
  for (const change of [{ udid: '22222222-2222-3333-4444-555555555555' }, { runId: '124' }, { attempt: '2' }])
    assert.throws(() => assertStorageAcceptanceProof(complete(), commit, { ...loginContext, ...change }));
});
test('rejects missing, partial, replayed and failed proof without echoing private values', () => {
  const privateValue = 'private-token-must-not-appear';
  for (const value of [undefined, {}, { ...complete(), result: 'failed' }, { ...complete(), cleanup: undefined },
    { ...complete(), commit: 'b'.repeat(40) }, { ...complete(), api: privateValue }, { ...complete(), failedStage: privateValue },
    { ...complete(), failureDiagnostics: { activeSessions: 1, ownedTasks: 0 } },
    { ...complete(), nativeLogin: undefined }, { ...complete(), nativeLogin: { ...complete().nativeLogin, commit: 'b'.repeat(40) } },
    { ...complete(), nativeLogin: { ...complete().nativeLogin, result: 'failed' } },
    { ...complete(), nativeLogin: { ...complete().nativeLogin, checks: loginMarkers.slice(0, 3) } },
    { ...complete(), checks: complete().checks.slice(0, 3) }, { ...complete(), checks: complete().checks.toReversed() },
    { ...complete(), dayReview: undefined }, { ...complete(), dayReview: { ...complete().dayReview, cancel: 'changed' } },
    { ...complete(), dayReview: { ...complete().dayReview, save: undefined } },
    { ...complete(), dayReview: { ...complete().dayReview, taskCount: 3 } },
    { ...complete(), dayReview: { ...complete().dayReview, studySeconds: 0 } },
    { ...complete(), dayReview: { ...complete().dayReview, studyBlocks: undefined } }]) {
    assert.throws(() => assertStorageAcceptanceProof(value, commit), error => !error.message.includes(privateValue) && /Incomplete iOS storage/.test(error.message));
  }
});

test('native login requires every ordinary input and screen stage and the named successful XCTest', () => {
  assert.deepEqual(verifyNativeLogin(loginLog(), loginContext), { ...loginContext, result: 'passed', checks: loginMarkers });
  assert.ok(!/private@example|secret-password/.test(JSON.stringify(verifyNativeLogin(loginLog(), loginContext))));
  assert.deepEqual(privateLoginStages(loginLog()), loginMarkers);
});

test('native login rejects missing, duplicate, reordered, failed, zero-test and replayed execution', () => {
  const log = loginLog();
  const invalid = [undefined, '', 'x'.repeat(16_777_217),
    ...loginMarkers.map(marker => log.replace(`CAMPUSFLOW_LOGIN_${marker}\n`, '')),
    log + 'CAMPUSFLOW_LOGIN_TODAY\n',
    log.replace('CAMPUSFLOW_LOGIN_EMAIL_AND_NEXT', 'CAMPUSFLOW_LOGIN_TEMP')
      .replace('CAMPUSFLOW_LOGIN_PASSWORD_AND_HIDE', 'CAMPUSFLOW_LOGIN_EMAIL_AND_NEXT')
      .replace('CAMPUSFLOW_LOGIN_TEMP', 'CAMPUSFLOW_LOGIN_PASSWORD_AND_HIDE'),
    log.replace("testOrdinaryNativeLogin]' passed", "testOther]' passed"),
    log.replace('Executed 1 test', 'Executed 0 tests'), log.replace('0 failures', '1 failure'),
    log.replace('** TEST SUCCEEDED **', '** TEST FAILED **'),
    log + "Test Case '-[PrivateLoginTests.NativePrivateLoginTests testOrdinaryNativeLogin]' failed (1.0 seconds).\n"];
  for (const value of invalid) assert.throws(() => verifyNativeLogin(value, loginContext), error =>
    !/secret-password|private@example/.test(error.message) && /native login proof required/.test(error.message));
  for (const changed of [{ commit: 'b'.repeat(40) }, { udid: '22222222-2222-3333-4444-555555555555' },
    { runId: '124' }, { attempt: '2' }, { attempt: 'private-token' }])
    assert.throws(() => verifyNativeLogin(log, { ...loginContext, ...changed }));
});

test('failed native login diagnostics publish fixed completed stage names only', () => {
  assert.deepEqual(privateLoginStages('private@example.test\nCAMPUSFLOW_LOGIN_EMAIL_AND_NEXT\nInput secret-password\nCAMPUSFLOW_LOGIN_private-token\n'), ['EMAIL_AND_NEXT']);
  assert.deepEqual(privateLoginStages(undefined), []);
  assert.deepEqual(privateLoginStages('x'.repeat(16_777_217)), []);
});

test('private XCTest failure diagnostics omit activities and errors, retaining bounded static-source line numbers only', () => {
  const privateLog = "Test Case '-[PrivateLoginTests.NativePrivateLoginTests testOrdinaryNativeLogin]' started.\n"
    + 'CAMPUSFLOW_LOGIN_EMAIL_AND_NEXT\nInput secret-password\n'
    + '/private/ios-private-login.swift:53: error: secret-password private@example.test\n'
    + '/private/ios-private-login.swift:53:8: error: private-token\n'
    + '/private/PrivateLoginContext.swift:2: error: private-token\n'
    + "Test Case '-[PrivateLoginTests.NativePrivateLoginTests testOrdinaryNativeLogin]' failed (1.0 seconds).\n";
  assert.deepEqual(privateLoginDiagnostics(privateLog), { completed: ['EMAIL_AND_NEXT'], started: true, failed: true, sourceLines: [53] });
  assert.ok(!/private@example|secret-password|private-token/.test(JSON.stringify(privateLoginDiagnostics(privateLog))));
  assert.deepEqual(privateLoginDiagnostics(undefined), { completed: [], started: false, failed: false, sourceLines: [] });
  assert.deepEqual(privateLoginDiagnostics('x'.repeat(16_777_217)), privateLoginDiagnostics(undefined));
  assert.equal(privateLoginDiagnostics(Array.from({ length: 30 }, (_, i) => `ios-private-login.swift:${i + 1}: error: private`).join('\n')).sourceLines.length, 20);
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
  assert.deepEqual(privateFlowTimeline([{ command: { pressKeyCommand: { privateText } }, metadata: { status: 'COMPLETED' } }]),
    [{ sequence: 0, action: 'pressKeyCommand', status: 'COMPLETED', durationMs: null }]);
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
    savePassword: false, notNow: false, passwords: false, settingsTab: false, settings: false, signOut: false, unavailable: false,
    dayReview: false, existingEditor: false, emailInput: false, passwordInput: false, signIn: false, invalidCredentials: false,
    networkFailure: false, showPassword: false, hidePassword: false });
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
  assert.equal(privateViewSummary({ attributes: { text: 'This page isn’t available.' } }).unavailable, true);
  const review = privateViewSummary({ children: [{ attributes: { text: 'Leave the day a little lighter.' } }, { attributes: { text: 'Edit task' } }] });
  assert.equal(review.dayReview, true); assert.equal(review.existingEditor, true);
});

test('failure screen diagnostics recognize auth controls and fixed errors without exposing inputs', () => {
  const privateValue = 'private@example.test secret-password private-token';
  const summary = privateViewSummary({ children: [{ attributes: { id: 'auth-email', value: privateValue } },
    { attributes: { id: 'auth-password', value: privateValue } }, { attributes: { text: 'Invalid email or password' } }] });
  assert.equal(summary.emailInput, true); assert.equal(summary.passwordInput, true); assert.equal(summary.invalidCredentials, true);
  assert.ok(Object.values(summary).every(value => typeof value === 'boolean'));
  assert.ok(!JSON.stringify(summary).includes(privateValue));
});

test('hierarchy diagnostics distinguish empty and populated trees using bounded counts only', () => {
  assert.deepEqual(privateHierarchyShape({}), { objects: 1, strings: 0, depthLimited: false, truncated: false });
  const value = { children: [{ attributes: { text: 'private@example.test', token: 'private-token', password: 'secret-password' } }] };
  const summary = privateHierarchyShape(value);
  assert.deepEqual(summary, { objects: 4, strings: 3, depthLimited: false, truncated: false });
  assert.ok(!/private|secret/.test(JSON.stringify(summary)));
  value.children.push(value);
  assert.equal(privateHierarchyShape(value).truncated, false);
  assert.equal(privateHierarchyShape(Array(5000).fill('private-token')).truncated, true);
  let deep = {}; for (let i = 0; i < 50; i++) deep = { children: deep };
  assert.equal(privateHierarchyShape(deep).depthLimited, true);
});

test('database failure diagnostics allow nonnegative aggregate counts and omit all record fields', () => {
  assert.deepEqual(privateFailureCounts({ activeSessions: 2, ownedTasks: 1, userId: 'private-id', accessToken: 'private-token' }), { activeSessions: 2, ownedTasks: 1 });
  for (const invalid of [undefined, -1, NaN, Infinity, 'private-token', { secret: 'private-password' }]) {
    assert.deepEqual(privateFailureCounts({ activeSessions: invalid, ownedTasks: invalid }), { activeSessions: null, ownedTasks: null });
  }
  assert.deepEqual(privateFailureCounts(undefined), { activeSessions: null, ownedTasks: null });
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

const reviewTask = { ...task, id: '22222222-3333-4444-8555-666666666666', title: 'Synthetic review', due: task.scheduled, estimatedMinutes: 25 };
const savedReview = () => ({ ...reviewTask, scheduled: { kind: 'date', date: '2026-10-14' }, updatedAt: '2026-10-13T13:00:00Z' });
test('native review cancellation preserves both the original captured task and the complete review task', () => {
  assert.deepEqual(assertDayReviewTasks([reviewTask, task], task, reviewTask, '2026-10-13', 'cancelled'), reviewTask);
});
test('native review save changes only the schedule/version and preserves the due date and original task', () => {
  assert.deepEqual(assertDayReviewTasks([task, savedReview()], task, reviewTask, '2026-10-13', 'saved'), savedReview());
});
test('native review cancellation rejects a covert change, duplicate, missing or additional task', () => {
  for (const rows of [[task, { ...reviewTask, updatedAt: '2026-10-13T13:00:00Z' }], [task, savedReview()],
    [task, task], [reviewTask], [task, reviewTask, savedReview()], [{ ...task, title: 'Changed original' }, reviewTask]])
    assert.throws(() => assertDayReviewTasks(rows, task, reviewTask, '2026-10-13', 'cancelled'));
});
test('native review save rejects deadline movement, no scheduling, completion and unrelated edits', () => {
  for (const changed of [{ ...savedReview(), due: savedReview().scheduled }, reviewTask, { ...savedReview(), completedAt: '2026-10-13T13:00:00Z' },
    { ...savedReview(), estimatedMinutes: 50 }, { ...savedReview(), title: 'Changed title' }, { ...savedReview(), updatedAt: reviewTask.updatedAt }])
    assert.throws(() => assertDayReviewTasks([task, changed], task, reviewTask, '2026-10-13', 'saved'));
});
test('native review assertions reject an unusable date, shared task identity or unsupported outcome', () => {
  for (const date of ['invalid', '2026-02-30', '2026-10-14'])
    assert.throws(() => assertDayReviewTasks([task, reviewTask], task, reviewTask, date, 'cancelled'));
  assert.throws(() => assertDayReviewTasks([task, task], task, { ...reviewTask, id: task.id }, '2026-10-13', 'cancelled'));
  assert.throws(() => assertDayReviewTasks([task, reviewTask], task, reviewTask, '2026-10-13', 'unknown'));
});
