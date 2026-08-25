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

/** Fires the moment a cluster's last action lands: names what was finished and offers the one move that follows — the next unfinished cluster, or the combine stage when they are all done. The full-screen "choose a section" moment stays with BuildMap at game start; this popup owns the mid-build transitions so a finished cluster never has to become a card while you build the next one. */
export function ClusterCelebration() {
  // SCALED on a tablet, fixed on a phone. This card is a single panel with one line of copy and a
  // badge — the shape theme.ts calls safe to grow — so it takes the shared celebration scale rather
  // than opting out the way the dense HUD surfaces do. See celebrationScale.
  const k = useCelebrationScale();
  const styles = useScaledStyles(makeStyles, k);
  const win = useWindowDimensions();
  const furniture = useGameStore((s) => s.furniture);
  const completed = useGameStore((s) => s.completed);
  // BOTH IN THE STORE now, not local state. A ref is emptied by any remount, and it is invisible from
  // outside — which is how a finished stage re-celebrated when the player went back into it from the
  // project map, and how the Map coach ended up drawing on top of this card.
  const shown = useGameStore((s) => s.celebratingCluster);
  const celebrated = useGameStore((s) => s.celebratedClusters);
  // Which furniture the baseline was taken against. Cluster ids are generic ("base", "seat"), and the play screen swaps furniture WITHOUT remounting — so a set carried across a swap either swallows the new build's "base" celebration or replays a resumed build's already-finished ones.
  const seenFor = useRef<string | null>(null);

  const done = new Set(completed);
  const clusters = furniture ? focusableClusterIds(furniture) : [];
  const finished = furniture
    ? clusters.filter((c) => clusterComplete(furniture, c, done))
    : [];
  const unfinished = clusters.filter((c) => !finished.includes(c));

  useEffect(() => {
    if (!furniture) return;
    // Every furniture swap baselines to the clusters already finished, so neither a remount mid-build
    // nor a resumed save replays old celebrations.
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

  // POP, not a fade: a cluster finishing is the build's small win, and the card should arrive with
  // the same energy the haptic already fires with. Keyed on `shown` so the next cluster replays it
  // rather than the card simply swapping its text.
  // Both properties come from SHARED VALUES only — no JS variable is read inside the worklet, and
  // no animation is started from within useAnimatedStyle. Doing either is what left the card
  // mounted but invisible: the worklet has no reliable access to `shown`, so the opacity it
  // computed was never the one the component intended.
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
      {/* Behind the card and across the whole scrim: the confetti belongs to the MOMENT, not to the
          panel, and boxed inside it the fall was over before it read as celebration. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* `size` is the scrap multiplier, and it takes the card's scale for the same reason the fall spans the window: paper cut for a phone reads as dust across a tablet. */}
        <ConfettiRain key={shown} delay={0} width={win.width} height={win.height} count={26} size={k} />
      </View>
      <Animated.View style={[styles.panel, popStyle]}>
        <Image
          source={require("@/src/assets/ui/icons/icon-success.png")}
          style={styles.badge}
          resizeMode="contain"
        />
        <Text style={styles.title}>{clusterLabel(furniture, shown)} finished</Text>
        {/* Button carries its OWN fixed sheet — it is a shared control sized for the HUD, and nothing about a card growing reaches inside it. On a tablet that left a phone-sized button under a card half again as big, so the card hands it its scale: the same k, on the three measurements that decide the control's size. */}
        <Button
          label={allDone ? "Put it together ›" : `Build the ${clusterLabel(furniture, next).toLowerCase()} ›`}
          variant="primary"
          onPress={onPress}
          style={{
            minHeight: SIZE.controlHeight * k,
            paddingHorizontal: SPACE.lg * k,
            borderRadius: RADIUS.control * k,
          }}
          // TYPE is typed as Record<…, TextStyle>, so the size reads as optional — the fallback is that same 14, not a second opinion about it.
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
      // The SAME dimmed backdrop the project map uses. Both panels are #FBF8F3, but this one was
      // sitting on an undimmed 3D scene — the identical cream reads warmer and lighter against a
      // bright workbench than against the map's darkened one, which is why they looked different.
      backgroundColor: t.scrim,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      // zIndex only — NO elevation. On Android `elevation` draws a drop shadow around the view's
      // BOUNDS, and this view sits inside play.tsx's inset chrome container: that shadow landed on
      // screen as a dark band tracing the container's edges — the ghost rectangle behind the card.
      // ClusterFocusControl's scrim carries the same note for the same reason.
      zIndex: 22,
    },
    panel: {
      width: "100%",
      maxWidth: 340,
      // The PROJECT MAP's panel colour, and no outline: these two cards are the same voice — one
      // opens a stage, the other closes it — and the green stroke made this one read as a system
      // confirmation rather than as a small celebration.
      //
      // #FBF8F3, moved with the map and the completion screen. Left behind it would have been the
      // one panel of the three still on the old cream, and the comment above would have been wrong.
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
    // Sized to the 40pt glyph it replaced, so the card's rhythm is unchanged.
    badge: { width: 48, height: 48 },
    // FIXED ink, not t.text: the panel is a fixed cream, so a theme-driven colour turns near-white
    // on it in dark mode. Same reasoning as the objective bar's instruction line.
    // fontFamily was MISSING here, which in React Native is not a small thing: there is no font
    // inheritance, so a weight without a family renders in the system font — this one line was set in
    // something other than Lexend on every device. See convention 5 in theme.ts.
    title: { fontFamily: FONT, color: "#231F20", fontSize: 18, fontWeight: "800" },
  });