import { useEffect, useMemo } from "react";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { Image, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureType } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { availableActions } from "@/src/game/core/evaluation/availability";
import {
  combineReady,
  focusableClusterIds,
  clusterLabel,
} from "@/src/game/core/evaluation/clusters";
import { clusterParkInfo } from "@/src/game/core/evaluation/clusterCombine";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import { clusterThumbSet } from "@/src/game/core/presentation/finish";
import { pickThumb } from "@/src/game/core/presentation/labels";
import { useGameStore } from "@/src/game/core/store";
import { Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import type { ActionId, AssemblyAction, ClusterId } from "@/src/game/core/type";
import { clusterSink, type OffsetSink } from "@/src/game/scene/combineDriver";
import type { ClusterDriver } from "@/src/game/scene/offsetDriver";
import { useColorScheme } from "@/src/hooks/use-color-scheme";

interface Props {
  clusterDriver: ClusterDriver;
  /** usePartDrag's camera-projected cluster drag: render-thread free carry, then the `sink` takes over at the park handoff. */
  clusterGestureFor: (
    action: AssemblyAction,
    sink: OffsetSink,
    park: ParkInfo | null,
  ) => GestureType;
}

/** The combine stage's tray: one card per FINISHED cluster, shown until that cluster's own combine is done. The seed cluster's card enables first (its combine gates the others via the derived requires); dragging a card spawns the real cluster — the seed drops into place, a slide-joined cluster parks along its travel axis and is driven home by SlideControl, telescoping its runners. During the build phase a finished cluster earns a celebration, not a card here (this tray only renders with no cluster focus). */
export function ClusterTray({ clusterDriver, clusterGestureFor }: Props) {
  const styles = useFixedStyles(makeStyles);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const combiningCluster = useGameStore((s) => s.combiningCluster);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const hintClusters = useGameStore((s) => s.hintClusters);
  const hintPulse = useGameStore((s) => s.hintPulse);
  const scheme = useColorScheme();

  const done = useMemo(() => new Set(completed), [completed]);
  // every cluster's OWN combine action, so a card can never fire another cluster's step
  const combineFor = useMemo(() => {
    const m = new Map<ClusterId, ActionId>();
    if (furniture) {
      for (const a of furniture.actions) {
        if (a.type === "combineClusters" && a.cluster) m.set(a.cluster, a.actionId);
      }
    }
    return m;
  }, [furniture]);
  // cards exist ONLY in the combine stage — no card while any cluster is still being built (a finished cluster earns a celebration then stays out of the way); once every cluster is done, each shows a card until ITS OWN combine completes
  const cards = useMemo(
    () =>
      !furniture || !combineReady(furniture, done)
        ? []
        : focusableClusterIds(furniture).filter((c) => {
            const id = combineFor.get(c);
            return !!id && !done.has(id);
          }),
    [furniture, combineFor, done],
  );
  const gestures = useMemo(() => {
    const m = new Map<ClusterId, GestureType>();
    if (!furniture) return m;
    const availableIds = new Set(availableActions(furniture, done).map((a) => a.actionId));
    for (const c of cards) {
      const id = combineFor.get(c);
      if (!id || !availableIds.has(id)) continue;
      const action = furniture.actions.find((a) => a.actionId === id)!;
      const park = clusterParkInfo(furniture.clusters, c);
      m.set(c, clusterGestureFor(action, clusterSink(clusterDriver), park));
    }
    return m;
  }, [furniture, cards, combineFor, done, clusterDriver, clusterGestureFor]);

  const flash = useSharedValue(0);
  // Keyed by VALUE, not array identity — the store hands back a fresh array each update and re-running the flash on every one would strobe.
  const hintKey = hintClusters.join(" ");
  useEffect(() => {
    if (!hintKey) return;
    // Three gentle accent pulses, matching the parts tray — enough to draw the eye without strobing. One shared value drives every highlighted card.
    flash.value = 0;
    flash.value = withRepeat(
      withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 240 })),
      3,
    );
  }, [hintKey, hintPulse, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));

  if (!furniture || cards.length === 0) return null;
  const theme = scheme === "dark" ? "dark" : "light";

  return (
    <View style={styles.container} pointerEvents="box-none">
      {cards.map((c) => {
        // The same resolution the build map uses, so a card in the tray and its circle on the map are never two different finishes of one sub-assembly.
        const set = clusterThumbSet(furniture, c, renderStyle);
        const thumb = set ? pickThumb(set, theme) : undefined;
        const g = gestures.get(c);
        const dragging = combiningCluster === c;
        const card = (
          <View
            style={[
              styles.card,
              !g && styles.cardWaiting,
              dragging && styles.cardDragging,
            ]}
          >
            <GrainOverlay radius={12} />
            {thumb ? (
              <Image source={thumb} style={styles.thumb} resizeMode="contain" />
            ) : (
              <View style={styles.thumb} />
            )}
            <Text style={styles.label} numberOfLines={1}>
              {clusterLabel(furniture, c)}
            </Text>
            {hintClusters.includes(c) ? (
              <Animated.View pointerEvents="none" style={[styles.flashOverlay, flashStyle]} />
            ) : null}
          </View>
        );
        return g ? (
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  container: { gap: 8 },
  card: {
    backgroundColor: t.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: t.success,
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
    overflow: "hidden",
  },
  cardWaiting: { borderColor: t.borderStrong, opacity: 0.85 },
  cardDragging: { opacity: 0.4 },
  thumb: { width: 44, height: 44 },
  label: { fontSize: 11, fontWeight: "700", color: t.text, textAlign: "center" },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: t.accent,
  },
  });