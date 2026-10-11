import * as Sharing from 'expo-sharing';
import { clearAccountExports, shareAccountExport } from '../src/services/account-export';
import { accountFixture } from './account-fixture';
const mockDelete = jest.fn(), mockWrite = jest.fn(), mockFiles: { exists: boolean; uri: string }[] = [];
jest.mock('expo-file-system', () => ({ Paths: { cache: 'file:///cache' }, Directory: class {
  exists = true; create = jest.fn(); delete = mockDelete;
}, File: class {
  exists = false; uri = 'file:///cache/export.json';
  constructor() { mockFiles.push(this); }
  create() { this.exists = true; } write = mockWrite;
  delete() { this.exists = false; mockDelete(); }
} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); mockFiles.length = 0; jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true); jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined); });
it('shares a JSON file only for the current owner and removes its temporary copy', async () => {
  const data = accountFixture(); await shareAccountExport(data, () => true);
  expect(JSON.parse(mockWrite.mock.calls[0][0])).toEqual(data); expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/export.json', expect.objectContaining({ mimeType: 'application/json' }));
  expect(mockFiles[0].exists).toBe(false); expect(mockDelete).toHaveBeenCalledTimes(1);
});
it('never creates or shares a file if ownership changes while checking device availability', async () => {
  let finish!: (value: boolean) => void, current = true; jest.mocked(Sharing.isAvailableAsync).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = shareAccountExport(accountFixture(), () => current); current = false; finish(true); await pending;
  expect(mockWrite).not.toHaveBeenCalled(); expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
it('removes temporary files after a failed share and can clear an account directory', async () => {
  jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error('Share failed'));
  await expect(shareAccountExport(accountFixture(), () => true)).rejects.toThrow('Share failed'); expect(mockFiles[0].exists).toBe(false);
  await clearAccountExports(accountFixture().profile.id); expect(mockDelete).toHaveBeenCalledTimes(2);
});
it('reports unavailable device sharing without creating files', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  await expect(shareAccountExport(accountFixture(), () => true)).rejects.toThrow('File sharing is unavailable'); expect(mockWrite).not.toHaveBeenCalled();
});
