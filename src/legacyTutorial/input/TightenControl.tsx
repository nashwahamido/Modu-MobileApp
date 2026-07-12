import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { TIGHTEN_TOTAL_DEG, useGameStore } from '../game/store';
import { looseDelta } from '../game/staging';
import type { AssemblyAction } from '../game/assembly';
import type { OffsetDriver } from '../scene/offsetDriver';
import { TutorialTarget } from '../tutorial/TutorialTarget';
import { useTutorialStore } from '../tutorial/store';

const SIZE = 120;

interface Props {
  action: AssemblyAction;
  /** Drives the fastener's loose offset toward flush as it tightens. */
  sinkDriver: OffsetDriver;
}

/**
 * Circular tighten gesture (user-designed): trace the rotate sign clockwise;
 * rotation accumulates with haptic ticks per quarter-turn until the fastener
 * sits flush (2 full turns).
 */
export function TightenControl({ action, sinkDriver }: Props) {
  const deg = useGameStore((s) => s.tightenDeg[action.id] ?? 0);
  const lastAngle = useRef<number | null>(null);
  const lastQuarter = useRef(0);

  useEffect(() => {
    lastAngle.current = null;
    lastQuarter.current = 0;
  }, [action.id]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      const a = (Math.atan2(e.y - SIZE / 2, e.x - SIZE / 2) * 180) / Math.PI;
      if (lastAngle.current !== null) {
        let d = a - lastAngle.current;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        if (d > 0 && d < 120) {
          const store = useGameStore.getState();
          store.addTightenDeg(action.id, d);
          const total = store.tightenDeg[action.id] ?? 0;
          const p = Math.min(1, total / TIGHTEN_TOTAL_DEG);
          if (action.partId) {
            const ld = looseDelta(action.partId);
            sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
          }
          const q = Math.floor(total / 90);
          if (q > lastQuarter.current) {
            lastQuarter.current = q;
            Haptics.selectionAsync();
          }
          if (total >= TIGHTEN_TOTAL_DEG) useTutorialStore.getState().completeEvent('tool_used');
        }
      }
      lastAngle.current = a;
    })
    .onEnd(() => {
      lastAngle.current = null;
    });

  const progress = Math.min(1, deg / TIGHTEN_TOTAL_DEG);

  return (
    <TutorialTarget id="tool" style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.dial} collapsable={false}>
          <View style={[styles.fill, { height: SIZE * progress }]} />
          <Text style={[styles.arrow, { transform: [{ rotate: `${deg}deg` }] }]}>↻</Text>
        </View>
      </GestureDetector>
      <Text style={styles.hint}>Trace the circle to tighten · {Math.round(progress * 100)}%</Text>
    </TutorialTarget>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 160, bottom: 36, alignItems: 'center', gap: 8 },
  dial: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: '#e8842c',
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(55, 200, 113, 0.25)',
  },
  arrow: { fontSize: 44, color: '#2e2a24' },
  hint: { fontSize: 12, color: '#6b6257', fontWeight: '600' },
});
