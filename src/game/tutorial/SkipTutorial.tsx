import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Button } from "@/src/game/ui/system/Button";
import {
  ELEVATION,
  FONT,
  RADIUS,
  SPACE,
  useFixedStyles,
} from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";

export function SkipTutorialButton({ onPress }: { onPress: () => void }) {
  const styles = useFixedStyles(makeStyles);
  return (
    <View style={styles.skipSlot} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
        onPress={onPress}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Skip the tutorial"
      >
        <Text style={styles.skipText}>Skip tutorial</Text>
      </Pressable>
    </View>
  );
}

export function SkipTutorialConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const styles = useFixedStyles(makeStyles);
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [enter]);
  const card = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.92 + enter.value * 0.08 }],
  }));

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <Animated.View style={[styles.card, card]}>
        <Text style={styles.title}>Skip the tutorial?</Text>
        <Text style={styles.body}>
          You can finish assembling this model later — it will be waiting in your catalogue.
        </Text>
        <View style={styles.actions}>
          <Button label="Keep going" pill variant="primary" onPress={onCancel} />
          <Button label="Skip" pill variant="secondary" onPress={onConfirm} />
        </View>
      </Animated.View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    skipSlot: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 24,
      alignItems: "center",
      zIndex: 40,
    },
    skip: {
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.xs,
      borderRadius: RADIUS.pill,
      zIndex: 40,
    },
    skipPressed: { opacity: 0.6 },
    skipText: {
      color: "#F7F2E8",
      fontFamily: FONT,
      fontSize: 14,
      fontWeight: "800",
      textDecorationLine: "underline",
      textShadowColor: "rgba(10,8,9,0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    root: { ...StyleSheet.absoluteFillObject, zIndex: 70, alignItems: "center", justifyContent: "center" },
    card: {
      width: 340,
      gap: SPACE.sm,
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.lg,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      borderWidth: 2,
      borderColor: t.accent,
      ...ELEVATION.raised,
    },
    title: { color: t.text, fontFamily: FONT, fontSize: 16, fontWeight: "900" },
    body: {
      color: t.textDim,
      fontFamily: FONT,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18,
      marginBottom: SPACE.sm,
    },
    actions: { flexDirection: "row", gap: SPACE.sm },
  });