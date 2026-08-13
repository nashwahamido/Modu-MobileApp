// The grip step: two ghost hands at the edges of the screen, and a card in the middle explaining
// why they are there.
//
// It runs FIRST, before any control is introduced, because every control after it assumes this grip.
// The joystick sits bottom-left and the parts tray bottom-right — both are thumb positions — and a
// player holding the phone one-handed to read the instructions finds the first drag awkward for a
// reason the tutorial otherwise never mentions.
//
// The hands are drawn rather than photographed: a photo of someone else's hands invites comparison
// with your own, where a silhouette just shows a shape to copy.
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

/**
 * The grip illustration: both hands and a device, one piece of line art.
 *
 * Replaces a pair of mirrored SVG silhouettes I had drawn. The reference shows the THUMB POSITION,
 * which is the whole point of the step and the thing a silhouette of a hand could only imply.
 *
 * Keyed from line art on white: alpha comes from how far each pixel departs from white rather than
 * from a flood fill, which keeps the strokes and their shading — a background key would have taken
 * the hands' interior with it. Recoloured cream, because the original's blue would read as another
 * UI element competing with the lavender accent rather than as a drawing over the scene.
 */
function GripArt() {
  const styles = useFixedStyles(makeStyles);
  const drop = useSharedValue(0);
  useEffect(() => {
    // TWO drops, not a settle. A shape that arrives once and sits there is scenery; a shape that
    // falls into place twice is showing you a thing to do. The pause between them is what makes it
    // read as a repeat rather than a bounce.
    // Falls, resets, falls again — and then STAYS. The sequence ends on a settled 1 rather than
    // looping, because after the demonstration the hands are a reference the player checks their own
    // grip against, and something that kept restarting would pull the eye back every few seconds.
    drop.value = withSequence(
      withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }),
      withDelay(760, withTiming(0, { duration: 0 })),
      withDelay(160, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) })),
    );
  }, [drop]);
  const anim = useAnimatedStyle(() => ({
    // Faster than the travel, so it is never seen at the very top of its fall.
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
    // After the hands, so the card explains something already on screen rather than announcing it.
    // After the first drop lands, so the words appear on a phone that is already in frame.
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
      {/* Dim, not black: the scene stays legible underneath, because the point is how to HOLD the
          thing the player can see, not to replace it with a lesson. */}
      <View style={styles.scrim} pointerEvents="none" />
      <GripArt />
      {/* IN the ghost phone's screen, not in a card over it. A panel here covered the very thing it
          was describing, and the words belong where a player's eyes already are: on the display. */}
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
    // Full width along the bottom: the art is both hands and a device, so it wants the whole span
    // rather than a corner. Anchored low, where the hands actually are on a held device — and TALLER
    // than before, because the ghost phone is the part being read and it was too small to carry the
    // copy that now sits inside it.
    // Inset from the edges rather than bleeding past them: at 112% the hands ran off the sides and
    // the device came out larger than the screen it is meant to represent.
    art: {
      position: "absolute",
      left: SPACE.xl,
      right: SPACE.xl,
      bottom: SPACE.lg,
      alignItems: "center",
    },
    artImage: { width: "100%", height: 300 },
    // Centred on the SCREEN. The ghost device is centred horizontally and its display occupies the
    // middle of the frame, so screen-centre lands inside it — and centring on the screen is stable
    // where an offset measured against the art's height breaks the moment that height changes.
    copy: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      gap: SPACE.sm,
    },
    // Cream, with a dark shadow: this text sits on the DIMMED SCENE rather than on a panel, and a
    // theme-driven colour would vanish against a light backdrop.
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