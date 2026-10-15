import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openSync, closeSync, readSync, statSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { stopOwnedApiProcess } from './ios-storage-acceptance.mjs';
import { verifyPublicAcceptance } from './ios-public-acceptance.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const positive = value => Number.isSafeInteger(value) && value > 0;
const boundedContext = value => value && ['commit', 'udid', 'runId', 'attempt'].every(key => typeof value[key] === 'string')
  && /^[a-f0-9]{40}$/i.test(value.commit ?? '')
  && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value.udid ?? '')
  && /^[1-9][0-9]*$/.test(value.runId ?? '') && /^[1-9][0-9]*$/.test(value.attempt ?? '');

export function publicLaunchContext(env, platform, boot) {
  const context = { commit: env.CAMPUSFLOW_BUILD_SHA, udid: env.IOS_SIMULATOR_UDID,
    runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT };
  if (platform !== 'darwin' || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_OS !== 'macOS' || !boundedContext(context)
    || boot?.udid !== context.udid || boot.name !== 'CampusFlowIosQa' || boot.ready !== true || boot.state !== 'Booted')
    throw new Error('Launch diagnostics require this disposable macOS job and its explicit booted QA simulator.');
  return context;
}

/** The marker precedes the original cold URL; it never launches or retries it. */
export function coldLaunchRequest(log, context) {
  if (!boundedContext(context) || typeof log !== 'string' || Buffer.byteLength(log) > 65_536)
    throw new Error('Invalid bounded public launch context.');
  const markers = [...log.matchAll(/^CAMPUSFLOW_PUBLIC_COLD_RECOVERY_BEGIN=(.*)$/gm)];
  if (!markers.length) return undefined;
  const expected = [context.commit, context.udid, context.runId, context.attempt].join('|');
  const pieces = markers[0][1].split('|'), pid = Number(pieces.pop());
  if (markers.length !== 1 || pieces.join('|') !== expected || !positive(pid))
    throw new Error('Public cold launch marker does not match this job.');
  return { priorPid: pid };
}

/** launchctl is queried only inside the explicit simulator; see selectedHostPid for the scoped fallback. */
export function selectedAppPid(output, priorPid) {
  if (typeof output !== 'string' || output.length > 1_048_576 || !positive(priorPid))
    throw new Error('Invalid simulator job inventory.');
  const rows = output.split('\n').filter(line => /\sUIKitApplication:com\.campusflow\.mobile\[/.test(line));
  const pids = rows.map(line => {
    const match = line.match(/^\s*(\d+|-)\s+-?\d+\s+UIKitApplication:com\.campusflow\.mobile(?:\[[A-Za-z0-9-]+\])+\s*$/);
    if (!match) throw new Error('Invalid CampusFlow simulator job.');
    return match[1] === '-' ? undefined : Number(match[1]);
  }).filter(pid => pid !== undefined);
  if (pids.length > 1 || pids.some(pid => !positive(pid))) throw new Error('Ambiguous CampusFlow simulator process.');
  return pids[0] !== priorPid ? pids[0] : undefined;
}

/** Host fallback: simulator apps are host processes, so only this device's exact installed executable matches. */
export function selectedHostPid(output, executable, priorPid) {
  if (typeof output !== 'string' || output.length > 4_194_304 || !positive(priorPid)
    || typeof executable !== 'string' || !executable.endsWith('/CampusFlow.app/CampusFlow') || !executable.includes('/CoreSimulator/Devices/'))
    throw new Error('Invalid host process inventory.');
  const pids = output.split('\n').map(line => line.match(/^\s*(\d+)\s+(.*)$/)).filter(Boolean)
    .filter(([, , command]) => command === executable || command.startsWith(`${executable} `)).map(([, pid]) => Number(pid));
  if (pids.length > 2 || pids.some(pid => !positive(pid))) throw new Error('Ambiguous CampusFlow host process.');
  const fresh = pids.filter(pid => pid !== priorPid);
  if (fresh.length > 1) throw new Error('Ambiguous CampusFlow host process.');
  return fresh[0];
}

/** A five-second sample of a React Native app can exceed a few megabytes. */
export const sampleReportLimit = 16_777_216;
// macOS may report a firmlinked path (/private/...) for the same installed file.
const samePath = (left, right) => left.replace(/^\/private(?=\/)/, '') === right.replace(/^\/private(?=\/)/, '');
export function assertPublicLaunchSample(value, context, report, executable) {
  const graph = typeof report === 'string' ? report.split('Call graph:')[1]?.split('Binary Images:')[0] ?? '' : '';
  const lines = typeof report === 'string' ? report.split(/\r?\n/) : [];
  const checks = [
    ['context', boundedContext(context) && !!value && ['commit', 'udid', 'runId', 'attempt'].every(key => value[key] === context[key])],
    ['capture', value?.result === 'captured' && value.cleanup === 'passed' && value.sampleExitCode === 0 && !Object.hasOwn(value, 'failureStage')],
    ['process ids', positive(value?.pid) && positive(value?.priorPid) && value.pid !== value.priorPid],
    ['sampling settings', value?.sampleSeconds === 5 && value?.sampleIntervalMs === 10],
    ['report size', typeof report === 'string' && report.length > 0 && Buffer.byteLength(report) <= sampleReportLimit],
    ['executable', typeof executable === 'string' && executable.endsWith('/CampusFlow.app/CampusFlow') && executable.includes(`/CoreSimulator/Devices/${context?.udid}/`)],
    ['process line', lines.some(line => line.match(/^Process:\s+CampusFlow \[(\d+)\]/)?.[1] === String(value?.pid))],
    ['path line', typeof executable === 'string' && lines.some(line => /^Path:\s+/.test(line) && samePath(line.replace(/^Path:\s+/, '').trim(), executable))],
    ['call graph', /^\s*[+!|: ]*[1-9]\d*\s+[A-Za-z_]/m.test(graph)],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) throw new Error(`Complete job-owned public launch sample required (${failed.join(', ')}).`);
}

function tail(file) {
  let descriptor;
  try {
    const size = statSync(file).size, buffer = Buffer.alloc(Math.min(size, 65_536));
    descriptor = openSync(file, 'r');
    const count = readSync(descriptor, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
    return buffer.subarray(0, count).toString('utf8');
  } catch { return ''; }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
const exited = (child, onError) => new Promise(resolve => {
  child.once('error', error => { onError?.(error); resolve(-1); }); child.once('close', code => resolve(code ?? -1));
});

async function run() {
  const evidence = path.join(root, 'artifacts/ios/evidence');
  const context = publicLaunchContext(process.env, process.platform,
    JSON.parse(readFileSync(path.join(evidence, 'boot.json'), 'utf8')));
  const tool = args => execute('xcrun', args, { timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1_048_576 });
  const inventory = JSON.parse((await tool(['simctl', 'list', 'devices', '--json'])).stdout);
  const selected = Object.values(inventory.devices).flat().find(device => device.udid === context.udid);
  assert.equal(selected?.name, 'CampusFlowIosQa'); assert.equal(selected.state, 'Booted');
  const container = (await tool(['simctl', 'get_app_container', context.udid, 'com.campusflow.mobile', 'app'])).stdout.trim();
  const executable = path.join(container, 'CampusFlow');
  assert.ok(executable.endsWith('/CampusFlow.app/CampusFlow') && executable.includes(`/CoreSimulator/Devices/${context.udid}/`));
  const directory = path.join(root, '.local', `ios-public-startup-${context.udid}`);
  mkdirSync(directory, { mode: 0o700 });
  const logPath = path.join(evidence, 'public-native.log'), rawSample = path.join(directory, 'sample.txt');
  const proof = { ...context, result: 'not-observed', sampleSeconds: 5, sampleIntervalMs: 10 };
  let publicProcess, sampleProcess, sampleTask, interruptionCleanup, stopped = false, interrupted = false, sampleCleanupFailed = false;
  let observerStage = 'waiting for cold marker';
  const stop = () => {
    interrupted = true; stopped = true;
    interruptionCleanup ??= stopOwnedApiProcess(publicProcess, { termMs: 1000, killMs: 1000 });
    // Attach rejection handling immediately; final cleanup still audits it.
    void interruptionCleanup.catch(() => {});
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const sample = async pid => {
    proof.pid = pid;
    const descriptor = openSync(path.join(directory, 'sampler.log'), 'w', 0o600);
    try { sampleProcess = spawn('/usr/bin/sample', [String(pid), '5', '10', '-mayDie', '-file', rawSample], { stdio: ['ignore', descriptor, descriptor] }); }
    finally { closeSync(descriptor); }
    let timer, sampleStage = 'sampler execution';
    const sampleStarted = Date.now();
    try {
      // Recording takes five seconds; first-use symbolication of a simulator app on a fresh runner can take minutes.
      const code = await Promise.race([exited(sampleProcess, error => { proof.sampleSpawnError = String(error?.code ?? error).slice(0, 200); }),
        new Promise(resolve => { timer = setTimeout(() => { proof.sampleTimedOut = true; resolve(-1); }, 240_000); })]);
      proof.sampleExitCode = code;
      if (code !== 0) throw new Error('Public sample did not complete.');
      sampleStage = 'sample report validation';
      proof.reportBytes = statSync(rawSample).size;
      assert.ok(proof.reportBytes <= sampleReportLimit, 'report size');
      const report = readFileSync(rawSample, 'utf8');
      assertPublicLaunchSample({ ...proof, result: 'captured', cleanup: 'passed' }, context, report, executable);
      copyFileSync(rawSample, path.join(evidence, 'public-cold-start.sample.txt'));
      proof.result = 'captured';
    } catch (error) {
      proof.result = 'sample-failed'; proof.failureStage = sampleStage;
      if (sampleStage === 'sample report validation') proof.validationError = String(error?.message ?? error).slice(0, 300);
    }
    finally {
      proof.sampleElapsedMs = Date.now() - sampleStarted;
      clearTimeout(timer); await stopOwnedApiProcess(sampleProcess, { termMs: 1000, killMs: 1000 });
    }
  };
  const monitor = async () => {
    const deadline = Date.now() + 900_000;
    // Keep the marker once seen: later test output pushes it out of the bounded log tail.
    let request;
    while (!stopped && Date.now() < deadline) {
      observerStage = 'cold marker validation';
      request ??= coldLaunchRequest(tail(logPath), context);
      if (request) {
        proof.priorPid = request.priorPid;
        observerStage = 'simulator process inventory';
        proof.inventoryAttempts = (proof.inventoryAttempts ?? 0) + 1;
        let pid;
        try {
          // A loaded runner can make the in-simulator launchctl query slow or fail; retry instead of ending the sample.
          const output = (await execute('xcrun', ['simctl', 'spawn', context.udid, 'launchctl', 'list'], { timeout: 15_000, killSignal: 'SIGKILL', maxBuffer: 4_194_304 })).stdout;
          proof.matchingAppJobs = output.split('\n').filter(line => /\sUIKitApplication:com\.campusflow\.mobile\[/.test(line)).length;
          observerStage = 'simulator process selection';
          pid = selectedAppPid(output, request.priorPid);
        } catch (error) {
          if (observerStage === 'simulator process selection') throw error;
          proof.inventoryFailures = (proof.inventoryFailures ?? 0) + 1;
          proof.inventoryError ??= String(error?.code ?? error?.message ?? error).slice(0, 200);
          observerStage = 'host process inventory';
          const hosts = (await execute('ps', ['-ax', '-o', 'pid=,command='], { timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 4_194_304 })).stdout;
          observerStage = 'host process selection';
          pid = selectedHostPid(hosts, executable, request.priorPid);
          if (pid) proof.inventorySource = 'host';
        }
        if (pid && !stopped) {
          sampleTask = sample(pid).catch(() => { proof.result = 'sample-cleanup-failed'; sampleCleanupFailed = true; });
          return;
        }
      }
      await delay(250);
    }
  };
  let monitorTask, publicCode = -1, failure;
  try {
    if (interrupted) throw new Error('Public native execution was interrupted.');
    const descriptor = openSync(logPath, 'w', 0o600);
    try {
      publicProcess = spawn('xcodebuild', ['test', '-project', '.local/ios-public-project/PublicAcceptance.xcodeproj', '-scheme', 'PublicAcceptanceTests',
        '-configuration', 'Release', '-sdk', 'iphonesimulator', '-destination', `platform=iOS Simulator,id=${context.udid}`,
        '-parallel-testing-enabled', 'NO', '-derivedDataPath', path.join(root, '.local/ios-public-derived'),
        '-resultBundlePath', path.join(evidence, 'public.xcresult'), 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'DEVELOPMENT_TEAM='],
      { cwd: root, env: process.env, stdio: ['ignore', descriptor, descriptor] });
    } finally { closeSync(descriptor); }
    monitorTask = monitor().catch(() => { proof.result = 'monitor-failed'; proof.failureStage = observerStage; });
    publicCode = await exited(publicProcess);
  } catch { failure = new Error('Public native execution could not complete.'); }
  finally {
    stopped = true;
    await monitorTask;
    // A normal fast UI run may finish during the five-second sample. Finish
    // that bounded owned child before the following private-account phase.
    await sampleTask;
    const cleanup = await Promise.allSettled([interruptionCleanup,
      stopOwnedApiProcess(publicProcess, { termMs: 1000, killMs: 1000 }), stopOwnedApiProcess(sampleProcess, { termMs: 1000, killMs: 1000 })]);
    proof.cleanup = sampleCleanupFailed || cleanup.some(item => item.status === 'rejected') ? 'failed' : 'passed';
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    writeFileSync(path.join(evidence, 'public-launch-sample.json'), JSON.stringify(proof, null, 2) + '\n');
    if (statSync(logPath).size <= 16_777_216) process.stdout.write(readFileSync(logPath));
  }
  if (failure) throw failure;
  if (interrupted || publicCode !== 0 || proof.cleanup !== 'passed') throw new Error('Public native execution or owned-process cleanup failed.');
  const accepted = verifyPublicAcceptance(readFileSync(logPath, 'utf8'), context.commit, context.udid, context.runId, context.attempt);
  assert.equal(proof.pid, accepted.recoveryColdPid); assert.equal(proof.priorPid, accepted.coldPid);
  assertPublicLaunchSample(proof, context, readFileSync(path.join(evidence, 'public-cold-start.sample.txt'), 'utf8'), executable);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(() => { console.error('Public native gate or scoped startup sample failed; original acceptance remains unproved.'); process.exitCode = 1; });
}
