import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, colors } from '@/components/ui';

/**
 * Shown by the root error boundary when a screen fails to render. It never shows
 * the error text, which could contain private data; saved work is on the server
 * or in the device cache, so retrying or returning to Today is safe.
 */
export function AppErrorScreen({ onRetry, onHome }: { onRetry(): void; onHome(): void }) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.icon}><Ionicons name="leaf-outline" size={30} color={colors.moss}/></View>
    <Text accessibilityRole="header" style={styles.title}>Something went wrong.</Text>
    <Text style={styles.body}>This screen couldn’t load. Your saved tasks and plans aren’t affected. Try again, or go back to Today.</Text>
    <View style={styles.actions}>
      <Button title="Try again" onPress={onRetry}/>
      <Button title="Go to Today" tone="plain" onPress={onHome}/>
    </View>
    <Text style={styles.meta}>If this keeps happening, open Help & data from the sign-in screen for support options.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800' }, body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  actions: { gap: 12 }, meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
