// The two rings the drag layer draws over the canvas: the long-press pickup ring that fills at the fingertip, and the dashed set-down marker for a carried cluster. Pure presentation — they read shared values the gesture writes and never write back — so they live apart from the gesture that drives them.
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { useGameStore } from "@/src/game/core/store";

// Physical dimensions shared by the gesture maths and the stylesheet: the maths divides by them, so changing one moves the pixels AND retunes the gesture together.
export const RING = 64;
export const TARGET_RING = 92;

/** Long-press progress at the fingertip: grows and thickens as the card gives up its part, invisible until the press actually starts. */
export function PickupRing({
  x,
  y,
  progress,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value > 0.02 ? 0.9 : 0,
    transform: [
      { translateX: x.value - RING / 2 },
      { translateY: y.value - RING / 2 },
      { scale: 0.7 + 0.5 * progress.value },
    ],
    borderWidth: 3 + 5 * progress.value,
  }));
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

/** Where to set the carried cluster down: a dashed ring at the seat (park pose for a drawer), the cluster-drag counterpart of the part drag's socket ghost. Turns solid green inside snap range. Hidden once the drive gesture owns the motion. */
export function ClusterTargetRing({
  x,
  y,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
}) {
  const visible = useGameStore(
    (s) => s.combiningCluster !== null && s.driveActionId === null,
  );
  const ready = useGameStore((s) => s.fitState === "nearCorrect");
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - TARGET_RING / 2 },
      { translateY: y.value - TARGET_RING / 2 },
    ],
  }));
  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.targetRing, ready && styles.targetRingReady, style]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderColor: "#e8842c",
  },
  targetRing: {
    position: "absolute",
    top: 0,
    left: 0,
    width: TARGET_RING,
    height: TARGET_RING,
    borderRadius: TARGET_RING / 2,
    borderWidth: 3,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.9)",
  },
  targetRingReady: {
    borderStyle: "solid",
    borderColor: "#37c871",
  },
});
