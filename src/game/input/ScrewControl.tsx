import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, G, Path } from "react-native-svg";
import { useGameStore } from "@/src/game/core/store";
import { AssemblyAction } from "@/src/game/core/type";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import type { ClusterDriver } from "../scene/offsetDriver";

/** Dial degrees for the full drive — 720 = two turns, so the parked cluster's pre-spin orientation is visually identical to its baked one (2 whole revolutions) and the drive can start without an orientation pop. */
const SCREW_TOTAL_DEG = 720;

// The same gauge TightenControl and RotateControl draw. Kept local like theirs: sharing it would mean touching files that are working.
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
  /** The combining cluster's shared driver — spun about the travel axis and sunk toward the seat as the rotation accrues. */
  driver: ClusterDriver;
  /** Park staging (clusterParkInfo): the backed-off offset the cluster starts from and the travel axis it screws along. */
  park: ParkInfo;
}

/** Screw drive for a threaded cluster combine (DALFRED's seat threading onto its base): the parked cluster is spun home with the same clockwise dial as a fastener tighten — each degree of dial travel sinks it along the park axis while the WHOLE cluster turns about that axis, and at two full turns the placement commits through the store's normal drive completion. */
export function ScrewControl({ action, driver, park }: Props) {
  const progress = useGameStore((s) => s.driveProgress[action.actionId] ?? 0);
  const lastAngle = useRef<number | null>(null);
  const lastQuarter = useRef(0);

  useEffect(() => {
    lastAngle.current = null;
    lastQuarter.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.actionId]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      const a = (Math.atan2(e.y - C, e.x - C) * 180) / Math.PI;
      if (lastAngle.current !== null) {
        let d = a - lastAngle.current;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        // clockwise only, like a tighten — a screw does not advance counter-clockwise
        if (d > 0 && d < 120) {
          const store = useGameStore.getState();
          const before = store.driveProgress[action.actionId] ?? 0;
          store.advanceDrive(action.actionId, d / SCREW_TOTAL_DEG);
          const p = Math.min(1, before + d / SCREW_TOTAL_DEG);
          // remaining spin unwinds to exactly 0 at flush, so the seated pose is bit-identical to baked; flip the sign here if the on-device turn direction reads wrong
          const rad = ((SCREW_TOTAL_DEG * (1 - p)) * Math.PI) / 180;
          driver.setSpin(
            [park.offset[0] * (1 - p), park.offset[1] * (1 - p), park.offset[2] * (1 - p)],
            park.axis,
            rad,
          );
          const q = Math.floor((p * SCREW_TOTAL_DEG) / 90);
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

            {/* INK layer for BOTH shapes, then FILL for both — fills drawn last close over the arrow/band join so they read as one object (see TightenControl). */}
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
      <Text style={styles.hint}>Screw it in · {Math.round(progress * 100)}%</Text>
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
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "700" },
});
