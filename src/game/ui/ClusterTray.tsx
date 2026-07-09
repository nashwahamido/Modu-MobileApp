import * as Haptics from "expo-haptics";
import { useMemo, useRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { availableActions } from "@/src/game/core/evaluation/availability";
import {
  clusterComplete,
  clusterLabel,
  focusableClusterIds,
} from "@/src/game/core/evaluation/clusters";
import type { FitState } from "@/src/game/core/geometry/fit";
import { pickThumb } from "@/src/game/core/presentation/labels";
import { useGameStore } from "@/src/game/core/store";
import type { ActionId, ClusterId } from "@/src/game/core/type";
import { animateClusterDriver, type ClusterDriver } from "@/src/game/scene/offsetDriver";
import { useColorScheme } from "@/src/hooks/use-color-scheme";

const SPAWN_OFFSET: [number, number, number] = [0.5, 0.06, 0];
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

function buildDrag(
  c: ClusterId,
  combineId: ActionId | undefined,
  clusterDriver: ClusterDriver,
  fitRef: { current: FitState },
) {
  return Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      clusterDriver.set(SPAWN_OFFSET);
      const s = useGameStore.getState();
      s.setCombiningCluster(c);
      fitRef.current = "held";
      s.setDragFit("held", null);
    })
    .onUpdate((e) => {
      const t = clamp01(e.translationY / DRAG_PX);
      clusterDriver.set(lerp3(SPAWN_OFFSET, ZERO, t));
      const fit: FitState = t >= COMMIT_FRAC ? "nearCorrect" : "held";
      if (fit !== fitRef.current) {
        fitRef.current = fit;
        useGameStore.getState().setDragFit(fit, null);
      }
    })
    .onEnd((e) => {
      const t = clamp01(e.translationY / DRAG_PX);
      const s = useGameStore.getState();
      fitRef.current = "idle";
      if (combineId && t >= COMMIT_FRAC) {
        animateClusterDriver(clusterDriver, ZERO, 160, () => {
          const st = useGameStore.getState();
          st.completeAction(combineId);
          st.setCombiningCluster(null);
          st.setDragFit("idle", null);
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        s.setCombiningCluster(null);
        s.setDragFit("idle", null);
        clusterDriver.set(ZERO);
      }
    });
}

/**
 * A finished cluster you're not currently on becomes a card here (its rendered
 * preview), shown from the moment it finishes until it's combined — alongside the
 * current cluster's part cards (rendered as the PartsTray header). Once combine is
 * reachable, drag the card out like a part: the cluster spawns to the side and you
 * drag it in to seat onto the in-scene cluster, with a ghost + green fit feedback.
 */
export function ClusterTray({ clusterDriver }: { clusterDriver: ClusterDriver }) {
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const combiningCluster = useGameStore((s) => s.combiningCluster);
  const scheme = useColorScheme();
  const fitRef = useRef<FitState>("idle");

  const done = useMemo(() => new Set(completed), [completed]);
  const combineDone = useMemo(
    () =>
      !!furniture &&
      furniture.actions.some((a) => a.type === "combineClusters" && done.has(a.actionId)),
    [furniture, done],
  );
  const cards = useMemo(
    () =>
      !furniture || combineDone
        ? []
        : focusableClusterIds(furniture).filter(
            (c) => c !== activeCluster && clusterComplete(furniture, c, done),
          ),
    [furniture, combineDone, activeCluster, done],
  );
  const combineId = useMemo(
    () =>
      furniture
        ? availableActions(furniture, done).find((a) => a.type === "combineClusters")
            ?.actionId
        : undefined,
    [furniture, done],
  );
  const gestures = useMemo(() => {
    const m = new Map<ClusterId, ReturnType<typeof buildDrag>>();
    for (const c of cards) m.set(c, buildDrag(c, combineId, clusterDriver, fitRef));
    return m;
  }, [cards, combineId, clusterDriver]);

  if (!furniture || cards.length === 0) return null;
  const theme = scheme === "dark" ? "dark" : "light";

  return (
    <View style={styles.container} pointerEvents="box-none">
      {cards.map((c) => {
        const set = furniture.clusterThumbs?.[c];
        const thumb = set ? pickThumb(set, theme) : undefined;
        const dragging = combiningCluster === c;
        const card = (
          <View
            style={[
              styles.card,
              !combineId && styles.cardWaiting,
              dragging && styles.cardDragging,
            ]}
          >
            {thumb ? (
              <Image source={thumb} style={styles.thumb} resizeMode="contain" />
            ) : (
              <View style={styles.thumb} />
            )}
            <Text style={styles.label} numberOfLines={1}>
              {clusterLabel(furniture, c)}
            </Text>
            <Text style={styles.hint}>{combineId ? "drag to assemble" : "finished"}</Text>
          </View>
        );
        const g = gestures.get(c);
        return combineId && g ? (
          <GestureDetector key={c} gesture={g}>
            {card}
          </GestureDetector>
        ) : (
          <View key={c}>{card}</View>
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
    gap: 4,
  },
  cardWaiting: { borderColor: "rgba(60,50,40,0.2)", opacity: 0.85 },
  cardDragging: { opacity: 0.4 },
  thumb: { width: 44, height: 44 },
  label: { fontSize: 11, fontWeight: "700", color: "#2e2a24", textAlign: "center" },
  hint: { fontSize: 9, fontWeight: "600", color: "#37871f" },
});
