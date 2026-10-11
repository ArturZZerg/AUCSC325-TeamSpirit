import * as SQLite from 'expo-sqlite';
let dbPromise: ReturnType<typeof SQLite.openDatabaseAsync> | undefined;
const writes = new Map<string, Promise<void>>();
function accountWrite(accountId: string, operation: () => Promise<void>): Promise<void> {
  const pending = (writes.get(accountId) ?? Promise.resolve()).catch(() => undefined).then(operation);
  writes.set(accountId, pending);
  void pending.finally(() => { if (writes.get(accountId) === pending) writes.delete(accountId); }).catch(() => undefined);
  return pending;
}
async function database() { if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('campusflow-cache.db'); const db = await dbPromise; await db.execAsync('CREATE TABLE IF NOT EXISTS snapshots (account_id TEXT NOT NULL, cache_key TEXT NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(account_id, cache_key));'); return db; }
export async function readCache<T>(accountId: string, key: string): Promise<T | undefined> {
  const row = await (await database()).getFirstAsync<{ payload: string }>('SELECT payload FROM snapshots WHERE account_id = ? AND cache_key = ?', [accountId, key]);
  if (!row) return undefined;
  try { return JSON.parse(row.payload) as T; }
  catch { return undefined; } // A corrupt disposable cache must not prevent a server refresh.
}
export function writeCache(accountId: string, key: string, value: unknown, isCurrent = () => true) {
  return accountWrite(accountId, async () => {
    if (!isCurrent()) return;
    const db = await database();
    if (isCurrent()) await db.runAsync('INSERT OR REPLACE INTO snapshots (account_id, cache_key, payload, saved_at) VALUES (?, ?, ?, ?)', [accountId, key, JSON.stringify(value), new Date().toISOString()]);
  });
}
export function deleteCache(accountId: string, key: string, isCurrent = () => true) {
  return accountWrite(accountId, async () => {
    if (!isCurrent()) return;
    const db = await database();
    if (isCurrent()) await db.runAsync('DELETE FROM snapshots WHERE account_id = ? AND cache_key = ?', [accountId, key]);
  });
}
export function clearAccountCache(accountId: string) {
  // A read that was already saving cannot recreate rows after sign-out clears them.
  return accountWrite(accountId, async () => { await (await database()).runAsync('DELETE FROM snapshots WHERE account_id = ?', [accountId]); });
}
