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
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import type { ActionId, AssemblyAction, ClusterId } from "@/src/game/core/type";
import { clusterSink, type OffsetSink } from "@/src/game/scene/combineDriver";
import type { ClusterDriver } from "@/src/game/scene/offsetDriver";
import { useColorScheme } from "@/src/hooks/use-color-scheme";

interface Props {
  clusterDriver: ClusterDriver;
  clusterGestureFor: (
    action: AssemblyAction,
    sink: OffsetSink,
    park: ParkInfo | null,
  ) => GestureType;
}

export function ClusterTray({ clusterDriver, clusterGestureFor }: Props) {
  const styles = useFixedStyles(makeStyles);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const combiningCluster = useGameStore((s) => s.combiningCluster);
  const renderStyle = usePrefsStore((s) => s.renderStyle);
  const hintClusters = useGameStore((s) => s.hintClusters);
  const hintPulse = useGameStore((s) => s.hintPulse);
  const scheme = useColorScheme();

  const done = useMemo(() => new Set(completed), [completed]);
  const combineFor = useMemo(() => {
    const m = new Map<ClusterId, ActionId>();
    if (furniture) {
      for (const a of furniture.actions) {
        if (a.type === "combineClusters" && a.cluster) m.set(a.cluster, a.actionId);
      }
    }
    return m;
  }, [furniture]);
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
  const hintKey = hintClusters.join(" ");
  useEffect(() => {
    if (!hintKey) return;
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