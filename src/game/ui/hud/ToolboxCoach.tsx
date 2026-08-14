// The toolbox coach mark: the first time a build actually needs a tool, the mode's avatar says so.
//
// The tutorial teaches LACK, which is hand-tightened — it has no toolbox step and, after that step
// was removed, no mention of tools at all. So the first time a player meets EKET or BEKVÄM the
// toolbox appears with no explanation, and a tighten silently refuses until the right tool is
// equipped. This is the missing beat, delivered where it is needed rather than in a tutorial the
// player finished days ago.
//
// It follows the tutorial's shape deliberately — avatar, bubble, one acknowledgement — so it reads
// as the same voice rather than as a new kind of popup.
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { avatarForProfile } from "@/src/components/avatarAssets";
import { useGameStore } from "@/src/game/core/store";
import { Button } from "@/src/game/ui/system/Button";
import { ELEVATION, FONT, RADIUS, SPACE, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import type { ToolId } from "@/src/game/core/type";

/** Once per player, not per build: the toolbox works the same way in every furniture that has one. */
const SEEN_KEY = "modu.toolbox-coach-seen.v1";

export function ToolboxCoach({ neededTool }: { neededTool: ToolId | null }) {
  const styles = useFixedStyles(makeStyles);
  const profile = useGameStore((s) => s.profile);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // The read is gated on a tool ACTUALLY being needed, so a player who never reaches a tool step
  // does not spend the once-only flag on a card that was never shown.
  useEffect(() => {
    if (!neededTool || dismissed) return;
    let alive = true;
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => {
        if (alive && !seen) setEligible(true);
      })
      .catch((err) => console.warn("[toolbox-coach] seen-flag read failed", err));
    return () => {
      alive = false;
    };
  }, [dismissed, neededTool]);

  const close = () => {
    setDismissed(true);
    setEligible(false);
    AsyncStorage.setItem(SEEN_KEY, "1").catch((err) =>
      console.warn("[toolbox-coach] seen-flag save failed", err),
    );
  };

  // Rises into place, then the ring below it breathes at the toolbox.
  const enter = useSharedValue(0);
  useEffect(() => {
    if (!eligible) return;
    enter.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [eligible, enter]);
  const card = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: 16 * (1 - enter.value) }],
  }));

  const halo = useSharedValue(0);
  useEffect(() => {
    if (!eligible) return;
    halo.value = withDelay(
      260,
      withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [eligible, halo]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - halo.value),
    transform: [{ scale: 1 + halo.value * 0.5 }],
  }));

  // The moment the right tool is equipped the advice is spent — no need to make the player dismiss
  // something they have already acted on.
  useEffect(() => {
    if (eligible && neededTool && selectedTool === neededTool) close();
  }, [eligible, neededTool, selectedTool]);

  if (!eligible || !neededTool) return null;
  return (
    <>
      {/* A ring over the toolbox itself, so the card and the control are visibly connected. */}
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
      <Animated.View style={[styles.card, card]}>
        <Image source={avatarForProfile(profile)} style={styles.avatar} resizeMode="contain" />
        <View style={styles.copy}>
          <Text style={styles.title}>This one needs a tool</Text>
          <Text style={styles.body}>
            Open the toolbox below and choose the right tool, then turn to tighten.
          </Text>
          <Button label="Got it" small pill variant="primary" onPress={close} style={styles.cta} />
        </View>
      </Animated.View>
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Directly above the toolbar (bottom:16, height 48, centred), so the eye travels from the card
    // to the control without crossing the scene.
    card: {
      position: "absolute",
      alignSelf: "center",
      bottom: 78,
      width: 330,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      borderWidth: 2,
      borderColor: t.accent,
      zIndex: 30,
      ...ELEVATION.raised,
    },
    avatar: { width: 54, height: 54 },
    copy: { flex: 1, gap: 2 },
    title: { color: t.text, fontFamily: FONT, fontSize: 14, fontWeight: "900" },
    body: { color: t.textDim, fontFamily: FONT, fontSize: 12, fontWeight: "700", lineHeight: 15 },
    cta: { alignSelf: "flex-start", marginTop: SPACE.sm },
    halo: {
      position: "absolute",
      alignSelf: "center",
      bottom: 10,
      width: 60,
      height: 60,
      borderRadius: 30,
      borderWidth: 3,
      borderColor: t.accent,
      zIndex: 29,
    },
  });