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

const RING = 92; // outer diameter of the ring (smaller than before)
const STROKE = 13;
const PAD = 16; // breathing room so the arrow never clips the canvas edge
const SIZE = RING + PAD * 2; // the actual SVG / view box
const C = SIZE / 2; // centre of everything
const R = (RING - STROKE) / 2; // radius of the stroke's centre line
const CIRC = 2 * Math.PI * R;

const TRACK = "rgba(60,50,40,0.16)";
const FILL = "#8D7BA8"; // the progress arc — interactive lavender
const CENTER = "#F5EADD"; // solid cream hub (matches the joystick dial)
const CENTER_EDGE = "rgba(60,50,40,0.22)";
const ARROW = "#8D7BA8";      // lavender, matches the arc
const ARROW_EDGE = "#ffffff"; // white rim so it reads on the cream hub

interface Props {
  action: AssemblyAction;
  /** Drives the fastener's loose offset toward flush as it tightens. */
  sinkDriver: OffsetDriver;
}

/**
 * Circular tighten gesture: drag clockwise around the ring; rotation accumulates with
 * haptic ticks per quarter-turn until the fastener sits flush (2 full turns).
 *
 * A track ring, a lavender arc growing clockwise from the top, and an ARROW head riding the
 * arc's leading end that points the way to drag. The canvas is padded past the ring so the
 * arrow never clips. The hub is solid cream — no transparent centre.
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

  // Arrow head at the arc's leading end: −90° start, clockwise.
  const angDeg = -90 + progress * 360;
  const ang = angDeg * (Math.PI / 180);
  const hx = C + R * Math.cos(ang);
  const hy = C + R * Math.sin(ang);
  // A small triangle, rotated to point ALONG the ring (tangent = angle + 90°).
  const s = 9; // arrow half-size
  const tan = angDeg + 180; // apex points ALONG the ring (clockwise), not outward

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.dial}>
          <Svg width={SIZE} height={SIZE}>
            {/* solid hub */}
            <Circle cx={C} cy={C} r={R - STROKE / 2} fill={CENTER} stroke={CENTER_EDGE} strokeWidth={1} />
            {/* track */}
            <Circle cx={C} cy={C} r={R} stroke={TRACK} strokeWidth={STROKE} fill="none" />
            {/* progress arc — 12 o'clock, clockwise */}
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
                strokeDashoffset={CIRC * (1 - progress)}
              />
            </G>
            {/* arrow head riding the arc's end, pointing the drag direction */}
            <G transform={`rotate(${tan} ${hx} ${hy})`}>
              <Path
                d={`M ${hx} ${hy - s} L ${hx + s} ${hy + s} L ${hx - s} ${hy + s} Z`}
                fill={ARROW}
                stroke={ARROW_EDGE}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
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
    // No `elevation` — on Android that casts a big grey halo around a circular View. The
    // ring's own outline (drawn in SVG below via the hub/track) is enough to separate it
    // from the scene; a faint iOS shadow is kept for depth without the blob.
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});