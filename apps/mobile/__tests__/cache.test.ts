import * as SQLite from 'expo-sqlite';
import { clearAccountCache, readCache, writeCache } from '../src/services/cache';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

const rows = new Map<string, string>();
const run = jest.fn(async (sql: string, values: string[]) => {
  if (sql.startsWith('INSERT')) rows.set(`${values[0]}:${values[1]}`, values[2]);
  else for (const key of rows.keys()) if (key.startsWith(`${values[0]}:`)) rows.delete(key);
});
const db = { execAsync: jest.fn().mockResolvedValue(undefined), runAsync: run,
  getFirstAsync: jest.fn(async (_sql: string, values: string[]) => {
    const payload = rows.get(`${values[0]}:${values[1]}`); return payload === undefined ? null : { payload };
  }),
};
beforeEach(() => {
  rows.clear();
  run.mockClear();
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(db as unknown as SQLite.SQLiteDatabase);
});

describe('disposable account cache (ToR 19)', () => {
  it('keeps account records separate and clears only the signed-out account', async () => {
    await writeCache('first', 'tasks', [{ title: 'First task' }]);
    await writeCache('second', 'tasks', [{ title: 'Second task' }]);
    await clearAccountCache('first');
    expect(await readCache('first', 'tasks')).toBeUndefined();
    expect(await readCache('second', 'tasks')).toEqual([{ title: 'Second task' }]);
  });

  it('treats corrupt JSON as missing cache data', async () => {
    rows.set('first:tasks', 'invalid JSON');
    expect(await readCache('first', 'tasks')).toBeUndefined();
  });

  it('finishes an already-started cache save before logout clears account rows', async () => {
    let started!: () => void;
    let finish!: () => void;
    const writing = new Promise<void>(resolve => { started = resolve; });
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    run.mockImplementationOnce(async (_sql, values) => { started(); await blocked; rows.set(`${values[0]}:${values[1]}`, values[2]); });
    const save = writeCache('first', 'tasks', [{ title: 'Late response' }]);
    await writing;
    const logout = clearAccountCache('first');
    finish(); await save; await logout;
    expect(await readCache('first', 'tasks')).toBeUndefined();
  });
});
