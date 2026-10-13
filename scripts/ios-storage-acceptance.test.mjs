import assert from 'node:assert/strict';
import test from 'node:test';
import { storageAcceptanceConfig, assertOwnedTask, publicFlowFailure } from './ios-storage-acceptance.mjs';
const env = { GITHUB_ACTIONS: 'true', RUNNER_OS: 'macOS', IOS_SIMULATOR_UDID: '11111111-2222-3333-4444-555555555555', IOS_PG_BIN: '/opt/postgres/bin' };

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
