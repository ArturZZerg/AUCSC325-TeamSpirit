import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { Session } from '@/lib/types';
import { clearAccountCache } from '@/services/cache';
import { clearScheduledReminders } from '@/services/reminders';
const key = 'campusflow.session.v1';
type State = { session: Session | null; ready: boolean; restore(): Promise<void>; setSession(session: Session): Promise<void>; signOut(): Promise<void> };
export const useSessionStore = create<State>((set, get) => ({
  session: null, ready: false,
  async restore() { const raw = await SecureStore.getItemAsync(key); set({ session: raw ? JSON.parse(raw) : null, ready: true }); },
  async setSession(session) { await SecureStore.setItemAsync(key, JSON.stringify(session)); set({ session }); },
  async signOut() { const session = get().session; if (session) { try { await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` } }); } catch { /* Local sign-out must still protect the device when offline. */ } } await SecureStore.deleteItemAsync(key); if (session) await clearAccountCache(session.user.id); await clearScheduledReminders(); set({ session: null }); }
}));
