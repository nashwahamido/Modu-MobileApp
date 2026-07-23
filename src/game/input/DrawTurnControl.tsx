import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, G, Path } from "react-native-svg";
import { looseDelta } from "@/src/game/core/geometry/staging";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { AssemblyAction } from "@/src/game/core/type";
import { TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import type { OffsetDriver } from "../scene/offsetDriver";

const DRAW_TRACK = 220; // horizontal slider length
// dial geometry (mirrors TightenControl)
const RING = 96;
const STROKE = 9;
const INK = 1.5;
const DPAD = 24;
const SIZE = RING + DPAD * 2;
const C = SIZE / 2;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const FILL = "#8D7BA8";
const LINE = "#6A548B";
const TRACK = "rgba(60,50,40,0.13)";

interface Props {
  action: AssemblyAction;
  /** Drives the fastener's offset + rotation. Shared with the other gestures (never active simultaneously). */
  sinkDriver: OffsetDriver;
}

/** Two-STEP tighten for `drawTurn` fasteners (EKET stabiliser-rod dowels): (1) DRAW OUT — a HORIZONTAL SLIDER (matching the dowel's travel) translates it from its loose (retracted-in-rod) pose out to flush in the slider; then (2) ROTATE LOCK — turn the dial to lock it home. The dial is prompt-only: the dowel stays baked at its final rotation throughout (a knurled cylinder's spin is unreadable anyway), the dial just accrues degrees. Commits the tightenFastener when the rotation completes. */
export function DrawTurnControl({ action, sinkDriver }: Props) {
  const [phase, setPhase] = useState<"draw" | "turn">("draw");
  const [drawP, setDrawP] = useState(0);
  const drawPRef = useRef(0); // authoritative live progress (state is async; the pan reads this)
  const lastX = useRef<number | null>(null);
  const lastAngle = useRef<number | null>(null);
  const lastQuarter = useRef(0);
  const deg = useGameStore((s) => s.tightenDeg[action.actionId] ?? 0);

  const applyDraw = (p: number) => {
    const store = useGameStore.getState();
    const part = action.partId ? store.furniture?.parts[action.partId] : undefined;
    if (!part) return;
    const axis = engageAxis(part, new Set(store.completed));
    const ld = looseDelta(part, axis);
    sinkDriver.set([ld[0] * (1 - p), ld[1] * (1 - p), ld[2] * (1 - p)]);
  };

  useEffect(() => {
    setPhase("draw");
    setDrawP(0);
    drawPRef.current = 0;
    lastX.current = null;
    lastAngle.current = null;
    lastQuarter.current = 0;
    applyDraw(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.actionId]);

  // ── DRAW: horizontal slider translates loose → flush, keeping the pre-rotation ──
  const drawPan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      if (lastX.current !== null) {
        const delta = (e.x - lastX.current) / DRAW_TRACK;
        if (delta !== 0) {
          const prev = drawPRef.current;
          const nd = Math.min(1, Math.max(0, prev + delta));
          drawPRef.current = nd;
          setDrawP(nd);
          applyDraw(nd);
          if (Math.floor(nd * 5) > Math.floor(prev * 5)) Haptics.selectionAsync();
          if (nd >= 1) setPhase("turn");
        }
      }
      lastX.current = e.x;
    })
    .onEnd(() => {
      lastX.current = null;
    });

  // ── TURN: prompt-only dial at flush — accrues degrees, the dowel itself doesn't move ──
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

  if (phase === "draw") {
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <GestureDetector gesture={drawPan}>
          <View style={styles.htrack}>
            <View style={[styles.hfill, { width: DRAW_TRACK * drawP }]} />
            <View style={[styles.hthumb, { left: (DRAW_TRACK - 44) * drawP }]}>
              <Text style={styles.thumbText}>⇢</Text>
            </View>
          </View>
        </GestureDetector>
        <Text style={styles.hint}>Slide to draw it out · {Math.round(drawP * 100)}%</Text>
      </View>
    );
  }

  const progress = Math.min(1, deg / TIGHTEN_TOTAL_DEG);
  const dashOffset = CIRC * (1 - progress);
  const angDeg = -90 + progress * 360;
  const ang = angDeg * (Math.PI / 180);
  const hx = C + R * Math.cos(ang);
  const hy = C + R * Math.sin(ang);
  const AW = STROKE * 1.5;
  const AL = STROKE * 1.9;
  const BACK = STROKE * 0.9;
  const head = `M ${hx} ${hy - AL} L ${hx + AW} ${hy + BACK} L ${hx - AW} ${hy + BACK} Z`;
  const headRot = angDeg + 180;

  return (
    <View style={styles.dialWrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.dial}>
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={C} cy={C} r={R} stroke={TRACK} strokeWidth={STROKE} fill="none" />
            <G transform={`rotate(-90 ${C} ${C})`}>
              <Circle cx={C} cy={C} r={R} stroke={LINE} strokeWidth={STROKE + INK * 2} fill="none" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={dashOffset} />
            </G>
            <G transform={`rotate(${headRot} ${hx} ${hy})`}>
              <Path d={head} fill={LINE} stroke={LINE} strokeWidth={INK * 2} strokeLinejoin="round" />
            </G>
            <G transform={`rotate(-90 ${C} ${C})`}>
              <Circle cx={C} cy={C} r={R} stroke={FILL} strokeWidth={STROKE} fill="none" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={dashOffset} />
            </G>
            <G transform={`rotate(${headRot} ${hx} ${hy})`}>
              <Path d={head} fill={FILL} strokeLinejoin="round" />
            </G>
          </Svg>
        </View>
      </GestureDetector>
      <Text style={styles.hint}>Turn to lock</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 60, bottom: 40, alignItems: "center", gap: 8 },
  dialWrap: { position: "absolute", right: 220, bottom: 120, alignItems: "center" },
  htrack: {
    width: DRAW_TRACK,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#8D7BA8",
    backgroundColor: "rgba(255,255,255,0.78)",
    overflow: "hidden",
    justifyContent: "center",
  },
  hfill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(141, 123, 168, 0.25)",
  },
  hthumb: {
    position: "absolute",
    top: 6,
    bottom: 6,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#8D7BA8",
    alignItems: "center",
    justifyContent: "center",
  },
  dial: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  thumbText: { fontSize: 26, color: "#fff", fontWeight: "800" },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "700" },
});
