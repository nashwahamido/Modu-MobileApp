import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, G, Path } from "react-native-svg";
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

// The same gauge TightenControl draws. Kept local rather than shared: this is the only
// other control using it, and a shared module would mean touching files that are working.
const RING = 96; // outer diameter of the band
const STROKE = 9; // the band's own width — a gauge, not a donut
const INK = 1.5; // fine enough to ink the shape without thickening it
const PAD = 24; // room for the arrow head so it never clips the canvas
const SIZE = RING + PAD * 2;
const C = SIZE / 2;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

const FILL = "#8D7BA8"; // the band AND the arrow head — one purple
const LINE = "#6A548B"; // the ink outline: same hue, +13pp sat, −11pp val
const TRACK = "rgba(60,50,40,0.13)"; // the path still to travel

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
  const dashOffset = CIRC * (1 - progress);

  // The arrow head rides the arc's leading end: −90° start, clockwise.
  const angDeg = -90 + progress * 360;
  const ang = angDeg * (Math.PI / 180);
  const hx = C + R * Math.cos(ang);
  const hy = C + R * Math.sin(ang);
  const AW = STROKE * 1.5;
  const AL = STROKE * 1.9;
  const BACK = STROKE * 0.9; // base sits behind the band's edge so the fill merges them
  const head = `M ${hx} ${hy - AL} L ${hx + AW} ${hy + BACK} L ${hx - AW} ${hy + BACK} Z`;
  const headRot = angDeg + 180;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.dial}>
          <Svg width={SIZE} height={SIZE}>
            {/* the path still to travel */}
            <Circle cx={C} cy={C} r={R} stroke={TRACK} strokeWidth={STROKE} fill="none" />

            {/* INK layer for BOTH shapes, then FILL for both. Drawn shape-by-shape the
                arrow's outline prints a seam across the band; with the fills last they
                close over the join and read as one object. */}
            <G transform={`rotate(-90 ${C} ${C})`}>
              <Circle
                cx={C}
                cy={C}
                r={R}
                stroke={LINE}
                strokeWidth={STROKE + INK * 2}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
              />
            </G>
            <G transform={`rotate(${headRot} ${hx} ${hy})`}>
              <Path
                d={head}
                fill={LINE}
                stroke={LINE}
                strokeWidth={INK * 2}
                strokeLinejoin="round"
              />
            </G>

            <G transform={`rotate(-90 ${C} ${C})`}>
              <Circle
                cx={C}
                cy={C}
                r={R}
                stroke={FILL}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
              />
            </G>
            <G transform={`rotate(${headRot} ${hx} ${hy})`}>
              <Path d={head} fill={FILL} strokeLinejoin="round" />
            </G>
          </Svg>
        </View>
      </GestureDetector>
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
  dial: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
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