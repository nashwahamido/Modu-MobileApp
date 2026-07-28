import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { looseDelta, stageDelta } from "@/src/game/core/geometry/staging";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { stageShiftFor } from "@/src/game/core/model/staging";
import { AssemblyAction } from "@/src/game/core/type";
import { MALLET_TAPS, TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import type { OffsetDriver } from "../scene/offsetDriver";

const SIZE = 120;
const DEG_PER_TAP = TIGHTEN_TOTAL_DEG / MALLET_TAPS;

interface Props {
  action: AssemblyAction;
  /** Drives the fastener's offset from STAGE toward LOOSE as it is pressed in. Shared with the tighten (they are never active at the same time). */
  sinkDriver: OffsetDriver;
}

/** Insert-press control for 3-phase fasteners (part.insertStage set): tap the pad to PRESS the fastener from its STAGE pose (fully outside the hole) into the LOOSE pose (partly in). Sibling of TapControl — that drives loose→flush on the tighten; this drives stage→loose on the insert. Each tap eases the sink offset from stage to loose; at full taps `addTightenDeg` commits the insertFastener. The carrier's staging offset is folded in so a dowel pressed into a still-staged rod stays with the rod. */
export function InsertPressControl({ action, sinkDriver }: Props) {
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);
  const squash = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

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
      const part = action.partId ? store.furniture?.parts[action.partId] : undefined;
      const parts = store.furniture?.parts;
      if (part && parts) {
        const carrier = stageShiftFor(part, parts) ?? [0, 0, 0];
        const s = stageDelta(part);
        // signed axis for parity with TapControl/TightenControl; retract dowels ignore it by design (looseDelta uses their baked engageDir)
        const l = looseDelta(part, engageAxis(part, new Set(store.completed)));
        // lerp stage → loose, plus the carrier's staging offset (the rod is still out during the press)
        sinkDriver.set([
          carrier[0] + s[0] * (1 - p) + l[0] * p,
          carrier[1] + s[1] * (1 - p) + l[1] * p,
          carrier[2] + s[2] * (1 - p) + l[2] * p,
        ]);
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

  const presses = Math.min(MALLET_TAPS, Math.round(deg / DEG_PER_TAP));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) },
            ],
          },
        ]}
      />
      <GestureDetector gesture={tap}>
        <Animated.View style={[styles.pad, { transform: [{ scale: squash }] }]}>
          <Text style={styles.icon}>✋</Text>
        </Animated.View>
      </GestureDetector>
      <Text style={styles.hint}>
        Press to fit it in · {presses}/{MALLET_TAPS}
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
  pad: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: "#8D7BA8",
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: "#8D7BA8",
  },
  icon: { fontSize: 44 },
  hint: { fontSize: 12, color: "#FBF8F3", fontWeight: "700" },
});