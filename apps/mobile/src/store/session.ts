import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { sessionSchema } from '@campusflow/contracts';
import type { Session } from '@/lib/types';
import { queryClient } from '@/lib/query-client';
import { clearAccountCache } from '@/services/cache';
import { clearScheduledReminders } from '@/services/reminders';

const key = 'campusflow.session.v1';
let revision = 0;
let transition = Promise.resolve();
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

type State = { session: Session | null; ready: boolean; restore(): Promise<void>; setSession(session: Session): Promise<void>; signOut(): Promise<void> };
export const useSessionStore = create<State>((set, get) => ({
  session: null, ready: false,
  async restore() {
    const restoringRevision = revision;
    let session: Session | null = null;
    try {
      const raw = await SecureStore.getItemAsync(key);
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
    if (previous && previous.user.id !== session.user.id) { set({ session: null }); queryClient.clear(); }
    await serialize(async () => {
      if (previous && previous.user.id !== session.user.id) {
        await clearAccountCache(previous.user.id);
        await clearScheduledReminders();
        void revokeSession(previous);
      }
      if (settingRevision !== revision) return;
      await SecureStore.setItemAsync(key, JSON.stringify(session));
      if (settingRevision === revision) set({ session, ready: true });
    });
  },
  async signOut() {
    const session = get().session;
    if (!session) return transition;
    ++revision;
    // Hide account data and cancel reads immediately, before any network or
    // storage waits. A subsequent sign-in waits for the serialized cleanup.
    set({ session: null });
    queryClient.clear();
    void revokeSession(session);
    await serialize(async () => {
      await SecureStore.deleteItemAsync(key);
      await clearAccountCache(session.user.id);
      await clearScheduledReminders();
    });
  },
}));
