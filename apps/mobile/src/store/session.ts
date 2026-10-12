import { sessionStorage } from '@/services/session-storage';
import { clearAccountExports } from '@/services/account-export';
import { create } from 'zustand';
import { sessionSchema } from '@campusflow/contracts';
import type { Session } from '@/lib/types';
import { queryClient } from '@/lib/query-client';
import { clearAccountCache, deleteCache } from '@/services/cache';
import { clearScheduledReminders } from '@/services/reminders';

let revision = 0;
let transition = Promise.resolve();
const cleanupAccounts = new Set<string>();
function serialize(operation: () => Promise<void>) {
  transition = transition.catch(() => undefined).then(operation);
  return transition;
}

async function revokeSession(session: Session) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` }, signal: controller.signal,
    });
  } catch { /* Offline logout cannot guarantee server revocation; local cleanup proceeds. */ }
  finally { clearTimeout(timeout); }
}

async function cleanup() {
  const results = await Promise.allSettled([sessionStorage.clear(), clearScheduledReminders(),
    ...[...cleanupAccounts].flatMap(id => [clearAccountCache(id), clearAccountExports(id)])]);
  if (results.some(result => result.status === 'rejected')) throw new Error('Some private data could not be cleared from this device. Retry cleanup before signing in.');
  cleanupAccounts.clear();
}
type State = { session: Session | null; ready: boolean; cleanupError: string | null; accountDeleted: boolean; sessionUnavailable: boolean;
  restore(): Promise<void>; setSession(session: Session): Promise<void>; signOut(options?: { deleted?: boolean; unavailable?: boolean }): Promise<void>; retryCleanup(): Promise<void> };
export const useSessionStore = create<State>((set, get) => ({
  session: null, ready: false, cleanupError: null, accountDeleted: false, sessionUnavailable: false,
  async restore() {
    const restoringRevision = revision;
    let session: Session | null = null;
    try {
      const raw = await sessionStorage.read();
      if (raw) {
        const result = sessionSchema.safeParse(JSON.parse(raw));
        if (result.success) session = result.data;
      }
    } catch { /* Unreadable session data returns the user to sign-in. */ }
    if (restoringRevision === revision) set({ session, ready: true });
  },
  async setSession(value) {
    const session = sessionSchema.parse(value);
    const previous = get().session;
    const settingRevision = ++revision;
    if (previous && (previous.user.id !== session.user.id || previous.accessToken !== session.accessToken)) {
      set({ session: null }); queryClient.clear();
    }
    await serialize(async () => {
      if (cleanupAccounts.size) await cleanup();
      if (previous && previous.user.id !== session.user.id) {
        cleanupAccounts.add(previous.user.id);
        await cleanup();
        void revokeSession(previous);
      }
      if (settingRevision !== revision) return;
      // A fresh login must never recover a private draft from an earlier login.
      await deleteCache(session.user.id, 'focus-draft:v1');
      if (settingRevision !== revision) return;
      await sessionStorage.write(JSON.stringify(session));
      if (settingRevision === revision) set({ session, ready: true, cleanupError: null, accountDeleted: false, sessionUnavailable: false });
    });
  },
  async signOut(options) {
    const session = get().session;
    if (!session) return transition;
    ++revision;
    // Hide account data and cancel reads immediately, before any network or
    // storage waits. A subsequent sign-in waits for the serialized cleanup.
    set({ session: null, accountDeleted: options?.deleted === true, sessionUnavailable: options?.unavailable === true });
    queryClient.clear();
    if (!options?.deleted && !options?.unavailable) void revokeSession(session);
    cleanupAccounts.add(session.user.id);
    await serialize(async () => {
      try { await cleanup(); set({ cleanupError: null }); }
      catch (error) { set({ cleanupError: (error as Error).message }); }
    });
  },
  async retryCleanup() {
    await serialize(async () => {
      try { await cleanup(); set({ cleanupError: null }); }
      catch (error) { set({ cleanupError: (error as Error).message }); }
    });
  },
}));
