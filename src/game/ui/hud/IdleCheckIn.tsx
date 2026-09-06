import { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { avatarHeadForProfile } from "@/src/components/avatarAssets";
import { CompanionPortrait } from "@/src/game/ui/hud/CompanionPortrait";
import { useGameStore } from "@/src/game/core/store";
import { useBuildPaused } from "@/src/game/ui/hud/useBuildPaused";
import { ELEVATION, RADIUS, SPACE, ThemeScope, TYPE, type Theme, useFixedStyles } from "@/src/game/ui/system/theme";

const IDLE_MS = 20_000;

const WELCOME_MS = 6_000;

const ASK_VISIBLE_MS = 8_000;
const CARD_CREAM = "#FBF8F3";
const CARD_INK = "#231F20";

export function IdleCheckIn() {
  const styles = useFixedStyles(makeStyles);
  const profile = useGameStore((s) => s.profile);

  const completedCount = useGameStore((s) => s.completed.length);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const driveActionId = useGameStore((s) => s.driveActionId);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const paused = useBuildPaused();
  const hintPulse = useGameStore((s) => s.hintPulse);

  const [asking, setAsking] = useState(false);
  const [welcoming, setWelcoming] = useState(false);
  const activityTick = useGameStore((s) => s.activityTick);
  const pulse = useRef(new Animated.Value(1)).current;
  const appState = useRef(AppState.currentState);

  const momentum = profile === "momentum";

  useEffect(() => {
    if (!momentum || paused || welcoming) return;
    setAsking(false);
    const timer = setTimeout(() => setAsking(true), IDLE_MS);
    return () => clearTimeout(timer);
  }, [
    momentum,
    paused,
    welcoming,
    completedCount,
    heldActionId,
    driveActionId,
    orientationActionId,
    activeCluster,
    hintPulse,
    activityTick,
  ]);

  useEffect(() => {
    if (!momentum) return;
    const sub = AppState.addEventListener("change", (next) => {
      const previous = appState.current;
      appState.current = next;
      if (previous !== "active" && next === "active") {
        setAsking(false);
        setWelcoming(true);
      }
    });
    return () => sub.remove();
  }, [momentum]);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), ASK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [asking]);

  useEffect(() => {
    if (!welcoming) return;
    const timer = setTimeout(() => setWelcoming(false), WELCOME_MS);
    return () => clearTimeout(timer);
  }, [welcoming]);

  useEffect(() => {
    if (!asking && !welcoming) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.035, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, asking, welcoming]);

  if (!momentum || paused) return null;

  const showing = asking || welcoming;

  const dismiss = () => {
    setAsking(false);
    setWelcoming(false);
  };

  return (
    <ThemeScope value="light">
    <View
      style={styles.layer}
      pointerEvents="box-none"
    >
      {showing ? (
      <Animated.View style={[styles.row, { transform: [{ scale: pulse }] }]}>
        <CompanionPortrait source={avatarHeadForProfile(profile)} accessibilityLabel="Sparky" />
        <View style={styles.copy}>
          <Text style={styles.title}>
            {welcoming ? "Welcome back!" : "Are you still here?"}
          </Text>
          <Text style={styles.message}>
            {welcoming
              ? "Your build is exactly where you left it."
              : "No rush. Your build is saved and Sparky is right here."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={10}
            onPress={dismiss}
            style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
          >
            <Text style={styles.dismissText}>Got it</Text>
          </Pressable>
        </View>
      </Animated.View>
      ) : null}
    </View>
    </ThemeScope>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 60,
      alignItems: "center",
      justifyContent: "flex-start",
      paddingTop: 92,
    },
    row: {
      maxWidth: 440,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    copy: {
      flexShrink: 1,
      minWidth: 0,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: CARD_CREAM,
      ...ELEVATION.card,
    },
    title: { ...TYPE.title, color: CARD_INK },
    message: { ...TYPE.body, marginTop: 3, color: t.textDim },
    dismiss: {
      alignSelf: "flex-end",
      marginTop: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: t.accent,
    },
    dismissPressed: { backgroundColor: t.accentPressed },
    dismissText: { ...TYPE.label, color: t.onAccent },
  });