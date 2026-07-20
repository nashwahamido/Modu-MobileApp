import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, G, Path } from "react-native-svg";
import { looseDelta } from "@/src/game/core/geometry/staging";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { quatFromAxisAngle, quatMultiply } from "@/src/game/core/geometry/math";
import { AssemblyAction } from "@/src/game/core/type";
import { TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import type { OffsetDriver } from "../scene/offsetDriver";

const RING = 96; // outer diameter of the band
const STROKE = 9; // the band's own width — thin, so it reads as a gauge not a donut
const INK = 1.5; // the dark outline; kept fine so it inks the shape without thickening it
const PAD = 24; // room for the arrow head so it never clips the canvas
const SIZE = RING + PAD * 2;
const C = SIZE / 2;
const R = (RING - STROKE) / 2; // radius of the band's centre line
const CIRC = 2 * Math.PI * R;

const FILL = "#8D7BA8"; // the band AND the arrow head — one purple
const LINE = "#6A548B"; // the ink outline: same hue, +13pp sat, −11pp val
const TRACK = "rgba(60,50,40,0.13)"; // the unfilled path, kept faint

interface Props {
  action: AssemblyAction;
  /** Drives the fastener's loose offset toward flush as it tightens. */
  sinkDriver: OffsetDriver;
}

/**
 * Circular tighten gesture: drag clockwise; rotation accumulates with haptic ticks per
 * quarter-turn until the fastener sits flush (2 full turns).
 *
 * Drawn as an INKED band, like a sticker: every shape is filled purple and outlined in a
 * darker shade of the same hue. The outline is what gives it weight against the 3D scene —
 * a flat band alone reads as a thin UI stroke, an outlined one reads as an object.
 *
 * DRAW ORDER MATTERS. Every shape's INK is drawn first, then every shape's FILL on top.
 * That is what merges the arrow into the band: drawn shape-by-shape instead, the arrow's
 * own outline would print a seam across the band where the two overlap. With the fills
 * last, they close over that join and the two read as one continuous object — the arrow
 * growing out of the band rather than sitting on it.
 */
export function TightenControl({ action, sinkDriver }: Props) {
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);
  const lastAngle = useRef<number | null>(null);
  const lastQuarter = useRef(0);

  useEffect(() => {
    lastAngle.current = null;
    lastQuarter.current = 0;
  }, [action.actionId]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      const a = (Math.atan2(e.y - C, e.x - C) * 180) / Math.PI;
      if (lastAngle.current !== null) {
        let d = a - lastAngle.current;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        if (d > 0 && d < 120) {
          const store = useGameStore.getState();
          store.addTightenDeg(action.actionId, d);
          const total = store.tightenDeg[action.actionId] ?? 0;
          const p = Math.min(1, total / TIGHTEN_TOTAL_DEG);
          const part = action.partId
            ? useGameStore.getState().furniture?.parts[action.partId]
            : undefined;
          if (part) {
            const axis = engageAxis(part, new Set(store.completed));
            const ld = looseDelta(part, axis);
            sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
            const rad = ((TIGHTEN_TOTAL_DEG * (1 - p)) * Math.PI) / 180;
            sinkDriver.setRotation(
              quatMultiply(quatFromAxisAngle(axis, rad), part.pose.rotation),
            );
          }
          const q = Math.floor(total / 90);
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

  const progress = Math.min(1, deg / TIGHTEN_TOTAL_DEG);
  const dashOffset = CIRC * (1 - progress);

  // The arrow head rides the arc's leading end: −90° start, clockwise.
  const angDeg = -90 + progress * 360;
  const ang = angDeg * (Math.PI / 180);
  const hx = C + R * Math.cos(ang);
  const hy = C + R * Math.sin(ang);

  // A head wider than the band — that size difference is most of what makes it read as an
  // arrow rather than a dot. BACK pushes the base BEHIND the band's leading edge so the two
  // shapes overlap and merge. Apex points up before rotation, so the rotation that aligns it
  // with the clockwise tangent is angDeg + 180.
  const AW = STROKE * 1.5; // half-width
  const AL = STROKE * 1.9; // base to tip
  const BACK = STROKE * 0.9; // how far the base sits behind the arc's centre line
  const head = `M ${hx} ${hy - AL} L ${hx + AW} ${hy + BACK} L ${hx - AW} ${hy + BACK} Z`;
  const headRot = angDeg + 180;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.dial}>
          <Svg width={SIZE} height={SIZE}>
            {/* the path still to travel */}
            <Circle cx={C} cy={C} r={R} stroke={TRACK} strokeWidth={STROKE} fill="none" />

            {/* ── INK LAYER: the outline of BOTH shapes ─────────────────── */}
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

            {/* ── FILL LAYER: closes over the join between them ─────────── */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 220,
    bottom: 120,
    alignItems: "center",
  },
  dial: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});