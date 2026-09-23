import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useSessionStore } from '@/store/session';
import { useReminders } from '@/features/queries';
import { reconcileReminders } from '@/services/reminders';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });
function Gate() { const router = useRouter(); const segments = useSegments(); const { session, ready, restore } = useSessionStore(); useEffect(() => { void restore(); }, [restore]); useEffect(() => { if (!ready) return; const atAuth = segments[0] === 'auth'; if (!session && !atAuth) router.replace('/auth'); if (session && atAuth) router.replace('/today'); }, [ready, session, segments, router]); return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="auth"/><Stack.Screen name="(tabs)"/></Stack>; }
function DeviceReminderSync() { const reminders = useReminders(); useEffect(() => { if (reminders.data) void reconcileReminders(reminders.data); }, [reminders.data]); return null; }
export default function RootLayout() { return <QueryClientProvider client={queryClient}><DeviceReminderSync /><Gate /></QueryClientProvider>; }
