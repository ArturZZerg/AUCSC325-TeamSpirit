import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRestoreTarget, rehearsalConfig, restoreName, restoreRehearsal } from './restore-rehearsal.mjs';
const url = 'postgresql://campusflow:private@127.0.0.1:55435/campusflow_timetable_test';
test('restore rehearsal only accepts explicit isolated loopback test databases', () => {
  assert.equal(rehearsalConfig({ REHEARSAL_DATABASE_URL: url }).database, 'campusflow_timetable_test');
  assert.equal(rehearsalConfig({ REHEARSAL_DATABASE_URL: url.replace('campusflow_timetable_test', 'campusflow_test') }).schema, 'public');
  for (const invalid of [url.replace('127.0.0.1', 'localhost'), url.replace('127.0.0.1', 'db.example.test'),
    url.replace('55435', '5432'), url.replace('55435', '80'), url.replace(':55435', ''), url.replace('campusflow_timetable_test', 'campusflow_prod'),
    url.replace('campusflow_timetable_test', 'postgres'), url + '?host=production.example.test', url + '?schema=x%22%3BDROP',
    url + '?schema=public&schema=private', 'invalid'])
    assert.throws(() => rehearsalConfig({ REHEARSAL_DATABASE_URL: invalid }), error => !error.message.includes('private'));
});
test('generated restore target can never select the source database for cleanup', () => {
  const name = restoreName(); assertRestoreTarget(name, 'campusflow_timetable_test');
  assert.throws(() => assertRestoreTarget(name, name));
  for (const unsafe of ['postgres', 'campusflow_timetable_test', 'campusflow_restore_', 'campusflow_restore_abc";DROP DATABASE postgres'])
    assert.throws(() => assertRestoreTarget(unsafe, 'campusflow_timetable_test'));
});
test('programmatic rehearsal also validates its target before creating files or connecting', async () => {
  await assert.rejects(restoreRehearsal({ url: new URL('postgresql://user:secret@production.example.test/production') }), /isolated loopback/);
});
