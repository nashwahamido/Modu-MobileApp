import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { looseDelta } from "@/src/game/core/geometry/staging";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { AssemblyAction } from "@/src/game/core/type";
import { MALLET_TAPS, TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import type { OffsetDriver } from "../scene/offsetDriver";

const SIZE = 120;

interface Props {
  action: AssemblyAction;
  /** Drives the part's loose offset toward flush as it's tapped in. */
  sinkDriver: OffsetDriver;
}

/** Strike control: tap the target repeatedly; each hit drives the part one step toward flush (heavy haptic per hit). Counterpart of TightenControl's circular gesture for struck fasteners — reached via tool "mallet" OR motion "strike", so a bare-hand tap-in (BEKVÄM's wood dowel) lands here too and shows a hand instead of the mallet. Motion "press" is the ONE-shot variant: a single press seats it (EKET's rear cam locks + pins, already resting flush via insertProud 0). */
export function TapControl({ action, sinkDriver }: Props) {
  const struck = action.tool === "mallet" || action.tool === "hammer";
  const single = action.motion === "press";
  const taps = single ? 1 : MALLET_TAPS;
  const degPerTap = TIGHTEN_TOTAL_DEG / taps;
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);
  const squash = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    squash.setValue(1);
  }, [action.actionId, squash]);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      const store = useGameStore.getState();
      store.addTightenDeg(action.actionId, degPerTap);
      const total = store.tightenDeg[action.actionId] ?? 0;
      const p = Math.min(1, total / TIGHTEN_TOTAL_DEG);
      const part = action.partId ? store.furniture?.parts[action.partId] : undefined;
      if (part) {
        // signed axis, not baked engageDir — in the reverse path (later endpoint placed first) the fastener sinks in from the opposite side
        const ld = looseDelta(part, engageAxis(part, new Set(store.completed)));
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

  const hits = Math.min(taps, Math.round(deg / degPerTap));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={tap}>
        <Animated.View
          style={[styles.target, { transform: [{ scale: squash }] }]}
        >
          <Text style={styles.icon}>{struck ? "🔨" : "✋"}</Text>
        </Animated.View>
      </GestureDetector>
      <Text style={styles.hint}>
        {single ? "Press it home" : `Tap to drive it in · ${hits}/${taps}`}
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
