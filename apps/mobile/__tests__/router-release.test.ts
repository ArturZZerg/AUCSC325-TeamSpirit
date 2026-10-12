import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath';
import { getPathFromState } from 'expo-router/build/fork/getPathFromState';

// SDK 55 bundles an older decoder through query-string. These tests exercise
// the installed Router, with a canary that fails if that decoder becomes part
// of incoming-link handling. This does not patch/remove the dependency.
jest.mock('decode-uri-component', () => jest.fn(() => { throw new Error('Unsafe decoder reached by incoming link'); }));
afterEach(() => expect(jest.requireMock('decode-uri-component')).not.toHaveBeenCalled());

const config = { screens: { account: 'account', auth: 'auth', today: 'today', journal: 'journal',
  focus: 'focus', '+not-found': '*not-found' } };
function roundTrip(path: string) {
  const state = getStateFromPath(path, config);
  if (!state) throw new Error('Expected a usable navigation state');
  const serialized = getPathFromState(state, config);
  expect(typeof serialized).toBe('string');
  return { state, serialized };
}

it('preserves ordinary account links and navigation serialization', () => {
  const { state, serialized } = roundTrip('/account');
  expect(state.routes[0].name).toBe('account'); expect(serialized).toBe('/account');
});
it('preserves task identity and Unicode text in a focus link', () => {
  const id = '74000000-0000-4000-8000-000000000001';
  const { state, serialized } = roundTrip(`/focus?taskId=${id}&title=Am%C3%A9lie%20%26%20study`);
  expect(state.routes[0]).toMatchObject({ name: 'focus', params: { taskId: id, title: 'Amélie & study' } });
  const replay = getStateFromPath(serialized, config);
  expect(replay?.routes[0].params).toMatchObject({ taskId: id, title: 'Amélie & study' });
});
it.each([
  ['unfinished escape', '/account?probe=%'],
  ['incomplete UTF-8', '/account?probe=%E0%A4%A'],
  ['invalid UTF-8', '/auth?next=%C0%AF'],
  ['repeated malformed bytes', `/journal?probe=${'%E0'.repeat(256)}`],
  ['malformed unknown segment', '/unknown/%E0%A4%A'],
])('keeps parsing and serialization usable for a bounded link with %s', (_label, path) => {
  const { serialized } = roundTrip(path);
  expect(serialized.length).toBeLessThan(4096);
  expect(getStateFromPath(serialized, config)).toBeDefined();
});
it('preserves ordinary query data without changing navigation or global object prototypes', () => {
  const { state } = roundTrip('/journal?__proto__=untrusted&constructor=untrusted&note=ordinary');
  expect(state.routes[0].params).toMatchObject({ note: 'ordinary' });
  expect(Object.getPrototypeOf(state.routes[0].params)).toBe(Object.prototype);
  expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  expect(Object.prototype).not.toHaveProperty('untrusted');
});
