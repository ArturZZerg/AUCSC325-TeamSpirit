import type { AccountExport } from '@campusflow/contracts';
const links = new Map<string, Set<string>>();
export async function clearAccountExports(accountId: string) {
  for (const url of links.get(accountId) ?? []) URL.revokeObjectURL(url);
  links.delete(accountId);
}
export async function shareAccountExport(data: AccountExport, isCurrent: () => boolean): Promise<string | undefined> {
  if (!isCurrent()) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const urls = links.get(data.profile.id) ?? new Set<string>(); urls.add(url); links.set(data.profile.id, urls);
  const link = document.createElement('a');
  try {
    link.href = url; link.download = `campusflow-${data.capturedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    if (isCurrent()) link.click();
    return 'Download requested. Keep the JSON file somewhere private.';
  } finally {
    link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); if (!urls.size) links.delete(data.profile.id); }, 1_000);
  }
}
