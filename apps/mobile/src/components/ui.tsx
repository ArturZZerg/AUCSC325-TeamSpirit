import type { PropsWithChildren, ReactNode, Ref } from 'react';
import type { TextInputProps } from 'react-native';
import { ActivityIndicator, Appearance, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MotionPressable } from './motion';
// Text colours meet WCAG AA (4.5:1) on canvas, card and sage, and onAccent on every accent;
// accessibility-contrast.test.ts checks each pair.
const light = { ink: '#202D27', muted: '#626C64', canvas: '#F7F8F5', card: '#FFFFFF', moss: '#285743', sage: '#EAF0E9', coral: '#A4513C', danger: '#A64B36', line: '#E5E9E2', blue: '#3C6488', plum: '#765580',
  onAccent: '#FFFFFF', onAccentMuted: 'rgba(255,255,255,0.88)', onAccentTrack: 'rgba(255,255,255,0.28)', faint: '#AAB6AF', gold: '#8A6A00', goldLine: '#E3C46A', goldSurface: '#FFFBEF', warnText: '#725700', warnSurface: '#FFF3D4',
  dangerSurface: '#F8E6E1', dangerLine: '#E9B8AA', streak: '#D9772B', streakText: '#A4521A', streakSurface: '#FCEBD9', blueSurface: '#E3EBF2', scrim: 'rgba(0,0,0,0.35)',
  courseGold: '#9F6925', courseTeal: '#398171', courseSlate: '#5B6472', courseRose: '#B4566E' };
const dark: typeof light = { ink: '#E4ECE7', muted: '#9DAEA5', canvas: '#111714', card: '#1A231F', moss: '#77A58B', sage: '#22352B', coral: '#E39079', danger: '#E07C64', line: '#2B3832', blue: '#86AED6', plum: '#B898C4',
  onAccent: '#0F1712', onAccentMuted: 'rgba(15,23,18,0.82)', onAccentTrack: 'rgba(15,23,18,0.22)', faint: '#56645D', gold: '#E3C46A', goldLine: '#7A6524', goldSurface: '#2A2615', warnText: '#F1D58A', warnSurface: '#3A3112',
  dangerSurface: '#3B2420', dangerLine: '#6E3A2F', streak: '#F09A52', streakText: '#F6B57D', streakSurface: '#3A2716', blueSurface: '#1F2C3A', scrim: 'rgba(0,0,0,0.6)',
  courseGold: '#B97D31', courseTeal: '#4F9686', courseSlate: '#868D97', courseRose: '#C17286' };
/** Follows the system appearance at launch: every StyleSheet reads these values once, at module load. */
export const colorScheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
export const colors = colorScheme === 'dark' ? dark : light;
/** Both palettes, for the contrast checks. */
export const palettes = { light, dark };
/** Concentrated contrast for navigation and primary calls to action in either theme. */
export const design = {
  chrome: '#122B24', chromeLine: '#2B4339', chromeText: '#EFF7F1', chromeMuted: '#AFC3B6',
  signal: '#CBF59A', signalInk: '#183126', hero: '#142E26', heroText: '#F2F7F3', heroMuted: '#BBCCBF',
};
/** A native system stack on devices, a crisp editorial sans-serif on the web. */
export const typography = { fontFamily: Platform.OS === 'web' ? '"Avenir Next", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif' : undefined };
export function Screen({ children, safeArea = false, edges }: PropsWithChildren<{ safeArea?: boolean; edges?: ('top' | 'bottom' | 'left' | 'right')[] }>) {
  return safeArea ? <SafeAreaView edges={edges} style={styles.screen}>{children}</SafeAreaView> : <View style={styles.screen}>{children}</View>;
}
/** Compact top-left navigation; the accessible name keeps the full "Back to …" wording. */
export function BackLink({ to, onPress, disabled }: { to: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${to}`} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.back, (pressed || disabled) && styles.backPressed]}><Ionicons name="chevron-back" size={20} color={colors.moss}/><Text style={styles.backText}>{to[0].toUpperCase() + to.slice(1)}</Text></Pressable>; }
export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export function Button({ title, onPress, tone = 'primary', disabled, testID, accessibilityLabel }: { title: string; onPress: () => void; tone?: 'primary' | 'plain' | 'danger'; disabled?: boolean; testID?: string; accessibilityLabel?: string }) { return <MotionPressable testID={testID} accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ hovered }) => [styles.button, tone === 'plain' && styles.plain, tone === 'danger' && styles.danger, hovered && (tone === 'primary' ? styles.primaryHover : styles.secondaryHover), disabled && styles.disabled]}><Text style={[styles.buttonText, tone === 'plain' && styles.plainText, tone === 'danger' && styles.dangerText]}>{title}</Text>{tone === 'primary' && <Ionicons name="arrow-forward" size={17} color={design.heroText}/>}</MotionPressable>; }
export function Field({ label, value, onChangeText, placeholder, multiline = false, accessory, inputRef, ...inputProps }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean; accessory?: ReactNode; inputRef?: Ref<TextInput> } & Pick<TextInputProps, 'secureTextEntry' | 'keyboardType' | 'autoCapitalize' | 'autoCorrect' | 'editable' | 'testID' | 'returnKeyType' | 'onSubmitEditing' | 'submitBehavior'>) { const input = <TextInput ref={inputRef} {...inputProps} accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.multiline, !!accessory && styles.grow]} value={value} onChangeText={onChangeText} placeholder={placeholder} multiline={multiline} />; return <View style={styles.field}><Text style={styles.label}>{label}</Text>{accessory ? <View style={styles.inputRow}>{input}{accessory}</View> : input}</View>; }
export function State({ loading, error, empty }: { loading?: boolean; error?: unknown; empty?: string }) { if (loading) return <View style={styles.state}><ActivityIndicator color={colors.moss}/><Text style={styles.stateText}>Loading your plan…</Text></View>; if (error) return <View style={styles.state}><Text style={styles.error}>Couldn’t refresh. Showing saved information when available.</Text></View>; if (empty) return <View style={styles.state}><Text style={styles.stateText}>{empty}</Text></View>; return null; }
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 22, gap: 12, borderWidth: 1, borderColor: colors.line },
  button: { minHeight: 50, borderRadius: 12, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: design.hero },
  buttonText: { ...typography, color: design.heroText, fontWeight: '700', fontSize: 14, letterSpacing: .1 },
  primaryHover: { backgroundColor: '#224D3C', shadowColor: '#163F2E', shadowOpacity: .16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }, secondaryHover: { opacity: .84 },
  plain: { backgroundColor: colors.sage }, plainText: { color: colors.ink }, danger: { backgroundColor: colors.danger }, dangerText: { color: colors.onAccent }, disabled: { opacity: .5 },
  field: { gap: 8 }, label: { ...typography, color: colors.ink, fontWeight: '600', fontSize: 13 },
  input: { ...typography, minHeight: 50, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, color: colors.ink, backgroundColor: colors.card, fontSize: 15, outlineColor: colors.moss },
  multiline: { minHeight: 100, textAlignVertical: 'top', paddingTop: 14 }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, grow: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingRight: 8 }, backPressed: { opacity: 0.6 },
  backText: { ...typography, color: colors.moss, fontWeight: '600', fontSize: 15 }, state: { alignItems: 'center', gap: 10, padding: 24 },
  stateText: { ...typography, color: colors.ink }, error: { ...typography, color: colors.coral, textAlign: 'center' },
});
