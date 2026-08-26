// The round tap-pad every press-to-drive control shows, and the wrap/hint frame around it.
//
// Five controls use it: PressControl (seat a push-fit part), TapControl (drive a struck fastener), InsertPressControl (press a 3-phase fastener from stage to loose), HookPressControl's first phase (press a panel onto its keyhole pins) and PushTestControl's first beat (tap a push-open drawer). All five had their own copy of the pad, the pulse ring, the squash spring and the haptic — around 300 duplicated lines whose only job is to feel identical, which is exactly the kind that drifts unnoticed.
//
// What is NOT here: what a tap DOES. Each control keeps its own driver maths and its own store writes, because those genuinely differ. This owns the feel and nothing else.
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, type ImageSourcePropType } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { CONTROL, FONT } from "@/src/game/ui/system/theme";
import { TASK_CONTROL_BOTTOM } from "@/src/game/ui/hud/hudChrome";

/** The pad's diameter. Exported because the slider tracks some of these controls switch to are sized against it. */
export const PRESS_PAD_SIZE = 120;

/**
 * A round pad that squashes and thumps when tapped, under a slow outward pulse that says "tap me".
 *
 * The pulse runs forever rather than once: this pad is the only thing to do at that moment, and a
 * one-shot hint is missed by anyone who looked at the model first.
 *
 * @param icon      the glyph in the middle — the tool the action reads as
 * @param resetKey  changing this re-arms the squash; pass the action id
 * @param onPress   applies the tap, and decides how it should FEEL. Return nothing for the default weight,
 *                  an ImpactFeedbackStyle to override it (HookPress softens its final tap, PushTest's is a
 *                  light test), or `false` to REJECT the tap outright — one the control ignored must not
 *                  squash or thump, or the pad lies about having done something
 * @param pulse     set false to drop the ring, for a pad whose tap is a test rather than an instruction
 */
export function PressPad({
  icon,
  resetKey,
  onPress,
  pulse: showPulse = true,
}: {
  /** A glyph, or an image. HAND_ICON below is the drawn hand every "press it home" pad uses — the ✋
   *  emoji it replaced is rendered by the SYSTEM font, so it looked like a different hand on every
   *  device and matched nothing else in the app. The hammer and screwdriver are still emoji: they
   *  read consistently and no drawn pair exists for them yet. */
  icon: string | ImageSourcePropType;
  resetKey: string;
  onPress: () => void | false | Haptics.ImpactFeedbackStyle;
  pulse?: boolean;
}) {
  const squash = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showPulse) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, showPulse]);

  useEffect(() => {
    squash.setValue(1);
  }, [resetKey, squash]);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      const outcome = onPress();
      if (outcome === false) return;
      // Heavy by default: most of these actions are a shove or a strike, and the weight is the point.
      Haptics.impactAsync(outcome ?? Haptics.ImpactFeedbackStyle.Heavy);
      // Snap DOWN then spring back, rather than animating both ways — the compression should already have happened by the time the finger registers it.
      squash.setValue(0.82);
      Animated.spring(squash, {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
        bounciness: 14,
      }).start();
    });

  return (
    <>
      {showPulse ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) },
              ],
            },
          ]}
        />
      ) : null}
      <GestureDetector gesture={tap}>
        <Animated.View style={[styles.pad, { transform: [{ scale: squash }] }]}>
          {typeof icon === "string" ? (
            <Text style={styles.icon}>{icon}</Text>
          ) : (
            <Image source={icon} style={styles.iconImage} resizeMode="contain" />
          )}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

/** The frame the five controls share: where the cluster sits, and the caption under it. `wrap` is MIRRORED BY EACH CONTROL at its own render site (useMirror), not here — this is a plain StyleSheet with no hook to hang it on, and the controls are the things that know they are on screen. */
/** The drawn hand every "press it home" pad shows, in place of the ✋ emoji. */
export const HAND_ICON = require("@/src/assets/ui/icons/icon-hand.png");

export const pressPadStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 160,
    // Was 36, which put the pad's own bottom 24 points inside the toggles row. The shared offset that fixed it is TASK_CONTROL_BOTTOM in ui/hud/hudChrome, where the sliders read it too — the pads and the tracks occupy the same corner and must clear the same row, so the number cannot live in either folder.
    //
    // The caption moved above the pad for the same reason and is not enough on its own: the pill came clear, the circle it belongs to did not.
    bottom: TASK_CONTROL_BOTTOM,
    alignItems: "center",
    gap: 8,
    // The caption is FIRST in the column, so it sits above the pad. It used to hang below, where the
    // auto / Focus / Spot row crosses it — the one band of this screen that is never free.
    flexDirection: "column-reverse",
  },
  // A LAVENDER PILL, not bare text on the scene. Bare text had to win against whatever backdrop the
  // player had chosen and against the model itself, and the five controls had drifted into two
  // different colours trying: four cream, TapControl's dark. A pill settles it — the text always has
  // the same ground under it, so one colour is right everywhere.
  //
  // fontFamily is deliberate: four of the five copies set only fontWeight, which React Native renders
  // in the SYSTEM font rather than Lexend (see convention 5 in ui/theme).
  hint: {
    fontFamily: FONT,
    fontSize: 12,
    color: "#FBF8F3",
    fontWeight: "700",
    backgroundColor: CONTROL.fill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
  },
  // Kept as a no-op so the call sites that pass it still read: the colour they were arguing over is
  // decided by the pill above now.
  hintInk: {},
});

const styles = StyleSheet.create({
  pad: {
    width: PRESS_PAD_SIZE,
    height: PRESS_PAD_SIZE,
    borderRadius: PRESS_PAD_SIZE / 2,
    borderWidth: 4,
    borderColor: CONTROL.fill,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Sits behind the pad at the same size, and scales outward as it fades.
  pulseRing: {
    position: "absolute",
    width: PRESS_PAD_SIZE,
    height: PRESS_PAD_SIZE,
    borderRadius: PRESS_PAD_SIZE / 2,
    borderWidth: 4,
    borderColor: CONTROL.fill,
  },
  icon: { fontSize: 44 },
  // Sized to the emoji it replaced rather than to the pad: 44 was the glyph's box, and the drawn
  // hand fills its own canvas edge to edge where an emoji leaves its own padding, so it takes a
  // little less to read at the same weight.
  iconImage: { width: 40, height: 40 },
});