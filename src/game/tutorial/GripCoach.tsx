import { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
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

function GripArt() {
  const styles = useFixedStyles(makeStyles);
  const drop = useSharedValue(0);
  useEffect(() => {
    drop.value = withSequence(
      withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }),
      withDelay(760, withTiming(0, { duration: 0 })),
      withDelay(160, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) })),
    );
  }, [drop]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 2.5),
    transform: [{ translateY: -70 * (1 - drop.value) }],
  }));
  return (
    <Animated.View style={[styles.art, anim]} pointerEvents="none">
      <Image
        source={require("@/src/assets/ui/hold-hands.png")}
        style={styles.artImage}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export function GripCoach({ onAcknowledge }: { onAcknowledge: () => void }) {
  const styles = useFixedStyles(makeStyles);

  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withDelay(
      760,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
  }, [enter]);
  const copyAnim = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.94 + enter.value * 0.06 }],
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.scrim} pointerEvents="none" />
      <GripArt />
      <Animated.View style={[styles.copy, copyAnim]} pointerEvents="box-none">
        <Text style={styles.title}>Hold it like a controller</Text>
        <Text style={styles.body}>
          Two hands, one at each side. Your thumbs reach everything you need.
        </Text>
        <Button label="Got it" pill variant="primary" onPress={onAcknowledge} />
      </Animated.View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { ...StyleSheet.absoluteFillObject, zIndex: 60 },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,8,9,0.45)" },
    art: {
      position: "absolute",
      left: SPACE.xl,
      right: SPACE.xl,
      bottom: SPACE.lg,
      alignItems: "center",
    },
    artImage: { width: "100%", height: 300 },
    copy: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      gap: SPACE.sm,
    },
    title: {
      color: "#F7F2E8",
      fontFamily: FONT,
      fontSize: 17,
      fontWeight: "900",
      textAlign: "center",
      textShadowColor: "rgba(10,8,9,0.7)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 5,
    },
    body: {
      color: "#F7F2E8",
      fontFamily: FONT,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 17,
      textAlign: "center",
      marginBottom: SPACE.sm,
      textShadowColor: "rgba(10,8,9,0.7)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 5,
    },
  });