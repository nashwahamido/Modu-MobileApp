import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useGameStore } from "@/src/game/core/store";
import { AssemblyAction, Vec3 } from "@/src/game/core/type";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import type { OffsetSink } from "../scene/combineDriver";

const TRACK = 220;

interface Props {
  action: AssemblyAction;
  /** Whatever is being driven — a single held part (OffsetDriver) or a whole telescoping cluster (combine driver) — glided from its parked offset toward the seat as the thumb advances. */
  driver?: OffsetSink;
  /** Slide staging (engagement.slideParkInfo): the backed-off offset the part  parks at; the drive eases it to [0,0,0]. */
  park?: ParkInfo | null;
}

/** Slide control: drag the thumb along the track to GLIDE the parked part into its groove. Linear counterpart of RotateControl's dial — a slider doesn't turn, it travels, so the gesture is a straight drag and the part follows 1:1. Progress is normalized 0..1 (store.advanceDrive); at 1 the placement commits. */
export function SlideControl({ action, driver, park }: Props) {
  const progress = useGameStore((s) => s.driveProgress[action.actionId] ?? 0);
  const parked = useRef<Vec3 | null>(null);
  const lastY = useRef<number | null>(null);

  useEffect(() => {
    parked.current = driver ? ([...driver.value] as unknown as Vec3) : null;
    lastY.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.actionId]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      if (lastY.current !== null) {
        const dy = e.y - lastY.current;
        const delta = dy / TRACK;
        if (delta !== 0) {
          const store = useGameStore.getState();
          const before = store.driveProgress[action.actionId] ?? 0;
          store.advanceDrive(action.actionId, delta);
          const after = Math.min(1, Math.max(0, before + delta));
          const p0 = parked.current;
          if (driver && park && p0) {
            driver.set([
              park.offset[0] * (1 - after),
              park.offset[1] * (1 - after),
              park.offset[2] * (1 - after),
            ]);
          }
          if (Math.floor(after * 5) > Math.floor(before * 5)) {
            Haptics.selectionAsync();
          }
        }
      }
      lastY.current = e.y;
    })
    .onEnd(() => {
      lastY.current = null;
    });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.track}>
          {/* The fill IS the indicator now — it grows from the top as you drag down, no
              separate knob. The arrow rides the fill's leading (bottom) edge. */}
          <View style={[styles.fill, { height: TRACK * progress }]}>
            <Text style={styles.arrow}>↓</Text>
          </View>
        </View>
      </GestureDetector>
      <Text style={styles.hint}>
        Slide it in · {Math.round(progress * 100)}%
      </Text>
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
  track: {
    width: 64,
    height: TRACK,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#8D7BA8",
    backgroundColor: "rgba(255,255,255,0.78)",
    overflow: "hidden",
  },
  // Grows DOWN from the top, so the filled portion tracks how far the part has slid in.
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#8D7BA8",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
  },
  arrow: { fontSize: 26, color: "#FBF8F3", fontWeight: "800" },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "700" },
});