import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  ORIENTATION_TOTAL_DEG,
  useGameStore,
} from "@/src/adhd/core/store";
import { AssemblyAction } from "@/src/adhd/core/type";

const SIZE = 120;

interface Props {
  action: AssemblyAction;
}

/**
 * Orientation correction panel. The part is parked at the target socket; tracing
 * the circle gives the player a second, deliberate step before the snap commits.
 */
export function RotateControl({ action }: Props) {
  const deg = useGameStore((s) => s.orientationDeg[action.actionId] ?? 0);
  const lastAngle = useRef<number | null>(null);
  const lastQuarter = useRef(0);

  useEffect(() => {
    lastAngle.current = null;
    lastQuarter.current = 0;
  }, [action.actionId]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      const a = (Math.atan2(e.y - SIZE / 2, e.x - SIZE / 2) * 180) / Math.PI;
      if (lastAngle.current !== null) {
        let d = a - lastAngle.current;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        const step = Math.abs(d);
        if (step > 0 && step < 120) {
          const store = useGameStore.getState();
          store.addOrientationDeg(action.actionId, step);
          const total = store.orientationDeg[action.actionId] ?? 0;
          const q = Math.floor(total / 45);
          if (q > lastQuarter.current) {
            lastQuarter.current = q;
            Haptics.selectionAsync();
          }
        }
      }
      lastAngle.current = a;
    })
    .onEnd(() => {
      lastAngle.current = null;
    });

  const progress = Math.min(1, deg / ORIENTATION_TOTAL_DEG);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.dial}>
          <View style={[styles.fill, { height: SIZE * progress }]} />
          <Text style={[styles.arrow, { transform: [{ rotate: `${deg}deg` }] }]}>
            ↻
          </Text>
        </View>
      </GestureDetector>
      <Text style={styles.hint}>
        Rotate to align · {Math.round(progress * 100)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 160,
    bottom: 36,
    alignItems: "center",
    gap: 8,
  },
  dial: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: "#e8842c",
    backgroundColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(55, 200, 113, 0.25)",
  },
  arrow: { fontSize: 44, color: "#2e2a24" },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "700" },
});
