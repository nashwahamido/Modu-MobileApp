import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { PRESS_TAPS, useGameStore } from "@/src/game/core/store";
import { AssemblyAction, Vec3 } from "@/src/game/core/type";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import type { OffsetDriver } from "../scene/offsetDriver";

const SIZE = 120;

interface Props {
  action: AssemblyAction;
  /** The held part's driver — pushed from its parked offset toward the seat one  press at a time. */
  driver?: OffsetDriver;
  /** Press staging (engagement.pressParkInfo): the backed-off offset the part  parks at; each press eases it toward [0,0,0]. */
  park?: ParkInfo | null;
}

/** Press control: tap the pad repeatedly to DRIVE a fastener-free push-fit part home — each tap shoves it one step along its push axis. TOOL-AWARE, like the tighten split (TapControl vs TightenControl): a press whose part carries a striking tool (DALFRED's pole is malleted onto the seat plate — place_pole inherits tool "mallet") shows the mallet and reads as a strike; a screwdriver press reads as driving it in (no current user — kept as generic tool-awareness); a tool-less press is a bare-hand push. Structural cousin of TapControl (which tightens a fastener; this seats a structural part). Progress is normalized 0..1 (store.advanceDrive, 1/PRESS_TAPS per tap); at 1 the placement commits. */
export function PressControl({ action, driver, park }: Props) {
  const progress = useGameStore((s) => s.driveProgress[action.actionId] ?? 0);
  const struck = action.tool === "mallet" || action.tool === "hammer";
  const driven = action.tool === "screwdriver";
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
  const parked = useRef<Vec3 | null>(null);

  useEffect(() => {
    squash.setValue(1);
    parked.current = driver ? ([...driver.value] as unknown as Vec3) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.actionId]);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      const store = useGameStore.getState();
      const before = store.driveProgress[action.actionId] ?? 0;
      store.advanceDrive(action.actionId, 1 / PRESS_TAPS);
      const after = Math.min(1, before + 1 / PRESS_TAPS);
      const p0 = parked.current;
      if (driver && park && p0) {
        driver.set([
          park.offset[0] * (1 - after),
          park.offset[1] * (1 - after),
          park.offset[2] * (1 - after),
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

  const presses = Math.min(PRESS_TAPS, Math.round(progress * PRESS_TAPS));

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
          <Text style={styles.icon}>{struck ? "🔨" : driven ? "🪛" : "✋"}</Text>
        </Animated.View>
      </GestureDetector>
      <Text style={styles.hint}>
        {struck ? "Tap to drive it in" : driven ? "Tap to screw it in" : "Press to fit it in"} · {presses}/
        {PRESS_TAPS}
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