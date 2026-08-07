// The circular progress gauge every turn-to-drive control draws, and the turn gesture that feeds it.
//
// Four controls draw this dial: TightenControl (turn a fastener flush), ScrewControl (thread a cluster home), RotateControl (correct a part's orientation) and DrawTurnControl's second phase (lock a dowel). It used to be copy-pasted into all four, along with the arrow-head trigonometry and the clockwise-delta gesture — around 320 duplicated lines whose whole job is to look and feel identical.
//
// RotateControl's old comment said "kept local rather than shared: this is the only other control using it". That was true when there were two. It is what a fourth copy looks like from the inside.
//
// DRAW ORDER MATTERS, and it is the one thing to not casually rearrange below.
// Every shape's INK is drawn first, then every shape's FILL on top.
// That is what merges the arrow into the band: drawn shape-by-shape instead, the arrow's own outline prints a seam across the band where the two overlap. With the fills last they close over that join, and the two read as one continuous object — the arrow growing out of the band rather than sitting on it.
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import type { PanGesture } from "react-native-gesture-handler";
import Svg, { Circle, G, Path } from "react-native-svg";

import { CONTROL } from "@/src/game/ui/system/theme";

const RING = 96; // outer diameter of the band
const STROKE = 9; // the band's own width — thin, so it reads as a gauge and not a donut
const INK = 1.5; // the dark outline, kept fine so it inks the shape without thickening it
const PAD = 24; // room for the arrow head so it never clips the canvas
const R = (RING - STROKE) / 2; // radius of the band's centre line
const CIRC = 2 * Math.PI * R;

/** The gauge's full canvas, including the padding the arrow head needs. Callers size their dial to this. */
export const DIAL_SIZE = RING + PAD * 2;
/** The canvas centre, which is also the origin a turn gesture measures its angle from. */
export const DIAL_CENTRE = DIAL_SIZE / 2;

// A head wider than the band — that size difference is most of what makes it read as an arrow rather than a dot.
const AW = STROKE * 1.5; // half-width
const AL = STROKE * 1.9; // base to tip
const BACK = STROKE * 0.9; // how far the base sits BEHIND the arc's centre line, so the two shapes overlap and merge

/** The gauge, filled to `progress` (0..1). Presentation only — the caller owns the gesture and the state. */
export function DialGauge({ progress }: { progress: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const dashOffset = CIRC * (1 - p);

  // The arrow head rides the arc's leading end: −90° start, clockwise.
  const angDeg = -90 + p * 360;
  const ang = angDeg * (Math.PI / 180);
  const hx = DIAL_CENTRE + R * Math.cos(ang);
  const hy = DIAL_CENTRE + R * Math.sin(ang);
  const head = `M ${hx} ${hy - AL} L ${hx + AW} ${hy + BACK} L ${hx - AW} ${hy + BACK} Z`;
  // The apex points up before rotation, so the rotation that aligns it with the clockwise tangent is angDeg + 180.
  const headRot = angDeg + 180;

  return (
    <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
      {/* the path still to travel */}
      <Circle
        cx={DIAL_CENTRE}
        cy={DIAL_CENTRE}
        r={R}
        stroke={CONTROL.track}
        strokeWidth={STROKE}
        fill="none"
      />

      {/* ── INK LAYER: the outline of BOTH shapes ─────────────────── */}
      <G transform={`rotate(-90 ${DIAL_CENTRE} ${DIAL_CENTRE})`}>
        <Circle
          cx={DIAL_CENTRE}
          cy={DIAL_CENTRE}
          r={R}
          stroke={CONTROL.ink}
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
          fill={CONTROL.ink}
          stroke={CONTROL.ink}
          strokeWidth={INK * 2}
          strokeLinejoin="round"
        />
      </G>

      {/* ── FILL LAYER: closes over the join between them ─────────── */}
      <G transform={`rotate(-90 ${DIAL_CENTRE} ${DIAL_CENTRE})`}>
        <Circle
          cx={DIAL_CENTRE}
          cy={DIAL_CENTRE}
          r={R}
          stroke={CONTROL.fill}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dashOffset}
        />
      </G>
      <G transform={`rotate(${headRot} ${hx} ${hy})`}>
        <Path d={head} fill={CONTROL.fill} strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

/** The gauge wrapped in its own square, which is what every caller actually renders. */
export function Dial({ progress, gesture }: { progress: number; gesture: PanGesture }) {
  return (
    <GestureDetector gesture={gesture}>
      <View style={dialStyles.dial}>
        <DialGauge progress={progress} />
      </View>
    </GestureDetector>
  );
}

const dialStyles = StyleSheet.create({
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});

export interface DialTurnOptions {
  /** Changing this resets the gesture's angle memory and tick count — pass the action id. */
  resetKey: string;
  /** Degrees between haptic ticks. A quarter turn for a screw or a tighten; less for a shorter total travel. */
  tickDeg: number;
  /**
   * Whether a turn counts in EITHER direction. An orientation correction does; a screw or a tighten does
   * not, because a screw does not advance counter-clockwise.
   */
  bidirectional?: boolean;
  /** Applies the turn, and returns the new ACCUMULATED total in degrees — which is what the ticks count from. */
  onTurn: (deltaDeg: number) => number;
}

/**
 * The clockwise-drag gesture that drives the dial.
 *
 * Converts a finger position into a signed angular delta about the dial's centre, drops the jumps, and
 * fires one haptic tick per `tickDeg` of accumulated travel. What the turn DOES is entirely the caller's:
 * `onTurn` applies it and hands back the running total.
 */
/**
 * Tightening degrees per degree of FINGER travel around the dial.
 *
 * At 1 the two were the same, which meant a 720° fastener needed two complete laps of the dial with
 * one thumb — accurate to the real motion and exhausting to perform. The gain keeps the fastener
 * turning its full two turns on screen while the hand does less work.
 *
 * 2.6 overshot: a leg finished in barely a quarter of a lap, which reads as the gesture doing the
 * work rather than the player. 1.7 lands a 720° fastener at about 1.2 laps — still well under the
 * original two, but far enough that a deliberate turn is still a turn.
 */
const TURN_GAIN = 1.7;

export function useDialTurn({ resetKey, tickDeg, bidirectional, onTurn }: DialTurnOptions): PanGesture {
  const lastAngle = useRef<number | null>(null);
  const lastTick = useRef(0);

  useEffect(() => {
    lastAngle.current = null;
    lastTick.current = 0;
  }, [resetKey]);

  return Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      const a = (Math.atan2(e.y - DIAL_CENTRE, e.x - DIAL_CENTRE) * 180) / Math.PI;
      if (lastAngle.current !== null) {
        let d = a - lastAngle.current;
        // Unwrap across the ±180 seam, or crossing it reads as a near-full turn backwards.
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        const raw = bidirectional ? Math.abs(d) : d;
        // The bound is checked on RAW finger movement, before the gain: it exists to drop a finger
        // that jumped rather than dragged, and that is a fact about the touch, not about the screw.
        if (raw > 0 && raw < 120) {
          const total = onTurn(raw * TURN_GAIN);
          const tick = Math.floor(total / tickDeg);
          if (tick > lastTick.current) {
            lastTick.current = tick;
            Haptics.selectionAsync();
          }
        }
      }
      lastAngle.current = a;
    })
    .onEnd(() => {
      lastAngle.current = null;
    });
}