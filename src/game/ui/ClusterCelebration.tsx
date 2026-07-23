import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  clusterComplete,
  clusterLabel,
  focusableClusterIds,
} from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/Button";
import { Theme, useStyles } from "@/src/game/ui/theme";
import type { ClusterId } from "@/src/game/core/type";

/** Fires the moment a cluster's last action lands: names what was finished and offers the one move that follows — the next unfinished cluster, or the combine stage when they are all done. The full-screen "choose a section" moment stays with BuildMap at game start; this popup owns the mid-build transitions so a finished cluster never has to become a card while you build the next one. */
export function ClusterCelebration() {
  const styles = useStyles(makeStyles);
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const [shown, setShown] = useState<ClusterId | null>(null);
  const seen = useRef<Set<ClusterId> | null>(null);

  const done = new Set(completed);
  const clusters = furniture ? focusableClusterIds(furniture) : [];
  const finished = furniture
    ? clusters.filter((c) => clusterComplete(furniture, c, done))
    : [];
  const unfinished = clusters.filter((c) => !finished.includes(c));

  useEffect(() => {
    if (!furniture) return;
    // first run baselines to the clusters already finished at mount, so a remount mid-build doesn't replay old celebrations
    if (!seen.current) {
      seen.current = new Set(finished);
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
        <Text style={styles.badge}>✓</Text>
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
    badge: { fontSize: 40, color: t.success, fontWeight: "800" },
    title: { color: t.text, fontSize: 18, fontWeight: "800" },
    subtitle: { color: t.textDim, fontSize: 13, lineHeight: 18, textAlign: "center", marginBottom: 6 },
  });
