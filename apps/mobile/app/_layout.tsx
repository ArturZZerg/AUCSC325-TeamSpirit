import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useSessionStore } from '@/store/session';
import { DeviceReminderSync } from '@/features/device-reminders';
import { queryClient } from '@/lib/query-client';
import { FocusRecoverySync } from '@/features/focus-recovery-sync';
import { SessionAccessSync } from '@/features/session-access-sync';
function Gate() {
  const router = useRouter(), segments = useSegments();
  const { next } = useGlobalSearchParams<{ next?: string }>();
  const { session, ready, restore } = useSessionStore();
  useEffect(() => { void restore(); }, [restore]);
  useEffect(() => {
    if (!ready) return;
    const atAuth = segments[0] === 'auth' || segments[0] === 'recover' || segments[0] === 'verify';
    const atHelp = segments.length === 1 && segments[0] === 'help';
    if (!session && !atAuth && !atHelp) router.replace(segments[0] === 'account' ? '/auth?next=account' : '/auth');
    if (session && atAuth) router.replace(next === 'account' ? '/account' : '/today');
  }, [ready, session, segments, router, next]);
  return <Stack screenOptions={{ headerShown: false, statusBarStyle: 'dark' }}><Stack.Screen name="auth"/><Stack.Screen name="recover"/><Stack.Screen name="verify"/><Stack.Screen name="(tabs)"/></Stack>;
}
export default function RootLayout() { return <QueryClientProvider client={queryClient}><SessionAccessSync /><FocusRecoverySync /><DeviceReminderSync /><Gate /></QueryClientProvider>; }
