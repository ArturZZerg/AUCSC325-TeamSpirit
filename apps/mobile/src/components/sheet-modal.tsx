import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, type ModalProps } from 'react-native';

/**
 * Follows the system setting for less motion (iOS Reduce Motion, Android
 * Remove animations), including changes made while the app is open.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { if (live) setReduced(value); });
    return () => { live = false; subscription.remove(); };
  }, []);
  return reduced;
}

/** A Modal whose slide-in becomes an instant change when the student asked for less motion. Fades are kept. */
export function SheetModal({ animationType, ...props }: ModalProps) {
  const reduced = useReduceMotion();
  return <Modal {...props} animationType={reduced && animationType === 'slide' ? 'none' : animationType}/>;
}
