import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ConfettiRain } from "@/src/game/ui/celebration/Confetti";
import {
  clusterComplete,
  clusterLabel,
  focusableClusterIds,
} from "@/src/game/core/evaluation/clusters";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { FONT, RADIUS, SIZE, SPACE, Theme, TYPE, useScaledStyles } from "@/src/game/ui/system/theme";
import { useCelebrationScale } from "./celebrationScale";

export function ClusterCelebration() {
  const k = useCelebrationScale();
  const styles = useScaledStyles(makeStyles, k);
  const win = useWindowDimensions();
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  const shown = useGameStore((s) => s.celebratingCluster);
  const celebrated = useGameStore((s) => s.celebratedClusters);
  const seenFor = useRef<string | null>(null);

  const done = new Set(completed);
  const clusters = furniture ? focusableClusterIds(furniture) : [];
  const finished = furniture
    ? clusters.filter((c) => clusterComplete(furniture, c, done))
    : [];
  const unfinished = clusters.filter((c) => !finished.includes(c));

  useEffect(() => {
    if (!furniture) return;
    if (seenFor.current !== furniture.meta.id) {
      seenFor.current = furniture.meta.id;
      useGameStore.getState().baselineCelebrated(finished);
      return;
    }
    for (const c of finished) {
      if (celebrated.includes(c)) continue;
      useGameStore.getState().celebrateCluster(c);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [furniture, completed.length]);

  const pop = useSharedValue(0);
  const fade = useSharedValue(0);
  useEffect(() => {
    if (!shown) {
      pop.value = 0;
      fade.value = 0;
      return;
    }
    pop.value = 0;
    fade.value = withTiming(1, { duration: 140 });
    pop.value = withSpring(1, { damping: 11, stiffness: 180, mass: 0.6 });
  }, [shown, pop, fade]);
  const popStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: 0.86 + pop.value * 0.14 }],
  }));

  if (!furniture || !shown) return null;
  const allDone = unfinished.length === 0;
  const next = unfinished[0];

  const onPress = () => {
    const store = useGameStore.getState();
    store.setActiveCluster(allDone ? null : next);
    useGameStore.getState().dismissCelebration();
    Haptics.selectionAsync();
  };

  return (
    <View style={styles.scrim} pointerEvents="auto">
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <ConfettiRain key={shown} delay={0} width={win.width} height={win.height} count={26} size={k} />
      </View>
      <Animated.View style={[styles.panel, popStyle]}>
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
          style={{
            minHeight: SIZE.controlHeight * k,
            paddingHorizontal: SPACE.lg * k,
            borderRadius: RADIUS.control * k,
          }}
          labelStyle={{ fontSize: (TYPE.label.fontSize ?? 14) * k }}
        />
      </Animated.View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      zIndex: 22,
    },
    panel: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: "#FBF8F3",
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 20,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      gap: 8,
      alignItems: "center",
    },
    badge: { width: 48, height: 48 },
    title: { fontFamily: FONT, color: "#231F20", fontSize: 18, fontWeight: "800" },
  });