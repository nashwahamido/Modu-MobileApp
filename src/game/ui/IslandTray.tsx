import * as Haptics from "expo-haptics";
import { useMemo, useRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { isMergeable, islandLabel } from "@/src/game/core/evaluation/islands";
import type { FitState } from "@/src/game/core/geometry/fit";
import { thumbFor } from "@/src/game/core/presentation/labels";
import { useGameStore } from "@/src/game/core/store";
import type { Furniture, PartId } from "@/src/game/core/type";
import {
  animateClusterDriver,
  type IslandDriverRegistry,
} from "@/src/game/scene/offsetDriver";

// Parked islands live in the TRAY (parts hidden), not on a shelf. While a card is being dragged OUT, the island renders and GLIDES from an approach spot beside the assembly to its baked seat. The approach spot is a fixed world anchor (x aside of the build), so every island departs from the same predictable place; height stays baked so the island neither sinks nor jumps.
export const APPROACH_X = 0.6;

/** World-space centroid of the island (mean of members' visual centers). */
const islandCentroid = (f: Furniture, members: readonly PartId[]) => {
  let x = 0, y = 0, z = 0, n = 0;
  for (const m of members) {
    const p = f.parts[m];
    if (!p) continue;
    const [ox, oy, oz] = p.visualCenterOffset ?? [0, 0, 0];
    x += p.pose.position[0] + ox;
    y += p.pose.position[1] + oy;
    z += p.pose.position[2] + oz;
    n++;
  }
  return n ? ([x / n, y / n, z / n] as const) : ([0, 0, 0] as const);
};

/** Offset that puts the island at its approach spot (drag start pose). */
export const approachOffset = (
  f: Furniture,
  members: readonly PartId[],
): [number, number, number] => {
  const [cx] = islandCentroid(f, members);
  return [APPROACH_X - cx, 0, 0];
};

const ZERO: [number, number, number] = [0, 0, 0];
const DRAG_PX = 180;
const COMMIT_FRAC = 0.7;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp3 = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Drag progress: total travel in ANY direction — the tray sits at the screen edge, so players drag toward the scene (leftward) as naturally as down. (Progress was once downward-only, which read as "the card barely moves".) */
const dragT = (e: { translationX: number; translationY: number }) =>
  clamp01(Math.hypot(e.translationX, e.translationY) / DRAG_PX);

function buildDrag(
  id: PartId,
  approach: [number, number, number],
  registry: IslandDriverRegistry,
  fitRef: { current: FitState },
) {
  const driver = registry.get(id);
  // Set when onStart finds nothing to drag (the island left the tray during the touch — see the held-part cancel below); later phases then no-op.
  let dead = false;
  return Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      const st = useGameStore.getState();
      // A held/floating part goes back FIRST — the workspace can't take an island in while a loose part hovers. If that part's pickup was what parked THIS island (park-at-pickup), cancelling it un-parks the island — already home, so there is nothing left to drag.
      if (st.heldActionId) st.cancelHeld();
      if (!useGameStore.getState().parkedIslands.some((p) => p.id === id)) {
        dead = true;
        return;
      }
      dead = false;
      // Offset FIRST, then mark returning: the members mount into "parked" mode on the re-render and register against the already-set offset.
      driver.set(approach);
      useGameStore.getState().setReturningIsland(id);
      fitRef.current = "held";
      useGameStore.getState().setDragFit("held", null);
    })
    .onUpdate((e) => {
      if (dead) return;
      const t = dragT(e);
      driver.set(lerp3(approach, ZERO, t));
      const fit: FitState = t >= COMMIT_FRAC ? "nearCorrect" : "held";
      if (fit !== fitRef.current) {
        fitRef.current = fit;
        useGameStore.getState().setDragFit(fit, null);
      }
    })
    .onEnd((e) => {
      if (dead) return;
      const t = dragT(e);
      fitRef.current = "idle";
      if (t >= COMMIT_FRAC) {
        animateClusterDriver(driver, ZERO, 160, () => {
          useGameStore.getState().bringIslandHome(id); // also clears returning
          useGameStore.getState().setDragFit("idle", null);
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        // Abort: back into the tray (hidden again).
        useGameStore.getState().setReturningIsland(null);
        useGameStore.getState().setDragFit("idle", null);
      }
    });
}

/** Cards for parked sub-assemblies (islands). Always draggable: a BRIDGED island glides home and merges; an un-bridged one glides out and becomes the active island (the previous active one returns to the tray — a swap). */
export function IslandTray({ islandDrivers }: { islandDrivers: IslandDriverRegistry }) {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const parkedIslands = useGameStore((s) => s.parkedIslands);
  const theme = useGameStore((s) => s.theme);
  const fitRef = useRef<FitState>("idle");

  const gestures = useMemo(() => {
    const m = new Map<PartId, ReturnType<typeof buildDrag>>();
    if (!furniture) return m;
    parkedIslands.forEach((isl) =>
      m.set(
        isl.id,
        buildDrag(isl.id, approachOffset(furniture, isl.members), islandDrivers, fitRef),
      ),
    );
    return m;
  }, [parkedIslands, islandDrivers, furniture]);

  if (!furniture || parkedIslands.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {parkedIslands.map((isl) => {
        const bridged = isMergeable(furniture, completed, isl.members);
        // Preview: the seed part's group thumbnail (same source as PartsTray).
        const thumb = thumbFor(furniture.thumbs, furniture.parts[isl.id].group, theme);
        const card = (
          <View style={[styles.card, !bridged && styles.cardWaiting]}>
            {thumb ? (
              <Image source={thumb} style={styles.thumb} resizeMode="contain" />
            ) : null}
            <Text style={styles.label} numberOfLines={2}>
              {islandLabel(furniture, { seed: isl.id, cluster: furniture.parts[isl.id].cluster })}
            </Text>
            <Text style={styles.count}>{isl.members.length} parts</Text>
            <Text style={styles.hint}>{bridged ? "drag to assemble" : "drag to work on it"}</Text>
          </View>
        );
        const g = gestures.get(isl.id);
        return g ? (
          <GestureDetector key={isl.id} gesture={g}>
            {card}
          </GestureDetector>
        ) : (
          <View key={isl.id}>{card}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  card: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#37c871",
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 3,
  },
  cardWaiting: { borderColor: "rgba(60,50,40,0.2)", opacity: 0.85 },
  thumb: { width: 44, height: 44 },
  label: { fontSize: 11, fontWeight: "700", color: "#2e2a24", textAlign: "center" },
  count: { fontSize: 9, fontWeight: "600", color: "#7a6f5d" },
  hint: { fontSize: 9, fontWeight: "600", color: "#37871f" },
});
