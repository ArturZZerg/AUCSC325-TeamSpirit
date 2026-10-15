import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, router as appRouter, useGlobalSearchParams, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { useSessionStore } from '@/store/session';
import { DeviceReminderSync } from '@/features/device-reminders';
import { queryClient } from '@/lib/query-client';
import { FocusRecoverySync } from '@/features/focus-recovery-sync';
import { SessionAccessSync } from '@/features/session-access-sync';
import { ReminderResponseSync } from '@/features/reminder-response-sync';
import { colorScheme, colors } from '@/components/ui';
import { AppErrorScreen } from '@/features/app-error';
function Gate() {
  const router = useRouter(), segments = useSegments();
  const { next } = useGlobalSearchParams<{ next?: string }>();
  const { session, ready, restore } = useSessionStore();
  useEffect(() => { void restore(); }, [restore]);
  useEffect(() => {
    if (!ready) return;
    const atAuth = segments[0] === 'auth' || segments[0] === 'recover' || segments[0] === 'verify';
    const atPublicPage = segments.length === 1 && ['help', '+not-found'].includes(segments[0]);
    if (!session && !atAuth && !atPublicPage) router.replace(segments[0] === 'account' ? '/auth?next=account' : '/auth');
    if (session && atAuth) router.replace(next === 'account' ? '/account' : '/today');
  }, [ready, session, segments, router, next]);
  return <Stack screenOptions={{ headerShown: false, statusBarStyle: colorScheme === 'dark' ? 'light' : 'dark', contentStyle: { backgroundColor: colors.canvas } }}><Stack.Screen name="auth"/><Stack.Screen name="recover"/><Stack.Screen name="verify"/><Stack.Screen name="(tabs)"/></Stack>;
}
export default function RootLayout() { return <QueryClientProvider client={queryClient}><SessionAccessSync /><FocusRecoverySync /><DeviceReminderSync /><Gate /><ReminderResponseSync /></QueryClientProvider>; }

/** Root render-failure recovery for every route below this layout. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <AppErrorScreen onRetry={() => { void retry(); }} onHome={() => { appRouter.replace('/today'); void retry(); }}/>;
}
