import { forwardRef, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, type CircleProps } from 'react-native-svg';
import { design, typography } from '@/components/ui';
import { useReducedMotion } from '@/components/motion';

// Animated adds a native flattening hint; SVG DOM elements must not receive it.
const ProgressCircle = forwardRef<Circle, CircleProps & { collapsable?: boolean }>(function ProgressCircle({ collapsable, ...props }, ref) {
  return <Circle ref={ref} {...props} {...(Platform.OS === 'web' ? {} : { collapsable })}/>;
});
const AnimatedCircle = Animated.createAnimatedComponent(ProgressCircle);
const circumference = 2 * Math.PI * 45;
const ticks = Array.from({ length: 24 }, (_, index) => {
  const angle = index * Math.PI / 12;
  return { x1: 60 + Math.sin(angle) * 55, y1: 60 - Math.cos(angle) * 55,
    x2: 60 + Math.sin(angle) * 58, y2: 60 - Math.cos(angle) * 58 };
});

/** Only the progress changes animate. No timer or decorative loop runs in the background. */
export function FlowProgress({ done, total }: { done: number; total: number }) {
  const reduced = useReducedMotion();
  const ratio = total ? Math.max(0, Math.min(1, done / total)) : 0;
  const progress = useRef(new Animated.Value(ratio)).current;
  useEffect(() => {
    if (reduced) { progress.stopAnimation(); progress.setValue(ratio); return; }
    const animation = Animated.timing(progress, { toValue: ratio, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [ratio, reduced, progress]);
  return <View accessible accessibilityRole="progressbar" accessibilityLabel="Daily plan progress" accessibilityValue={{ min: 0, max: total, now: done }} style={styles.ring}>
    <Svg width={120} height={120} viewBox="0 0 120 120" style={styles.svg}>
      {ticks.map((tick, index) => <Line key={index} {...tick} stroke={design.heroMuted} strokeOpacity={index % 6 === 0 ? .65 : .22} strokeWidth={1}/>)}
      <Circle cx={60} cy={60} r={45} stroke="#395247" strokeWidth={4} fill="none"/>
      <AnimatedCircle cx={60} cy={60} r={45} stroke={design.signal} strokeWidth={4} fill="none" strokeDasharray={circumference}
        strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })} strokeLinecap="round"/>
    </Svg>
    <Text style={styles.value}>{total ? `${done} of ${total}` : 'Clear'}</Text><Text style={styles.label}>completed</Text>
  </View>;
}

const styles = StyleSheet.create({
  ring: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', gap: 2 },
  svg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  value: { ...typography, color: design.signal, fontSize: 25, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  label: { ...typography, color: design.heroMuted, fontSize: 10 },
});
