import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text } from 'react-native';
import { Button, Card, colors } from '@/components/ui';

const durationSeconds = 60;
type Pause = { status: 'idle' | 'running' | 'finished'; seconds: number };

export function useBreathingPause() {
  const deadline = useRef<number | null>(null);
  const [pause, setPause] = useState<Pause>({ status: 'idle', seconds: durationSeconds });
  const start = () => {
    if (deadline.current !== null) return;
    deadline.current = Date.now() + durationSeconds * 1000;
    setPause({ status: 'running', seconds: durationSeconds });
  };
  const cancel = () => {
    deadline.current = null;
    setPause({ status: 'idle', seconds: durationSeconds });
  };

  useEffect(() => {
    if (pause.status !== 'running') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    const clear = () => { clearTimeout(timer); timer = undefined; };
    const tick = () => {
      clear();
      if (deadline.current === null) return;
      // Recalculate after delayed callbacks or app suspension instead of
      // extending the minute by counting how many callbacks were delivered.
      const remaining = deadline.current - Date.now();
      const seconds = Math.min(durationSeconds, Math.max(0, Math.ceil(remaining / 1000)));
      if (seconds === 0) {
        deadline.current = null;
        setPause({ status: 'finished', seconds: 0 });
        return;
      }
      setPause(previous => previous.seconds === seconds ? previous : { status: 'running', seconds });
      if (active) timer = setTimeout(tick, Math.min(1000, remaining));
    };
    const subscription = AppState.addEventListener('change', state => {
      active = state === 'active';
      if (active) tick(); else clear();
    });
    tick();
    return () => { clear(); subscription.remove(); };
  }, [pause.status]);

  return { ...pause, start, cancel };
}

export function BreathingPause() {
  const pause = useBreathingPause();
  return <Card><Text style={styles.title}>One minute to breathe</Text>
    <Text style={styles.meta}>{pause.status === 'running' ? `${pause.seconds}s remaining` : pause.status === 'finished' ? 'Your one-minute pause is complete.' : 'Start a simple, optional breathing pause.'}</Text>
    {pause.status === 'running' && <Text style={styles.meta}>Breathe at a comfortable pace.</Text>}
    <Button title={pause.status === 'running' ? 'Cancel pause' : pause.status === 'finished' ? 'Start another minute' : 'Start 60 seconds'} tone="plain"
      onPress={pause.status === 'running' ? pause.cancel : pause.start}/>
  </Card>;
}
const styles = StyleSheet.create({ title: { fontSize: 18, fontWeight: '800', color: colors.ink }, meta: { color: colors.muted } });
