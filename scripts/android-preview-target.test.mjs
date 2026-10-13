import assert from 'node:assert/strict';
import test from 'node:test';
import { androidPreviewTarget, checkAndroidArchitecture, inspectAndroidArchitecture } from './android-preview-target.mjs';

test('ordinary preview stays arm64 with the established artifact', () => {
  for (const args of [[], ['--check']]) assert.deepEqual(androidPreviewTarget(args), { architecture: 'arm64-v8a', artifact: 'campusflow-preview.apk' });
});
test('explicit emulator preview uses x86 and a separate artifact', () => {
  for (const args of [['--emulator'], ['--check', '--emulator'], ['--emulator', '--check']])
    assert.deepEqual(androidPreviewTarget(args), { architecture: 'x86_64', artifact: 'campusflow-emulator-preview.apk' });
});
test('unknown, repeated and shell-bearing target arguments fail closed', () => {
  for (const args of [['x86_64'], ['--emulator', '--emulator'], ['--check', '--check'], ['--emulator; echo bad'], ['--check', '--emulator', '--extra'], null])
    assert.throws(() => androidPreviewTarget(args), /accepts only/);
});
test('actual native-code report must match only the selected architecture', () => {
  for (const architecture of ['arm64-v8a', 'x86_64']) {
    assert.equal(checkAndroidArchitecture(`package: name='com.campusflow.mobile'\r\nnative-code: '${architecture}'\r\n`, architecture), architecture);
    for (const report of ['', "native-code: 'armeabi-v7a'", "native-code: 'x86_64' 'arm64-v8a'", `native-code: '${architecture}'\nnative-code: '${architecture}'`, 'private'.repeat(50_000)])
      assert.throws(() => checkAndroidArchitecture(report, architecture));
  }
  assert.throws(() => checkAndroidArchitecture("native-code: 'mips'", 'mips'));
});
test('SDK inspection failures never repeat private paths or raw diagnostics', () => {
  assert.throws(() => inspectAndroidArchitecture('private-apk-secret', 'missing-sdk-secret', 'x86_64'), error => !error.message.includes('secret') && /Could not inspect/.test(error.message));
});
