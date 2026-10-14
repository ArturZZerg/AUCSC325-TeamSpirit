import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const markers = ['INITIAL_PID', 'FIRST_WARM_HELP', 'SINGLE_BACK', 'IN_APP_HELP', 'LEGACY_HELP_SEARCH', 'ACCOUNT_AND_CONTINUATION', 'COLD_HELP'];

/** A green build or zero discovered tests cannot substitute for native execution. */
export function verifyPublicAcceptance(log, commit, udid, runId, attempt) {
  assert.match(commit ?? '', /^[0-9a-f]{40}$/i);
  assert.match(udid ?? '', /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  assert.match(runId ?? '', /^[1-9][0-9]*$/); assert.match(attempt ?? '', /^[1-9][0-9]*$/);
  assert.ok(typeof log === 'string' && log.length > 0 && log.length < 16_777_216, 'Bounded native execution log required.');
  const contexts = [...log.matchAll(/^CAMPUSFLOW_PUBLIC_CONTEXT=(.*)$/gm)];
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0][1], [commit, udid, runId, attempt].join('|'), 'Native test must execute this compiled source/device/run context.');
  let previous = contexts[0].index;
  const pids = markers.map(marker => {
    const matches = [...log.matchAll(new RegExp(`^CAMPUSFLOW_PUBLIC_${marker}=(\\d+)$`, 'gm'))];
    assert.equal(matches.length, 1, `Required native stage: ${marker}.`);
    assert.ok(matches[0].index > previous, 'Native stages must complete in order.');
    previous = matches[0].index;
    const pid = Number(matches[0][1]);
    assert.ok(Number.isSafeInteger(pid) && pid > 0, 'Actual positive native PID required.');
    return pid;
  });
  assert.ok(pids.slice(0, -1).every(pid => pid === pids[0]), 'All warm actions must retain the initial process.');
  assert.notEqual(pids.at(-1), pids[0], 'Cold Help must use a new process after termination.');
  const complete = [...log.matchAll(/^CAMPUSFLOW_PUBLIC_ACCEPTANCE_COMPLETE$/gm)];
  assert.equal(complete.length, 1); assert.ok(complete[0].index > previous);
  assert.match(log, /Test Case '-\[PublicAcceptanceTests\.NativePublicAcceptanceTests testPublicLinksAndNavigation\]' passed \(/);
  assert.match(log, /Executed 1 test, with 0 failures \(0 unexpected\)/);
  assert.match(log, /\*\* TEST SUCCEEDED \*\*/);
  assert.doesNotMatch(log, /Test Case .* failed \(|\*\* TEST FAILED \*\*/);
  return { commit, udid, runId, attempt, result: 'passed', warmPid: pids[0], coldPid: pids.at(-1),
    checks: ['first warm Help before in-app navigation', 'single Back and in-app Help',
      'legacy Help, search, answer and clear', 'protected Account and ignored continuation', 'cold Help after termination'] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.platform, 'darwin');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_OS, 'macOS');
  const [log, commit, udid, output] = process.argv.slice(2);
  const proof = verifyPublicAcceptance(readFileSync(log, 'utf8'), commit, udid, process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT);
  writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`);
  console.log('Full public native acceptance and process transitions verified.');
}
