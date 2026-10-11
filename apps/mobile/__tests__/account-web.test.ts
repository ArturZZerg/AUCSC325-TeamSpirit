import { sessionStorage } from '../src/services/session-storage.web';
import { shareAccountExport, clearAccountExports } from '../src/services/account-export.web';
import { accountFixture } from './account-fixture';
const click = jest.fn(), remove = jest.fn(), appendChild = jest.fn();
const create = jest.fn(), revoke = jest.fn();
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ click, remove }), body: { appendChild } } });
  URL.createObjectURL = create.mockReturnValue('blob:private-export'); URL.revokeObjectURL = revoke;
});
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });
it('keeps web credentials in memory and clears them on sign-out', async () => {
  await sessionStorage.clear(); expect(await sessionStorage.read()).toBeNull();
  await sessionStorage.write('private-session'); expect(await sessionStorage.read()).toBe('private-session');
  await sessionStorage.clear(); expect(await sessionStorage.read()).toBeNull();
});
it('requests a real JSON download and releases its blob on account cleanup', async () => {
  const data = accountFixture(); await shareAccountExport(data, () => true);
  expect(click).toHaveBeenCalledTimes(1); expect(appendChild.mock.calls[0][0].download).toBe(`campusflow-${data.capturedAt.slice(0, 10)}.json`);
  expect(create.mock.calls[0][0]).toBeInstanceOf(Blob); expect(remove).toHaveBeenCalled();
  await clearAccountExports(data.profile.id); expect(revoke).toHaveBeenCalledWith('blob:private-export');
});
it('does not download for an expired owner', async () => {
  await shareAccountExport(accountFixture(), () => false); expect(create).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
});
