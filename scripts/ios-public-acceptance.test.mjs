import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPublicAcceptance } from './ios-public-acceptance.mjs';
import { publicLaunchContext, coldLaunchRequest, selectedAppPid, selectedHostPid, assertPublicLaunchSample } from './ios-public-launch-diagnostics.mjs';

const sha = 'a'.repeat(40), udid = '00000000-0000-4000-8000-000000000001';
const runId = '123456', attempt = '1';
const verify = (log, source = sha, device = udid, run = runId, count = attempt) => verifyPublicAcceptance(log, source, device, run, count);
const lines = ['INITIAL_PID', 'FIRST_WARM_HELP', 'SINGLE_BACK', 'IN_APP_HELP', 'LEGACY_HELP_SEARCH', 'ACCOUNT_AND_CONTINUATION', 'COLD_HELP', 'UNAVAILABLE_WARM', 'UNAVAILABLE_COLD']
  .map((name, index) => `CAMPUSFLOW_PUBLIC_${name}=${index === 8 ? 43 : index >= 6 ? 42 : 41}`);
const context = `CAMPUSFLOW_PUBLIC_CONTEXT=${sha}|${udid}|${runId}|${attempt}`;
const passed = [context, ...lines, 'CAMPUSFLOW_PUBLIC_ACCEPTANCE_COMPLETE',
  "Test Case '-[PublicAcceptanceTests.NativePublicAcceptanceTests testPublicLinksAndNavigation]' passed (40.0 seconds).",
  'Executed 1 test, with 0 failures (0 unexpected) in 40.0 seconds', '** TEST SUCCEEDED **'].join('\n');

test('accepts actual ordered public execution with retained warm and distinct cold processes', () => {
  assert.deepEqual(verify(passed), { commit: sha, udid, runId, attempt, result: 'passed', warmPid: 41, coldPid: 42, recoveryColdPid: 43,
    checks: ['first warm Help before in-app navigation', 'single Back and in-app Help', 'legacy Help, search, answer and clear',
      'protected Account and ignored continuation', 'cold Help after termination',
      'warm unavailable recovery and ignored parameters', 'cold unavailable recovery to Help'] });
});
test('rejects a successful build with no test execution or incomplete public behavior', () => {
  for (const fragment of [context, ...lines, 'CAMPUSFLOW_PUBLIC_ACCEPTANCE_COMPLETE', "Test Case '-[PublicAcceptanceTests.NativePublicAcceptanceTests testPublicLinksAndNavigation]' passed (40.0 seconds).",
    'Executed 1 test, with 0 failures (0 unexpected) in 40.0 seconds', '** TEST SUCCEEDED **'])
    assert.throws(() => verify(passed.replace(fragment, '')));
});
test('rejects a cold substitution during warm input and a nonterminated cold case', () => {
  assert.throws(() => verify(passed.replace('FIRST_WARM_HELP=41', 'FIRST_WARM_HELP=42')));
  assert.throws(() => verify(passed.replace('COLD_HELP=42', 'COLD_HELP=41')));
});
test('rejects duplicate, reordered or nonpositive process stages', () => {
  const reordered = passed.replace(lines.slice(0, 2).join('\n'), [lines[1], lines[0]].join('\n'));
  for (const value of [passed + '\n' + lines[0], reordered,
    passed.replace('INITIAL_PID=41', 'INITIAL_PID=0')]) assert.throws(() => verify(value));
});
test('rejects wrong test identity, native failure, skipped discovery and invalid source/device identities', () => {
  for (const value of [passed.replace('testPublicLinksAndNavigation', 'testOther'),
    passed + "\nTest Case 'other' failed (1 second).", passed.replace('Executed 1 test', 'Executed 0 tests')])
    assert.throws(() => verify(value));
  assert.throws(() => verify(passed, 'main'));
  assert.throws(() => verify(passed, sha, 'booted'));
});
test('rejects replay of valid evidence from a different source, device, run or attempt', () => {
  assert.throws(() => verify(passed, 'b'.repeat(40)));
  assert.throws(() => verify(passed, sha, udid.replace(/1$/, '2')));
  assert.throws(() => verify(passed, sha, udid, '123457'));
  assert.throws(() => verify(passed, sha, udid, runId, '2'));
});
test('requires same-process warm unavailable recovery and a distinct terminated-process recovery', () => {
  assert.throws(() => verify(passed.replace('UNAVAILABLE_WARM=42', 'UNAVAILABLE_WARM=43')));
  assert.throws(() => verify(passed.replace('UNAVAILABLE_COLD=43', 'UNAVAILABLE_COLD=42')));
});

const launchContext = { commit: sha, udid, runId, attempt };
const launchEnv = { GITHUB_ACTIONS: 'true', RUNNER_OS: 'macOS', CAMPUSFLOW_BUILD_SHA: sha,
  IOS_SIMULATOR_UDID: udid, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: attempt };
const boot = { udid, name: 'CampusFlowIosQa', state: 'Booted', ready: true };
const begin = `CAMPUSFLOW_PUBLIC_COLD_RECOVERY_BEGIN=${sha}|${udid}|${runId}|${attempt}|42`;
const executable = `/Users/runner/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Bundle/Application/fixture/CampusFlow.app/CampusFlow`;
const launchSample = () => ({ ...launchContext, priorPid: 42, pid: 43, result: 'captured', cleanup: 'passed', sampleSeconds: 5, sampleIntervalMs: 10, sampleExitCode: 0 });
const report = `Process:         CampusFlow [43]\nPath: ${executable}\nCall graph:\n    1 dyld_start\n`;

test('startup sampling requires the exact disposable macOS job and booted simulator', () => {
  assert.deepEqual(publicLaunchContext(launchEnv, 'darwin', boot), launchContext);
  for (const [env, platform, device] of [[launchEnv, 'win32', boot], [{ ...launchEnv, GITHUB_ACTIONS: 'false' }, 'darwin', boot],
    [{ ...launchEnv, IOS_SIMULATOR_UDID: 'booted' }, 'darwin', boot], [{ ...launchEnv, GITHUB_RUN_ID: 'invalid' }, 'darwin', boot],
    [launchEnv, 'darwin', { ...boot, name: 'Personal iPhone' }], [launchEnv, 'darwin', { ...boot, state: 'Shutdown' }],
    [launchEnv, 'darwin', { ...boot, ready: false }], [launchEnv, 'darwin', { ...boot, udid: udid.replace(/1$/, '2') }]])
    assert.throws(() => publicLaunchContext(env, platform, device));
});
test('only a source/device/run-matched cold marker arms sampling of the new process', () => {
  assert.equal(coldLaunchRequest('ordinary public output', launchContext), undefined);
  assert.deepEqual(coldLaunchRequest(`${begin}\n`, launchContext), { priorPid: 42 });
  for (const log of [`${begin}\n${begin}\n`, begin.replace(sha, 'b'.repeat(40)), begin.replace('|42', '|0'),
    begin.replace('|42', '|1.5'), begin.replace('|42', '|9007199254740992'), begin.replace('|123456|', '|123457|'),
    begin.replace('|1|42', '|2|42'), begin.replace(udid, udid.replace(/1$/, '2')), 'x'.repeat(65_537)])
    assert.throws(() => coldLaunchRequest(log, launchContext));
  assert.throws(() => coldLaunchRequest(begin, { ...launchContext, runId: Number(runId) }));
});
test('simulator process selection ignores unrelated jobs, stopped jobs and the previous process', () => {
  const other = '9 0 UIKitApplication:com.other.app[1234][rb-legacy]\n';
  assert.equal(selectedAppPid(`${other}- 0 UIKitApplication:com.campusflow.mobile[431f][rb-legacy]\n`, 42), undefined);
  assert.equal(selectedAppPid('42 0 UIKitApplication:com.campusflow.mobile[431f][rb-legacy]\n', 42), undefined);
  assert.equal(selectedAppPid(`${other}43 0 UIKitApplication:com.campusflow.mobile[431f][rb-legacy]\n`, 42), 43);
});
test('process selection rejects ambiguous, malformed and nonpositive matching jobs', () => {
  for (const output of ['43 0 UIKitApplication:com.campusflow.mobile[a]\n44 0 UIKitApplication:com.campusflow.mobile[b]\n',
    'not-a-pid 0 UIKitApplication:com.campusflow.mobile[a]\n', '0 0 UIKitApplication:com.campusflow.mobile[a]\n', 'x'.repeat(1_048_577)])
    assert.throws(() => selectedAppPid(output, 42));
  assert.throws(() => selectedAppPid('', 0));
});
test('host fallback selects only the new process of this simulator’s exact executable', () => {
  const app = `/Users/runner/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Bundle/Application/X/CampusFlow.app/CampusFlow`;
  const other = `/Users/runner/Library/Developer/CoreSimulator/Devices/00000000-0000-4000-8000-000000000009/data/Containers/Bundle/Application/Y/CampusFlow.app/CampusFlow`;
  assert.equal(selectedHostPid(`  42 ${app}\n  77 ${other}\n`, app, 42), undefined);
  assert.equal(selectedHostPid(`  42 ${app}\n  43 ${app} -arg\n 77 ${other}\n 90 /bin/zsh ${app}\n`, app, 42), 43);
  assert.throws(() => selectedHostPid(`43 ${app}\n44 ${app}\n`, app, 42));
  assert.throws(() => selectedHostPid('', '/tmp/CampusFlow', 42));
  assert.throws(() => selectedHostPid('', app, 0));
});
test('a captured report must identify this new process and its exact installed executable', () => {
  assert.doesNotThrow(() => assertPublicLaunchSample(launchSample(), launchContext, report, executable));
  assert.doesNotThrow(() => assertPublicLaunchSample(launchSample(), launchContext, report.replace('Process:         ', 'Process: '), executable));
  // Large real reports, CRLF line endings and the firmlinked spelling of the same file are accepted.
  assert.doesNotThrow(() => assertPublicLaunchSample(launchSample(), launchContext, report + ' '.repeat(3_000_000), executable));
  assert.doesNotThrow(() => assertPublicLaunchSample(launchSample(), launchContext, report.replaceAll('\n', '\r\n'), executable));
  assert.doesNotThrow(() => assertPublicLaunchSample(launchSample(), launchContext, report.replace(`Path: ${executable}`, `Path: /private${executable}`), executable));
  assert.throws(() => assertPublicLaunchSample(launchSample(), launchContext, report.replace('Call graph:', ''), executable), /call graph/);
});
test('partial, replayed, foreign-process and oversized samples cannot satisfy the diagnostic gate', () => {
  for (const value of [{ ...launchSample(), result: 'sample-failed' }, { ...launchSample(), cleanup: 'failed' },
    { ...launchSample(), pid: 42 }, { ...launchSample(), pid: 0 }, { ...launchSample(), priorPid: undefined },
    { ...launchSample(), sampleSeconds: 30 }, { ...launchSample(), sampleIntervalMs: 1 },
    { ...launchSample(), sampleExitCode: 1 }, { ...launchSample(), failureStage: 'sampler execution' },
    ...['commit', 'udid', 'runId', 'attempt'].map(key => ({ ...launchSample(), [key]: 'different' }))])
    assert.throws(() => assertPublicLaunchSample(value, launchContext, report, executable));
  for (const text of ['', report.replace('[43]', '[44]'), report.replace('CampusFlow [43]', 'OtherApp [43]'),
    report.replace(executable, '/private/other-app'), report.replace('Call graph:', ''),
    report.replace('    1 dyld_start', 'No samples recorded'), 'x'.repeat(2_097_153), report + 'x'.repeat(16_777_217)])
    assert.throws(() => assertPublicLaunchSample(launchSample(), launchContext, text, executable));
  assert.throws(() => assertPublicLaunchSample(launchSample(), launchContext, report, '/private/Other.app/Other'));
});
