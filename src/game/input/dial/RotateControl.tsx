import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { ORIENTATION_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import { AssemblyAction, Vec3 } from "@/src/game/core/type";
import { SCREW_SPIN_DEG, screwSpinInfo } from "@/src/game/core/evaluation/engagement";
import { quatFromAxisAngle, quatMultiply } from "@/src/game/core/geometry/math";
import { Dial, useDialTurn } from "@/src/game/input/dial/DialGauge";
import type { OffsetDriver } from "../../scene/offsetDriver";
import { useMirror } from "@/src/game/ui/system/handedness";

interface Props {
  action: AssemblyAction;
  /** The held part's driver — sunk toward the seat as the rotation accrues. */
  driver?: OffsetDriver;
  /** Parked back-off from the seat (engagement.screwParkOffset — non-null only  when the parked part is the joint's SPINNER). When set, the part visibly  SCREWS IN: it travels this delta to flush as you rotate. */
  sinkDelta?: Vec3 | null;
}

/** Orientation correction panel. The part is parked at the target socket; tracing the circle gives the player a second, deliberate step before the snap commits. For a threaded engagement the part is parked BACKED OFF and sinks home with the rotation — the screwing motion, same staging as a loose fastener. */
export function RotateControl({ action, driver, sinkDelta }: Props) {
  const m = useMirror();
  const deg = useGameStore((s) => s.orientationDeg[action.actionId] ?? 0);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const screwing =
    !!sinkDelta ||
    !!(furniture && action.partId && screwSpinInfo(furniture, action, new Set(completed)));
  const parked = useRef<Vec3 | null>(null);

  useEffect(() => {
    parked.current = driver ? ([...driver.value] as unknown as Vec3) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.actionId]);

  // Bidirectional, unlike the screw and tighten dials: an orientation correction counts a turn either way. Ticks every 45deg rather than every quarter turn, because the full travel here is shorter.
  const pan = useDialTurn({
    resetKey: action.actionId,
    tickDeg: 45,
    bidirectional: true,
    onTurn: (step) => {
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
          f && action.partId ? screwSpinInfo(f, action, new Set(store.completed)) : null;
        if (f && spin && spin.mover === action.partId) {
          const rad = ((SCREW_SPIN_DEG * (1 - p)) * Math.PI) / 180;
          driver.setRotation(
            quatMultiply(quatFromAxisAngle(spin.axis, rad), f.parts[action.partId]!.pose.rotation),
          );
        }
      }
      return total;
    },
  });

  return (
    <View style={m(styles.wrap)} pointerEvents="box-none">
      <Dial progress={Math.min(1, deg / ORIENTATION_TOTAL_DEG)} gesture={pan} />
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
  putBack: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  putBackText: { fontSize: 12, fontWeight: "700", color: "#8a4f3d" },
});