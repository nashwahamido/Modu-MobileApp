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
import { useCurrentUserId } from "@/src/data";
import { Button } from "@/src/game/ui/system/Button";
import { ELEVATION, FONT, RADIUS, SPACE, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import type { ToolId } from "@/src/game/core/type";

const seenKey = (userId: string, furnitureId: string) =>
  `modu.toolbox-coach-seen.v2:${userId}:${furnitureId}`;

export function ToolboxCoach({ neededTool }: { neededTool: ToolId | null }) {
  const styles = useFixedStyles(makeStyles);
  const profile = useGameStore((s) => s.profile);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const furnitureId = useGameStore((s) => s.furniture?.meta.id ?? null);
  const userId = useCurrentUserId();
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!neededTool || dismissed || !furnitureId || !userId) return;
    let alive = true;
    AsyncStorage.getItem(seenKey(userId, furnitureId))
      .then((seen) => {
        if (alive && !seen) setEligible(true);
      })
      .catch((err) => console.warn("[toolbox-coach] seen-flag read failed", err));
    return () => {
      alive = false;
    };
  }, [dismissed, neededTool, furnitureId, userId]);

  const close = () => {
    setDismissed(true);
    setEligible(false);
    if (!userId || !furnitureId) return;
    AsyncStorage.setItem(seenKey(userId, furnitureId), "1").catch((err) =>
      console.warn("[toolbox-coach] seen-flag save failed", err),
    );
  };

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

  useEffect(() => {
    if (eligible && neededTool && selectedTool === neededTool) close();
  }, [eligible, neededTool, selectedTool]);

  useEffect(() => {
    setDismissed(false);
    setEligible(false);
  }, [furnitureId]);

  if (!eligible || !neededTool) return null;
  return (
    <>
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
      <Animated.View style={[styles.card, card]}>
        <Image source={avatarForProfile(profile)} style={styles.avatar} resizeMode="contain" />
        <View style={styles.copy}>
          <Text style={styles.title}>Pick a Tool</Text>
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
    title: { color: t.accent, fontFamily: FONT, fontSize: 15, fontWeight: "900" },
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