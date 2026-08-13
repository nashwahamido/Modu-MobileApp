import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import {
  clusterComplete,
  clusterLabel,
  focusableClusterIds,
} from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import type { ClusterId } from "@/src/game/core/type";

/** Fires the moment a cluster's last action lands: names what was finished and offers the one move that follows — the next unfinished cluster, or the combine stage when they are all done. The full-screen "choose a section" moment stays with BuildMap at game start; this popup owns the mid-build transitions so a finished cluster never has to become a card while you build the next one. */
export function ClusterCelebration() {
  const styles = useFixedStyles(makeStyles);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const [shown, setShown] = useState<ClusterId | null>(null);
  const seen = useRef<Set<ClusterId> | null>(null);
  // Which furniture `seen` was baselined against. Cluster ids are generic ("base", "seat"), and the play screen swaps furniture WITHOUT remounting — so a set carried across a swap either swallows the new build's "base" celebration or replays a resumed build's already-finished ones.
  const seenFor = useRef<string | null>(null);

  const done = new Set(completed);
  const clusters = furniture ? focusableClusterIds(furniture) : [];
  const finished = furniture
    ? clusters.filter((c) => clusterComplete(furniture, c, done))
    : [];
  const unfinished = clusters.filter((c) => !finished.includes(c));

  useEffect(() => {
    if (!furniture) return;
    // first run — and every furniture swap — baselines to the clusters already finished, so neither a remount mid-build nor a resumed save replays old celebrations
    if (!seen.current || seenFor.current !== furniture.meta.id) {
      seen.current = new Set(finished);
      seenFor.current = furniture.meta.id;
      // A stale card from the previous furniture must not survive the swap.
      setShown(null);
      return;
    }
    for (const c of finished) {
      if (seen.current.has(c)) continue;
      seen.current.add(c);
      setShown(c);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [furniture, completed.length]);

  if (!furniture || !shown) return null;
  const allDone = unfinished.length === 0;
  const next = unfinished[0];

  const onPress = () => {
    const store = useGameStore.getState();
    store.setActiveCluster(allDone ? null : next);
    setShown(null);
    Haptics.selectionAsync();
  };

  return (
    <View style={styles.scrim} pointerEvents="box-none">
      <View style={styles.panel}>
        <Image
          source={require("@/src/assets/ui/icons/icon-success.png")}
          style={styles.badge}
          resizeMode="contain"
        />
        <Text style={styles.title}>{clusterLabel(furniture, shown)} finished</Text>
        <Button
          label={allDone ? "Put it together ›" : `Build the ${clusterLabel(furniture, next).toLowerCase()} ›`}
          variant="primary"
          onPress={onPress}
        />
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      zIndex: 22,
      elevation: 22,
    },
    panel: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: t.surface,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: t.success,
      paddingHorizontal: 20,
      paddingVertical: 20,
      gap: 8,
      alignItems: "center",
    },
    // Sized to the 40pt glyph it replaced, so the card's rhythm is unchanged.
    badge: { width: 48, height: 48 },
    title: { color: t.text, fontSize: 18, fontWeight: "800" },
  });