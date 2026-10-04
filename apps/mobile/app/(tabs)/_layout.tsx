import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { colors } from '@/components/ui';
import { useSessionStore } from '@/store/session';

const icons: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  today: 'today-outline',
  tasks: 'checkbox-outline',
  campus: 'school-outline',
  wellness: 'heart-outline',
  settings: 'settings-outline',
};

export default function TabsLayout() {
  const session = useSessionStore(state => state.session);
  // Retained routes must discard private forms, selections and pending UI when
  // the authenticated session changes. Query/cache cleanup remains separate.
  return <Tabs key={JSON.stringify([session?.user.id, session?.accessToken])} screenOptions={({ route }) => ({
    headerStyle: { backgroundColor: colors.canvas },
    headerShadowVisible: false,
    tabBarActiveTintColor: colors.moss,
    tabBarStyle: { backgroundColor: '#fff' },
    tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? 'ellipse-outline'} color={color} size={size} />,
  })}>
    <Tabs.Screen name="today" options={{ title: 'Today' }}/>
    <Tabs.Screen name="tasks" options={{ title: 'Tasks' }}/>
    <Tabs.Screen name="campus" options={{ title: 'Campus' }}/>
    <Tabs.Screen name="wellness" options={{ title: 'Wellness' }}/>
    <Tabs.Screen name="settings" options={{ title: 'Settings' }}/>
  </Tabs>;
}
