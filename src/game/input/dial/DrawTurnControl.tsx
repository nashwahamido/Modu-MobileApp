import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { looseDelta } from "@/src/game/core/geometry/staging";
import { engageAxis } from "@/src/game/core/evaluation/engagement";
import { AssemblyAction } from "@/src/game/core/type";
import { TIGHTEN_TOTAL_DEG, useGameStore } from "@/src/game/core/store";
import { CONTROL, useTheme } from "@/src/game/ui/system/theme";
import { Dial, useDialTurn } from "@/src/game/input/dial/DialGauge";
import type { OffsetDriver } from "../../scene/offsetDriver";

const DRAW_TRACK = 220; // horizontal slider length

interface Props {
  action: AssemblyAction;
  /** Drives the fastener's offset + rotation. Shared with the other gestures (never active simultaneously). */
  sinkDriver: OffsetDriver;
}

/** Two-STEP tighten for `drawTurn` fasteners (EKET stabiliser-rod dowels): (1) DRAW OUT — a HORIZONTAL SLIDER (matching the dowel's travel) translates it from its loose (retracted-in-rod) pose out to flush in the slider; then (2) ROTATE LOCK — turn the dial to lock it home. The dial is prompt-only: the dowel stays baked at its final rotation throughout (a knurled cylinder's spin is unreadable anyway), the dial just accrues degrees. Commits the tightenFastener when the rotation completes. */
export function DrawTurnControl({ action, sinkDriver }: Props) {
  const t = useTheme();
  const [phase, setPhase] = useState<"draw" | "turn">("draw");
  const [drawP, setDrawP] = useState(0);
  const drawPRef = useRef(0); // authoritative live progress (state is async; the pan reads this)
  const lastX = useRef<number | null>(null);
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
  const pan = useDialTurn({
    resetKey: action.actionId,
    tickDeg: 90,
    onTurn: (d) => {
      const store = useGameStore.getState();
      store.addTightenDeg(action.actionId, d);
      return store.tightenDeg[action.actionId] ?? 0;
    },
  });

  if (phase === "draw") {
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        {/* ABOVE the track, not under it — the same fix SlideControl and SeatSlideControl already
            carry, for the same reason. Below, this landed on the bottom HUD row and ran under the
            auto button and the Focus chip: grey text on a busy background, most of it unreadable.
            Styled as ToolBar's "Pick a Tool" prompt: the same lavender pill, which is the app's one
            "here is what to do" label. That stops it being a caption on the control and makes it an
            instruction, and it carries its own background so nothing behind it can swallow it.
            pointerEvents none regardless: a Text child of a box-none wrapper still takes touches. */}
        <Text
          style={[styles.prompt, { color: t.onAccent, backgroundColor: t.accent }]}
          pointerEvents="none"
        >
          Slide to draw it out · {Math.round(drawP * 100)}%
        </Text>
        <GestureDetector gesture={drawPan}>
          <View style={styles.htrack}>
            <View style={[styles.hfill, { width: DRAW_TRACK * drawP }]} />
            <View style={[styles.hthumb, { left: (DRAW_TRACK - 44) * drawP }]}>
              <Text style={styles.thumbText}>⇢</Text>
            </View>
          </View>
        </GestureDetector>
      </View>
    );
  }

  return (
    <View style={styles.dialWrap} pointerEvents="box-none">
      <Dial progress={Math.min(1, deg / TIGHTEN_TOTAL_DEG)} gesture={pan} />
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
    borderColor: CONTROL.fill,
    backgroundColor: "rgba(255,255,255,0.78)",
    overflow: "hidden",
    justifyContent: "center",
  },
  hfill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: CONTROL.fillSoft,
  },
  hthumb: {
    position: "absolute",
    top: 6,
    bottom: 6,
    width: 44,
    borderRadius: 22,
    backgroundColor: CONTROL.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: { fontSize: 26, color: "#fff", fontWeight: "800" },
  // The turn phase's label, still a plain caption: it sits above the bottom HUD row rather than in
  // it, so it has nothing to fight with and nothing to be swallowed by.
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "700" },
  // ToolBar's `prompt`, to the number: 12/800, pill radius, 12x3 padding. Colours come from the
  // theme at the call site rather than being frozen here, so it follows a theme change the way the
  // toolbar's own does. `overflow: hidden` is what makes the radius clip the background on Android.
  prompt: {
    fontSize: 12,
    fontWeight: "800",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 3,
    overflow: "hidden",
  },
});