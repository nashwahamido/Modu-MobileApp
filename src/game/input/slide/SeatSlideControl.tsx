import * as Haptics from "expo-haptics";
import { CONTROL } from "@/src/game/ui/system/theme";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useGameStore } from "@/src/game/core/store";
import { AssemblyAction, Vec3 } from "@/src/game/core/type";
import type { ClusterDriver, OffsetDriver } from "../../scene/offsetDriver";

const TRACK = 220;

interface Props {
  action: AssemblyAction;
  /** The carrier's stageOffset — where the finished sub-assembly rests, directly off its seat. The slide eases this to [0,0,0]. */
  offset: Vec3;
  /** Drives the carrier (rendered "held" once grabbed). */
  heldDriver: OffsetDriver;
  /** Drives the riding fitted hardware (the dowels) so the whole sub-assembly moves as one. */
  slideDriver: ClusterDriver;
}

/** Slide-in seat for a staged sub-assembly (EKET stabiliser rod): the finished rod+dowels rests directly above its seat, so a vertical slider drives it straight DOWN into place — no re-fetching it from the tray. First drag grabs the on-screen part (beginPickup) so the tray card stays a fallback until this is touched; each drag eases the carrier (heldDriver) and its riding dowels (slideDriver mirror) from the stage offset to flush; at the bottom the placement commits. */
export function SeatSlideControl({ action, offset, heldDriver, slideDriver }: Props) {
  const [prog, setProg] = useState(0);
  const progRef = useRef(0); // authoritative (setState is async; the pan reads this)
  const lastY = useRef<number | null>(null);

  useEffect(() => {
    progRef.current = 0;
    setProg(0);
    lastY.current = null;
  }, [action.actionId]);

  const apply = (p: number) => {
    heldDriver.set([offset[0] * (1 - p), offset[1] * (1 - p), offset[2] * (1 - p)]);
    slideDriver.set(heldDriver.value);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      const store = useGameStore.getState();
      if (store.heldActionId !== action.actionId) {
        // grab the on-screen sub-assembly (renders "held" + dowels "riding") — the card stays a fallback until now
        store.beginPickup(action.actionId);
        apply(progRef.current);
      }
    })
    .onUpdate((e) => {
      if (lastY.current !== null) {
        const delta = (e.y - lastY.current) / TRACK;
        if (delta !== 0) {
          const prev = progRef.current;
          const nd = Math.min(1, Math.max(0, prev + delta));
          progRef.current = nd;
          setProg(nd);
          apply(nd);
          if (Math.floor(nd * 5) > Math.floor(prev * 5)) Haptics.selectionAsync();
          if (nd >= 1) {
            const store = useGameStore.getState();
            store.completeAction(action.actionId);
            store.cancelHeld();
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
          <View style={[styles.fill, { height: TRACK * prog }]} />
          <View style={[styles.thumb, { top: (TRACK - 44) * prog }]}>
            <Text style={styles.thumbText}>⇣</Text>
          </View>
        </View>
      </GestureDetector>
      <Text style={styles.hint}>Slide it in · {Math.round(prog * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 160, bottom: 36, alignItems: "center", gap: 8 },
  track: {
    width: 64,
    height: TRACK,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: CONTROL.fill,
    backgroundColor: "rgba(255,255,255,0.78)",
    overflow: "hidden",
  },
  fill: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: CONTROL.fillSoft },
  thumb: {
    position: "absolute",
    left: 6,
    right: 6,
    height: 44,
    borderRadius: 22,
    backgroundColor: CONTROL.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: { fontSize: 26, color: "#fff", fontWeight: "800" },
  hint: { fontSize: 12, color: "#6b6257", fontWeight: "700" },
});
