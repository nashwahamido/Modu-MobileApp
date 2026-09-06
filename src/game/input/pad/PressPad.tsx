// The round tap-pad every press-to-drive control shows, and the wrap/hint frame around it.
// Five controls use it, and each had its own copy of the pad, pulse ring, squash spring and haptic — ~300 duplicated lines whose only job is to feel identical, which is exactly the kind that drifts unnoticed.
// What a tap DOES is NOT here: each control keeps its own driver maths and store writes. This owns the feel and nothing else.
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, type ImageSourcePropType } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { CONTROL, FONT } from "@/src/game/ui/system/theme";
import { TASK_CONTROL_BOTTOM } from "@/src/game/ui/hud/hudChrome";

// The pad's diameter. Exported because the slider tracks some of these controls switch to are sized against it.
export const PRESS_PAD_SIZE = 120;

// A round pad that squashes and thumps when tapped, under a slow outward pulse saying "tap me".
// The pulse loops rather than firing once: this pad is the only thing to do at that moment, and a one-shot hint is missed by anyone who looked at the model first.
// `resetKey` re-arms the squash — pass the action id. `pulse` false drops the ring, for a pad whose tap is a test rather than an instruction.
// `onPress` applies the tap AND decides how it feels: nothing for the default weight, an ImpactFeedbackStyle to override, or `false` to REJECT outright — a tap the control ignored must not squash or thump, or the pad lies about having done something.
export function PressPad({
  icon,
  resetKey,
  onPress,
  pulse: showPulse = true,
}: {
  // A glyph or an image. HAND_ICON is the drawn hand every "press it home" pad uses: the ✋ emoji it replaced renders in the SYSTEM font, so it looked different on every device.
  // The hammer and screwdriver stay emoji — they read consistently and no drawn pair exists yet.
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
      // Snap DOWN then spring back rather than animating both ways: the compression should already have happened by the time the finger registers it.
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

// The frame the five controls share. `wrap` is MIRRORED BY EACH CONTROL at its render site, not here: this is a plain StyleSheet with no hook to hang useMirror on.
// The drawn hand every "press it home" pad shows, in place of the ✋ emoji.
export const HAND_ICON = require("@/src/assets/ui/icons/icon-hand.png");

export const pressPadStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 160,
    // TASK_CONTROL_BOTTOM lives in ui/hud/hudChrome because the sliders read it too: pads and tracks share this corner and must clear the same toggles row, so the number belongs in neither folder.
    // Moving the caption above the pad was not enough on its own — the pill came clear of that row, the circle it belongs to did not.
    bottom: TASK_CONTROL_BOTTOM,
    alignItems: "center",
    gap: 8,
    // The caption is FIRST in the column, so it sits above the pad rather than below, where the toggles row crosses it.
    flexDirection: "column-reverse",
  },
  // A PILL, not bare text on the scene: bare text had to win against whatever backdrop the player chose, and the five controls had drifted into two colours trying.
  // A pill settles it — the text always has the same ground under it, so one colour is right everywhere.
  // fontFamily is deliberate: setting only fontWeight renders in the SYSTEM font rather than Lexend.
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
  // A no-op, kept so the call sites passing it still read: the pill above decides the colour they were arguing over.
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
  // Sits behind the pad at the same size, scaling outward as it fades.
  pulseRing: {
    position: "absolute",
    width: PRESS_PAD_SIZE,
    height: PRESS_PAD_SIZE,
    borderRadius: PRESS_PAD_SIZE / 2,
    borderWidth: 4,
    borderColor: CONTROL.fill,
  },
  icon: { fontSize: 44 },
  // Sized to the emoji it replaced, not to the pad: the drawn hand fills its canvas edge to edge where an emoji leaves padding, so it takes a little less to read at the same weight.
  iconImage: { width: 40, height: 40 },
});