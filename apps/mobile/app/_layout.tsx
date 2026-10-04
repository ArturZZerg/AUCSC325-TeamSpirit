import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useSessionStore } from '@/store/session';
import { DeviceReminderSync } from '@/features/device-reminders';
import { queryClient } from '@/lib/query-client';
function Gate() { const router = useRouter(); const segments = useSegments(); const { session, ready, restore } = useSessionStore(); useEffect(() => { void restore(); }, [restore]); useEffect(() => { if (!ready) return; const atAuth = segments[0] === 'auth'; if (!session && !atAuth) router.replace('/auth'); if (session && atAuth) router.replace('/today'); }, [ready, session, segments, router]); return <Stack screenOptions={{ headerShown: false, statusBarStyle: 'dark' }}><Stack.Screen name="auth"/><Stack.Screen name="(tabs)"/></Stack>; }
export default function RootLayout() { return <QueryClientProvider client={queryClient}><DeviceReminderSync /><Gate /></QueryClientProvider>; }
