import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  ORIENTATION_TOTAL_DEG,
  useGameStore,
} from "@/src/game/core/store";
import { AssemblyAction, Vec3 } from "@/src/game/core/type";
import {
  SCREW_SPIN_DEG,
  screwSpinInfo,
} from "@/src/game/core/evaluation/engagement";
import { quatFromAxisAngle, quatMultiply } from "@/src/game/core/geometry/math";
import type { OffsetDriver } from "../scene/offsetDriver";

const SIZE = 120;

interface Props {
  action: AssemblyAction;
  /** The held part's driver — sunk toward the seat as the rotation accrues. */
  driver?: OffsetDriver;
  /** Parked back-off from the seat (engagement.screwParkOffset — non-null only  when the parked part is the joint's SPINNER). When set, the part visibly  SCREWS IN: it travels this delta to flush as you rotate. */
  sinkDelta?: Vec3 | null;
}

/** Orientation correction panel. The part is parked at the target socket; tracing the circle gives the player a second, deliberate step before the snap commits. For a threaded engagement the part is parked BACKED OFF and sinks home with the rotation — the screwing motion, same staging as a loose fastener. */
export function RotateControl({ action, driver, sinkDelta }: Props) {
  const deg = useGameStore((s) => s.orientationDeg[action.actionId] ?? 0);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const screwing =
    !!sinkDelta ||
    !!(
      furniture &&
      action.partId &&
      screwSpinInfo(furniture, action, new Set(completed))
    );
  const lastAngle = useRef<number | null>(null);
  const lastQuarter = useRef(0);
  const parked = useRef<Vec3 | null>(null);

  useEffect(() => {
    lastAngle.current = null;
    lastQuarter.current = 0;
    parked.current = driver ? [...driver.value] as unknown as Vec3 : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const p0 = parked.current;
          if (driver && sinkDelta && p0) {
            const p = Math.min(1, total / ORIENTATION_TOTAL_DEG);
            driver.set([
              p0[0] - sinkDelta[0] * p,
              p0[1] - sinkDelta[1] * p,
              p0[2] - sinkDelta[2] * p,
            ]);
            const f = store.furniture;
            const spin =
              f && action.partId
                ? screwSpinInfo(f, action, new Set(store.completed))
                : null;
            if (f && spin && spin.mover === action.partId) {
              const rad = ((SCREW_SPIN_DEG * (1 - p)) * Math.PI) / 180;
              driver.setRotation(
                quatMultiply(
                  quatFromAxisAngle(spin.axis, rad),
                  f.parts[action.partId]!.pose.rotation,
                ),
              );
            }
          }
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
        <View style={[styles.dial, screwing && styles.dialScrew]}>
          <View style={[styles.fill, { height: SIZE * progress }]} />
          <Text style={[styles.arrow, { transform: [{ rotate: `${deg}deg` }] }]}>
            ↻
          </Text>
        </View>
      </GestureDetector>
      <Text style={styles.hint}>
        {screwing ? "Screw it in" : "Rotate to align"} ·{" "}
        {Math.round(progress * 100)}%
      </Text>
      {screwing ? null : (
        <Pressable
          style={styles.putBack}
          hitSlop={8}
          onPress={() => useGameStore.getState().cancelHeld()}
        >
          <Text style={styles.putBackText}>✕ put back</Text>
        </Pressable>
      )}
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
  dialScrew: { borderColor: "#37c871" },
  fill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(55, 200, 113, 0.25)",
  },
  arrow: { fontSize: 44, color: "#2e2a24" },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "700" },
  putBack: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  putBackText: { fontSize: 12, fontWeight: "700", color: "#8a4f3d" },
});
