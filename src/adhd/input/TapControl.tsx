import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { looseDelta } from "@/src/adhd/core/geometry/staging";
import { AssemblyAction } from "@/src/adhd/core/type";
import { MALLET_TAPS, TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/adhd/core/store";
import type { OffsetDriver } from "../scene/offsetDriver";

const SIZE = 120;
const DEG_PER_TAP = TIGHTEN_TOTAL_DEG / MALLET_TAPS;

interface Props {
  action: AssemblyAction;
  /** Drives the part's loose offset toward flush as it's tapped in. */
  sinkDriver: OffsetDriver;
}

/**
 * Mallet control: tap the target repeatedly; each hit drives the part one
 * step toward flush (heavy haptic per hit). Counterpart of TightenControl's
 * circular gesture for hand-tool fasteners.
 */
export function TapControl({ action, sinkDriver }: Props) {
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);
  const squash = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    squash.setValue(1);
  }, [action.actionId, squash]);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      const store = useGameStore.getState();
      store.addTightenDeg(action.actionId, DEG_PER_TAP);
      const total = store.tightenDeg[action.actionId] ?? 0;
      const p = Math.min(1, total / TIGHTEN_TOTAL_DEG);
      const part = action.partId ? useGameStore.getState().furniture?.parts[action.partId] : undefined;
      if (part) {
        const ld = looseDelta(part);
        sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      squash.setValue(0.82);
      Animated.spring(squash, {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
        bounciness: 14,
      }).start();
    });

  const hits = Math.min(MALLET_TAPS, Math.round(deg / DEG_PER_TAP));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={tap}>
        <Animated.View
          style={[styles.target, { transform: [{ scale: squash }] }]}
        >
          <Text style={styles.icon}>🔨</Text>
        </Animated.View>
      </GestureDetector>
      <Text style={styles.hint}>
        Tap to drive it in · {hits}/{MALLET_TAPS}
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
  target: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: "#e8842c",
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 44 },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "600" },
});
