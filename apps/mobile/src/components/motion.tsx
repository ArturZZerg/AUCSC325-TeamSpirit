import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

/** Changes to the operating system preference apply without restarting the app. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : true);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => setReduced(media.matches);
      update(); media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => { /* Keep motion off if the preference cannot be read. */ });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}

type InteractionState = { pressed: boolean; hovered: boolean };
type MotionPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: InteractionState) => StyleProp<ViewStyle>);
  lift?: number;
};
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A small spring answers pointer intent; the hit area and accessible action stay intact. */
export function MotionPressable({ style, lift = 1.5, disabled, onHoverIn, onHoverOut, onPressIn, onPressOut, ...props }: MotionPressableProps) {
  const [hovered, setHovered] = useState(false), [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  const engagement = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const target = disabled ? 0 : pressed ? -1 : hovered ? 1 : 0;
    if (reduced) { engagement.stopAnimation(); engagement.setValue(0); return; }
    const animation = Animated.spring(engagement, { toValue: target, tension: 230, friction: 20, useNativeDriver: Platform.OS !== 'web' });
    animation.start();
    return () => animation.stop();
  }, [disabled, pressed, hovered, reduced, engagement]);
  return <AnimatedPressable {...props} disabled={disabled}
    onHoverIn={event => { setHovered(true); onHoverIn?.(event); }}
    onHoverOut={event => { setHovered(false); onHoverOut?.(event); }}
    onPressIn={event => { setPressed(true); onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); onPressOut?.(event); }}
    style={[
      typeof style === 'function' ? style({ pressed, hovered: hovered && !disabled }) : style,
      { transform: [
        { translateY: engagement.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 0, -lift] }) },
        { scale: engagement.interpolate({ inputRange: [-1, 0, 1], outputRange: [.975, 1, 1] }) },
      ] },
    ]}/>;
}
