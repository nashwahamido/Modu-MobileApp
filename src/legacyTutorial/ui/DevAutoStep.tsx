import { Pressable, StyleSheet, Text } from 'react-native';
import { TIGHTEN_TOTAL_DEG, useGameStore } from '../game/store';
import { PARTS } from '../game/parts';
import { targetPositionForAction } from '../game/targets';
import { HOVER_LIFT_M, looseDelta, spawnDelta } from '../game/staging';
import { animateDriver, OffsetDriver } from '../scene/offsetDriver';

interface Props {
  heldDriver: OffsetDriver;
  sinkDriver: OffsetDriver;
}

/**
 * DEV-only: performs the next assembly action through the real store/scene
 * pipeline (pickup → glide → snap, or tighten, or beat). Lets the whole game
 * be stepped through on an emulator where touch-gesture injection is flaky;
 * also doubles as a demo mode.
 */
export function DevAutoStep({ heldDriver, sinkDriver }: Props) {
  const phase = useGameStore((s) => s.phase);

  const step = () => {
    const store = useGameStore.getState();
    if (store.phase !== 'idle') return;
    const action = store.available()[0];
    if (!action) return;

    if ((action.type === 'snapPart' || action.type === 'insertFastener') && action.partId) {
      const part = PARTS[action.partId];
      const target = targetPositionForAction(action);
      const planeY = target[1] + HOVER_LIFT_M;
      const base = spawnDelta(action.partId, planeY);
      heldDriver.set(base);
      store.beginPickup(action.id);
      const dest: [number, number, number] = [
        target[0] - part.pose.position[0],
        target[1] - part.pose.position[1],
        target[2] - part.pose.position[2],
      ];
      setTimeout(() => {
        useGameStore.getState().setFitState('nearCorrect');
        animateDriver(heldDriver, dest, 600, () => {
          useGameStore.getState().releaseHeld();
        });
      }, 350);
    } else if (action.type === 'tightenFastener') {
      let applied = 0;
      const tick = setInterval(() => {
        applied += 80;
        useGameStore.getState().addTightenDeg(action.id, 80);
        if (action.partId) {
          const ld = looseDelta(action.partId);
          const p = Math.min(1, applied / TIGHTEN_TOTAL_DEG);
          sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
        }
        if (applied >= TIGHTEN_TOTAL_DEG) clearInterval(tick);
      }, 60);
    } else {
      store.completeAction(action.id);
    }
  };

  if (!__DEV__) return null;
  return (
    <Pressable style={[styles.btn, phase !== 'idle' && styles.btnBusy]} onPress={step}>
      <Text style={styles.text}>▶ auto</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(60,50,40,0.65)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 14,
  },
  btnBusy: { opacity: 0.4 },
  text: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
