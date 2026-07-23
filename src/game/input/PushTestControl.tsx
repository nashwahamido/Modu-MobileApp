import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useGameStore } from "@/src/game/core/store";
import { popOpen, setTravel } from "@/src/game/scene/pushOpen";
import type { DriverRegistry } from "@/src/game/scene/offsetDriver";
import type { AssemblyAction, PushOpenSpec } from "@/src/game/core/type";

/** Track height in px — also the drag distance for a drawer's full travel, so the thumb follows the finger 1:1. */
const TRACK = 220;
const PAD_SIZE = 120;
/** Fallback push-latch ejection when the spec doesn't author popDistance. */
const DEFAULT_POP_M = 0.03;

/** One drawer's push-latch test beat, in the same control language as its neighbours: while LATCHED it is a PressControl-style pad — press it and the latch gives, the spring bounces the drawer out (haptics carry both) — then it becomes a SlideControl-style track: drag the thumb down to pull the drawer fully out, back up to push it home, and the latch clicks the step complete. The drawer's ratio groups telescope the runners throughout (carriage 1×, middle rail ½×). Each level is its own beat (spec.testActionIds); runPushOpen stays for furniture that authors the passive `beatActionId` tween instead. */
export function PushTestControl({
  action,
  spec,
  level,
  pushDrivers,
}: {
  action: AssemblyAction;
  spec: PushOpenSpec;
  level: string;
  pushDrivers: DriverRegistry;
}) {
  const [phase, setPhase] = useState<"latched" | "popped" | "pulled">("latched");
  const [travelUi, setTravelUi] = useState(0);
  const popping = useRef(false);
  const travel = useRef(0);
  // Each stroke moves the drawer FROM where the last one left it (the pop leaves it part-open) — an absolute translation→travel map would snap it on the stroke's first pixel.
  const strokeBase = useRef(0);
  const squash = useRef(new Animated.Value(1)).current;
  const pop = Math.min(spec.popDistance ?? DEFAULT_POP_M, spec.distance);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (!success || phase !== "latched" || popping.current) return;
      popping.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      squash.setValue(0.82);
      Animated.spring(squash, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 14 }).start();
      popOpen(spec, pushDrivers, level, pop, () =>
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      ).then(() => {
        travel.current = pop;
        setTravelUi(pop);
        popping.current = false;
        setPhase("popped");
      });
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      strokeBase.current = travel.current;
    })
    .onUpdate((e) => {
      if (phase === "latched" || popping.current) return;
      const d = Math.min(spec.distance, Math.max(0, strokeBase.current + (e.translationY / TRACK) * spec.distance));
      travel.current = d;
      setTravelUi(d);
      setTravel(spec, pushDrivers, level, d);
      if (phase === "popped" && d >= spec.distance - 1e-4) {
        setPhase("pulled");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    })
    .onEnd(() => {
      if (phase === "pulled" && travel.current <= 0.005) {
        setTravel(spec, pushDrivers, level, 0);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        useGameStore.getState().completeAction(action.actionId);
      }
    });

  if (phase === "latched") {
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <GestureDetector gesture={tap}>
          <Animated.View style={[styles.pad, { transform: [{ scale: squash }] }]}>
            <Text style={styles.icon}>✋</Text>
          </Animated.View>
        </GestureDetector>
        <Text style={styles.hint}>Press the drawer to pop it open</Text>
      </View>
    );
  }

  const k = Math.min(1, travelUi / spec.distance);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.track}>
          <View style={[styles.fill, { height: TRACK * k }]} />
          <View style={[styles.thumb, { top: (TRACK - 44) * k }]}>
            <Text style={styles.thumbText}>{phase === "popped" ? "⇣" : "⇡"}</Text>
          </View>
        </View>
      </GestureDetector>
      <Text style={styles.hint}>
        {phase === "popped" ? "Pull it all the way out" : "Push it home"} · {Math.round(k * 100)}%
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
    width: PAD_SIZE,
    height: PAD_SIZE,
    borderRadius: PAD_SIZE / 2,
    borderWidth: 4,
    borderColor: "#37c871",
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 44 },
  track: {
    width: 64,
    height: TRACK,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#37c871",
    backgroundColor: "rgba(255,255,255,0.78)",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(55, 200, 113, 0.25)",
  },
  thumb: {
    position: "absolute",
    left: 6,
    right: 6,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#37c871",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: { fontSize: 26, color: "#fff", fontWeight: "800" },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "600" },
});
