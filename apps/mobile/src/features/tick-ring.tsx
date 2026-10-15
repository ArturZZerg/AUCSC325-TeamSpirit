import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/components/ui';

const ticks = Array.from({ length: 60 }, (_, index) => index);

/** A 60-tick circular progress indicator built from plain Views (no SVG dependency). */
export function TickRing({ progress, size = 260, color = colors.moss, children, ...accessibility }: PropsWithChildren<{
  progress: number; size?: number; color?: string;
  accessibilityLabel?: string; accessibilityValue?: { min: number; max: number; now: number };
}>) {
  const lit = Math.round(Math.min(1, Math.max(0, progress)) * ticks.length), radius = size / 2;
  return <View accessibilityRole="progressbar" {...accessibility} aria-valuemin={accessibility.accessibilityValue?.min}
    aria-valuemax={accessibility.accessibilityValue?.max} aria-valuenow={accessibility.accessibilityValue?.now} style={[styles.ring, { width: size, height: size }]}>
    {ticks.map(index => { const top = index % 5 === 0 ? 0 : 2;
      return <View key={index} pointerEvents="none" style={[styles.tick, { height: index % 5 === 0 ? 14 : 10, left: radius - 2, top,
        backgroundColor: index < lit ? color : `${color}38`, transformOrigin: `2px ${radius - top}px`, transform: [{ rotate: `${index * 6}deg` }] }]}/>; })}
    <View style={styles.center}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  ring: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  tick: { position: 'absolute', width: 4, borderRadius: 2 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 28 },
});
