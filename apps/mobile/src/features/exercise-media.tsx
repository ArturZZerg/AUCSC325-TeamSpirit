import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/components/ui';

/**
 * Library photos (free-exercise-db, public domain) are synced to the API host
 * under /campusflow-media (ADR 022). Without them the app shows an icon.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
export const exerciseMediaBase = (process.env.EXPO_PUBLIC_EXERCISE_MEDIA_URL ?? new URL('/campusflow-media/exercises', apiUrl).toString()).replace(/\/+$/, '');
export const exercisePhoto = (mediaId: string, frame = 0) => `${exerciseMediaBase}/${encodeURIComponent(mediaId)}/${frame}.jpg`;

function Placeholder({ size }: { size: number }) {
  return <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 5 }]}><Ionicons name="barbell-outline" size={size * 0.45} color={colors.moss}/></View>;
}

export function ExerciseThumb({ mediaId, size = 56 }: { mediaId?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!mediaId || failed) return <Placeholder size={size}/>;
  return <Image accessibilityIgnoresInvertColors source={{ uri: exercisePhoto(mediaId) }} onError={() => setFailed(true)}
    style={{ width: size, height: size, borderRadius: size / 5, backgroundColor: colors.sage }}/>;
}

/** Start and finish positions cross-fade like a slow demonstration; still when the system asks for reduced motion. */
export function ExerciseAnimation({ mediaId, height = 220 }: { mediaId?: string; height?: number }) {
  const fade = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false); const [reduced, setReduced] = useState(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined); }, []);
  useEffect(() => {
    if (!mediaId || failed || reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(700), Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.delay(700), Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [mediaId, failed, reduced, fade]);
  if (!mediaId || failed) return null;
  const frame = (index: number) => ({ uri: exercisePhoto(mediaId, index) });
  return <View accessibilityRole="image" accessibilityLabel="Exercise demonstration: start and finish positions" style={[styles.stage, { height }]}>
    <Image accessibilityIgnoresInvertColors source={frame(0)} onError={() => setFailed(true)} resizeMode="contain" style={StyleSheet.absoluteFill}/>
    <Animated.Image accessibilityIgnoresInvertColors source={frame(1)} resizeMode="contain" style={[StyleSheet.absoluteFill, { opacity: fade }]}/>
  </View>;
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  stage: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' },
});
