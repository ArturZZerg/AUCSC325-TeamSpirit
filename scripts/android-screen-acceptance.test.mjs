import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stripVTControlCharacters } from 'node:util';

const available = !spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { windowsHide: true }).error;
const options = { skip: available ? false : 'PowerShell required for native acceptance script tests' };
const fake = String.raw`
$global:LASTEXITCODE=0
[IO.File]::AppendAllText($env:FAKE_ADB_LOG, (ConvertTo-Json -InputObject @($args) -Compress)+[Environment]::NewLine)
if ($env:FAKE_ADB_FAILURE -and $args -contains $env:FAKE_ADB_FAILURE) { exit 13 }
if ($args -contains 'devices') { Write-Output 'List of devices attached'; $env:FAKE_ADB_DEVICES -split "\n" | Write-Output; exit }
if ($args -contains 'pm') { Write-Output 'package:/data/app/com.campusflow.mobile/base.apk'; exit }
if ($args -contains 'size') { Write-Output 'Physical size: 1080x2400'; exit }
if ($args -contains 'dumpsys') { Write-Output 'mType=statusBars mInsetsHint=Insets{left=0, top=63}'; Write-Output 'mType=navigationBars mInsetsHint=Insets{left=0, top=0, right=0, bottom=63}'; exit }
if ($args -contains 'pull') { $index=[Array]::IndexOf($args,'pull'); [IO.File]::WriteAllText($args[$index+2], $env:FAKE_ADB_XML); exit }
`;

function run(t, { devices = 'PixelQA device', serial, route = 'help', viewport = '[0,63][1080,2337]', heading = 'HELP &amp; DATA', surface = 'com.campusflow.mobile', failure = '', wrapper = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'campusflow-screen-target-'));
  t.after(() => {
    assert.equal(path.dirname(directory), tmpdir()); assert.ok(path.basename(directory).startsWith('campusflow-screen-target-'));
    rmSync(directory, { recursive: true, force: true });
  });
  mkdirSync(path.join(directory, 'scripts'));
  const script = path.join(directory, 'scripts/android-screen-acceptance.ps1'), adb = path.join(directory, 'adb.ps1'), log = path.join(directory, 'commands.jsonl');
  copyFileSync(new URL('./android-screen-acceptance.ps1', import.meta.url), script); writeFileSync(adb, fake);
  const workspace = `<node package="${surface}" class="android.widget.ScrollView" bounds="${viewport}" text="" clickable="false"><node package="${surface}" class="android.widget.TextView" text="${heading}" bounds="[20,80][500,140]"/><node package="${surface}" class="android.widget.Button" text="Back" bounds="[20,150][500,270]" clickable="true"/></node>`;
  const xml = `<hierarchy>${wrapper ? `<node package="${surface}" class="android.widget.ScrollView" bounds="[0,0][1080,2400]">${workspace}</node>` : workspace}</hierarchy>`;
  const args = ['-NoProfile', '-File', script, '-AdbPath', adb, '-AdbServerPort', '5039', '-Routes', route, ...(serial === undefined ? [] : ['-Serial', serial])];
  const result = spawnSync('pwsh', args, { encoding: 'utf8', timeout: 15_000, windowsHide: true, env: { ...process.env, FAKE_ADB_LOG: log, FAKE_ADB_DEVICES: devices, FAKE_ADB_XML: xml, FAKE_ADB_FAILURE: failure } });
  // PowerShell decorates/wraps error continuations differently on Linux/Windows.
  const stderr = stripVTControlCharacters(result.stderr ?? '').replace(/\r?\n\s*\|\s*/g, ' ');
  const commands = existsSync(log) ? readFileSync(log, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line).map(String)) : [];
  return { ...result, stderr, commands, report: path.join(directory, '.local/native-screen-acceptance/result.json') };
}

function selected(commands, serial) {
  assert.deepEqual(commands[0], ['-P', '5039', 'devices']);
  for (const command of commands.slice(1)) assert.deepEqual(command.slice(0, 4), ['-P', '5039', '-s', serial]);
}

test('single ready device is selected explicitly for every geometry command', options, t => {
  const result = run(t); assert.equal(result.status, 0, result.stderr); selected(result.commands, 'PixelQA');
  const report = JSON.parse(readFileSync(result.report, 'utf8')); assert.equal(report.serial, 'PixelQA'); assert.equal(report.screens.length, 1);
});
test('reminder workspace requires its own heading and reports the selected route', options, t => {
  const result = run(t, { route: 'reminders', heading: 'YOUR REMINDERS' }); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(result.report, 'utf8')).screens[0].route, 'reminders');
  const wrong = run(t, { route: 'reminders' }); assert.notEqual(wrong.status, 0); assert.equal(existsSync(wrong.report), false);
});
test('an explicit emulator is selected with another ready phone present', options, t => {
  const result = run(t, { devices: 'PixelQA device\nemulator-5558 device', serial: 'emulator-5558' });
  assert.equal(result.status, 0, result.stderr); selected(result.commands, 'emulator-5558');
});
test('ambiguous default target stops before app, route or file operations', options, t => {
  const result = run(t, { devices: 'PixelQA device\nemulator-5558 device' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /select its serial explicitly/); assert.equal(result.commands.length, 1);
});
test('missing and offline explicit targets never fall back to a ready phone', options, t => {
  for (const devices of ['PixelQA device', 'PixelQA device\nemulator-5558 offline', 'PixelQA device\nemulator-5558 unauthorized']) {
    const result = run(t, { devices, serial: 'emulator-5558' }); assert.notEqual(result.status, 0); assert.match(result.stderr, /missing, offline or unauthorized/); assert.equal(result.commands.length, 1);
  }
});
test('invalid device serial is rejected before device access', options, t => {
  for (const serial of ['emulator-5558;echo', '../PixelQA', 'x'.repeat(129)]) {
    const result = run(t, { serial }); assert.notEqual(result.status, 0); assert.match(result.stderr, /Invalid Android device serial/); assert.equal(result.commands.length, 0);
  }
});
test('bar overlap, auth substitution and another surface cannot pass acceptance', options, t => {
  for (const input of [{ viewport: '[0,0][1080,2400]' }, { heading: 'Welcome back' }, { surface: 'another.app' }]) {
    const result = run(t, input); assert.notEqual(result.status, 0); assert.equal(existsSync(result.report), false); selected(result.commands, 'PixelQA');
  }
});
test('a failed selected-device command stops instead of accepting old snapshots', options, t => {
  for (const failure of ['pm', 'am', 'pull', 'rm']) {
    const result = run(t, { failure }); assert.notEqual(result.status, 0); assert.match(result.stderr, /device command failed/); assert.equal(existsSync(result.report), false); selected(result.commands, 'PixelQA');
  }
});
test('workspace geometry uses its heading viewport inside a full-window navigation wrapper', options, t => {
  const result = run(t, { wrapper: true }); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(result.report, 'utf8')).screens[0].viewport, [0, 63, 1080, 2337]);
  const overlap = run(t, { wrapper: true, viewport: '[0,0][1080,2400]' }); assert.notEqual(overlap.status, 0); assert.match(overlap.stderr, /overlaps system bars/); assert.equal(existsSync(overlap.report), false);
});
