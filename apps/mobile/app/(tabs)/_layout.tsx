import { Tabs, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, design, typography } from '@/components/ui';
import { MotionPressable as SidebarButton } from '@/components/motion';
import { useSessionStore } from '@/store/session';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icons: Record<string, IconName> = {
  today: 'sunny-outline',
  tasks: 'checkbox-outline',
  campus: 'compass-outline',
  wellness: 'heart-outline',
  gym: 'barbell-outline',
  settings: 'settings-outline',
};
const activeIcons: Record<string, IconName> = {
  today: 'sunny', tasks: 'checkbox', campus: 'compass', wellness: 'heart', gym: 'barbell', settings: 'settings',
};

/** Desktop navigation shares the same retained tab routes as the mobile bar. */
export function DesktopSidebar({ state, descriptors, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const user = useSessionStore(value => value.session?.user);
  const name = user?.displayName || 'Your workspace';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const renderTab = (route: typeof state.routes[number], index: number) => {
    const selected = state.index === index;
    const title = descriptors[route.key].options.title ?? route.name;
    return <SidebarButton key={route.key} accessibilityRole="tab" accessibilityLabel={title} accessibilityState={{ selected }}
      onPress={() => {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      }}
      onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
      style={({ pressed, hovered }) => [styles.navItem, selected && styles.navSelected, !selected && hovered && styles.navHover, pressed && styles.pressed]}>
      <Ionicons name={(selected ? activeIcons[route.name] : icons[route.name]) ?? 'ellipse-outline'} size={20} color={selected ? design.signalInk : design.chromeMuted}/>
      <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{title}</Text>
      {selected && <View style={styles.selectedDot}/>}
    </SidebarButton>;
  };
  return <View style={styles.sidebar}>
    <SidebarButton accessibilityRole="button" accessibilityLabel="CampusFlow home" onPress={() => navigation.navigate('today')} style={styles.brand}>
      <View style={styles.brandMark}><Ionicons name="leaf" color={design.signalInk} size={22}/></View>
      <Text style={styles.brandName}>campusflow<Text style={styles.brandPeriod}>.</Text></Text>
    </SidebarButton>
    <ScrollView style={styles.sidebarScroll} contentContainerStyle={styles.sidebarContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionLabel}>Your everyday</Text>
      <View style={styles.navGroup} accessibilityRole="tablist">
        {state.routes.map((route, index) => route.name !== 'settings' ? renderTab(route, index) : null)}
      </View>
      <Text style={[styles.sectionLabel, styles.workspaceLabel]}>Workspace</Text>
      <View style={styles.navGroup}>
        {([
          ['book-outline', 'Academics', '/academics'],
          ['calendar-outline', 'Calendar', '/calendar'],
          ['timer-outline', 'Focus', '/focus'],
          ['repeat-outline', 'Routines', '/routines'],
        ] as const).map(([icon, title, href]) => <SidebarButton key={href} accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(href)}
          style={({ pressed, hovered }) => [styles.navItem, hovered && styles.navHover, pressed && styles.pressed]}>
          <Ionicons name={icon} color={design.chromeMuted} size={20}/><Text style={styles.navLabel}>{title}</Text>
        </SidebarButton>)}
      </View>
      <View style={styles.focusCard}>
        <View style={styles.focusTop}><Ionicons name="timer-outline" size={18} color={design.signal}/><Text style={styles.focusEyebrow}>Focus space</Text></View>
        <Text style={styles.focusTitle}>Find your rhythm.</Text>
        <Text style={styles.focusDescription}>A quiet session for your next task.</Text>
        <SidebarButton accessibilityRole="button" accessibilityLabel="Start a focus session" onPress={() => router.push('/focus')}
          style={({ pressed, hovered }) => [styles.focusButton, hovered && styles.focusButtonHover, pressed && styles.pressed]}>
          <Text style={styles.focusButtonText}>Start focus</Text><Ionicons name="play" size={14} color={design.signalInk}/>
        </SidebarButton>
      </View>
    </ScrollView>
    <View style={styles.sidebarBottom}>
      {state.routes.map((route, index) => route.name === 'settings' ? renderTab(route, index) : null)}
      <SidebarButton accessibilityRole="button" accessibilityLabel="Help & data" onPress={() => router.push('/help')}
        style={({ pressed, hovered }) => [styles.navItem, hovered && styles.navHover, pressed && styles.pressed]}>
        <Ionicons name="help-circle-outline" color={design.chromeMuted} size={20}/><Text style={styles.navLabel}>Help & support</Text>
      </SidebarButton>
      <SidebarButton accessibilityRole="button" accessibilityLabel="Manage your account" onPress={() => router.push('/account')}
        style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.profileCopy}><Text style={styles.profileName} numberOfLines={1}>{name}</Text><Text style={styles.profileSubtitle}>Your personal space</Text></View>
        <Ionicons name="chevron-forward" size={15} color={design.chromeMuted}/>
      </SidebarButton>
    </View>
  </View>;
}

export default function TabsLayout() {
  const session = useSessionStore(state => state.session);
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1000;
  // Retained routes discard private forms and pending UI on an account or login change.
  return <Tabs key={JSON.stringify([session?.user.id, session?.accessToken])}
    tabBar={desktop ? props => <DesktopSidebar {...props}/> : undefined}
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarPosition: desktop ? 'left' : 'bottom',
      tabBarActiveTintColor: colors.moss,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      tabBarStyle: desktop ? styles.desktopBar : styles.mobileBar,
      tabBarItemStyle: styles.mobileItem,
      tabBarLabelStyle: styles.mobileLabel,
      tabBarIcon: ({ color, focused }) => <View style={[styles.mobileIcon, focused && styles.mobileIconActive]}><Ionicons name={(focused ? activeIcons[route.name] : icons[route.name]) ?? 'ellipse-outline'} color={color} size={21}/></View>,
    })}>
    <Tabs.Screen name="today" options={{ title: 'Today' }}/>
    <Tabs.Screen name="tasks" options={{ title: 'Tasks' }}/>
    <Tabs.Screen name="campus" options={{ title: 'Campus' }}/>
    <Tabs.Screen name="wellness" options={{ title: 'Wellness' }}/>
    <Tabs.Screen name="gym" options={{ title: 'Gym' }}/>
    <Tabs.Screen name="settings" options={{ title: 'Settings' }}/>
  </Tabs>;
}

const styles = StyleSheet.create({
  sidebar: { width: 232, flexShrink: 0, backgroundColor: design.chrome, borderRightWidth: 1, borderRightColor: design.chromeLine, paddingTop: 32 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 23, paddingBottom: 44, minHeight: 46 },
  brandMark: { width: 34, height: 36, borderRadius: 11, backgroundColor: design.signal, alignItems: 'center', justifyContent: 'center' },
  brandName: { ...typography, color: design.chromeText, fontSize: 23, fontWeight: '700', letterSpacing: -1 }, brandPeriod: { color: design.signal },
  sidebarScroll: { flex: 1 }, sidebarContent: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionLabel: { ...typography, color: design.chromeMuted, fontSize: 11, letterSpacing: .2, fontWeight: '500', paddingLeft: 12, marginBottom: 13 },
  workspaceLabel: { marginTop: 35 }, navGroup: { gap: 5 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 13, borderRadius: 10 },
  navSelected: { backgroundColor: design.signal }, navHover: { backgroundColor: design.chromeLine },
  navLabel: { ...typography, color: design.chromeMuted, fontSize: 13, fontWeight: '500', flex: 1 },
  navLabelSelected: { color: design.signalInk, fontWeight: '600' },
  selectedDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: design.signalInk },
  focusCard: { marginTop: 36, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: design.chromeLine, backgroundColor: design.hero, gap: 9 },
  focusTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  focusEyebrow: { ...typography, fontSize: 11, fontWeight: '500', color: design.chromeMuted },
  focusTitle: { ...typography, color: design.chromeText, fontSize: 17, fontWeight: '600', letterSpacing: -0.5, marginTop: 3 },
  focusDescription: { ...typography, color: design.chromeMuted, fontSize: 12, lineHeight: 19 },
  focusButton: { minHeight: 46, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: design.signal, borderRadius: 10, marginTop: 7 },
  focusButtonHover: { opacity: 0.75 }, focusButtonText: { ...typography, color: design.signalInk, fontSize: 12, fontWeight: '600' },
  sidebarBottom: { paddingHorizontal: 16, paddingBottom: 14, gap: 3 },
  profile: { borderTopWidth: 1, borderTopColor: design.chromeLine, marginTop: 13, paddingTop: 18, paddingBottom: 4, paddingHorizontal: 5, flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 64 },
  avatar: { width: 34, height: 34, borderRadius: 12, backgroundColor: design.chromeLine, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: design.signal, fontWeight: '600', fontSize: 11 },
  profileCopy: { flex: 1, gap: 4 }, profileName: { ...typography, color: design.chromeText, fontWeight: '600', fontSize: 12 },
  profileSubtitle: { ...typography, color: design.chromeMuted, fontSize: 10 }, pressed: { opacity: 0.7 },
  desktopBar: { width: 232, backgroundColor: design.chrome, borderRightColor: design.chromeLine },
  mobileBar: { backgroundColor: colors.card, borderTopColor: colors.line, elevation: 0, paddingTop: 7, paddingBottom: Platform.OS === 'web' ? 9 : undefined, height: Platform.OS === 'web' ? 76 : undefined },
  mobileItem: { minHeight: 46 }, mobileLabel: { fontSize: 10, fontWeight: '600', marginTop: 3 },
  mobileIcon: { width: 40, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  mobileIconActive: { backgroundColor: colors.sage },
});
