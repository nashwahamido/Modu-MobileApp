// "Skip tutorial", and the confirmation that goes with it.
//
// The button is quiet — a small ghost chip in the corner — because a tutorial that advertises its
// own exit invites people out of it before they have seen anything. But it is present from the
// first step, because a player who already knows how this works should never have to sit through
// being taught, and one who is stuck needs a way out that is not the back button.
//
// The confirmation exists for one reason: to say the build is not lost. Without it "skip" reads as
// "throw this away", and the honest answer is that the model is waiting in the catalogue.
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
    <Pressable
      style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Skip the tutorial"
    >
      <Text style={styles.skipText}>Skip tutorial</Text>
    </Pressable>
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
      {/* Tapping outside cancels: a confirmation that can only be answered by choosing one of two
          buttons is a trap when the player opened it by accident. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <Animated.View style={[styles.card, card]}>
        <Text style={styles.title}>Skip the tutorial?</Text>
        <Text style={styles.body}>
          You can finish assembling this model later — it will be waiting in your catalogue.
        </Text>
        <View style={styles.actions}>
          {/* Staying is the PRIMARY action: the player is mid-tutorial, and the button that keeps
              them where they are should be the easy one to hit. */}
          <Button label="Keep going" pill variant="primary" onPress={onCancel} />
          <Button label="Skip" pill variant="secondary" onPress={onConfirm} />
        </View>
      </Animated.View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Bottom-centre, away from the joystick and the tray — the two places a thumb already lives.
    skip: {
      position: "absolute",
      // Level with the OBJECTIVE BAR's centre: the bar sits at top:10 and runs ~70 tall, so 38 puts
      // this text on its midline. right:112 clears the PARTS TRAY (right:14, width:86) and sits just
      // inboard of it, so the link never overlaps the tray column or its cards.
      top: 38,
      right: 48,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.xs,
      borderRadius: RADIUS.pill,
      zIndex: 40,
    },
    skipPressed: { opacity: 0.6 },
    // Cream with a shadow, not a theme colour. This sits over the 3D SCENE rather than on a panel,
    // and t.textFaint is a dim ink meant for cream surfaces — on the assembly backdrop it was close
    // to invisible. Bigger too: an exit a stuck player cannot find is not an exit.
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