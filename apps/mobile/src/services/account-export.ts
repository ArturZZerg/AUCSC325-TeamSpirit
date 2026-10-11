import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { AccountExport } from '@campusflow/contracts';

const directory = (accountId: string) => new Directory(Paths.cache, 'campusflow-exports', accountId);
export async function clearAccountExports(accountId: string) {
  const folder = directory(accountId);
  if (folder.exists) folder.delete();
}
export async function shareAccountExport(data: AccountExport, isCurrent: () => boolean): Promise<string | undefined> {
  if (!isCurrent()) return;
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device. Try the web account centre.');
  if (!isCurrent()) return;
  const folder = directory(data.profile.id);
  folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, `campusflow-${data.capturedAt.replace(/[:.]/g, '-')}.json`);
  try {
    file.create({ overwrite: true }); file.write(JSON.stringify(data, null, 2));
    if (!isCurrent()) return;
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your CampusFlow copy' });
    return 'Share sheet closed. Any copy you saved is under your control.';
  } finally { if (file.exists) file.delete(); }
}
