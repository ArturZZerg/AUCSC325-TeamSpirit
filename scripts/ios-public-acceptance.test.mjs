import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPublicAcceptance } from './ios-public-acceptance.mjs';

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
