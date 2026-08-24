import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { avatarForProfile } from "@/src/components/avatarAssets";
import { useGameStore } from "@/src/game/core/store";
import { useMirror } from "@/src/game/ui/system/handedness";
import { ELEVATION, Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import { tutorialPresentationForProfile } from "./presentation";
import { useTutorialStore } from "./store";

const sparkySmile = avatarForProfile("momentum");
// One pose for now: sparky-happy.png is the PREVIOUS art style, and a celebration that swapped to
// the old drawing mid-moment read worse than a celebration that keeps the current one. Restore the
// two-pose swap the day a happy pose exists in the new style — the source line below is the only
// thing that changes back.
const sparkyHappy = sparkySmile;
const confettiImage = require("../../assets/images/avatars/confetti.png");

const FEEDBACK = [
  "Great start!",
  "Nice placement!",
  "Perfect view!",
  "Nice work!",
  "Tool ready!",
  "Secure!",
  "Amazing progress!",
  "You did it!",
] as const;

export function momentumFeedbackForStep(index: number): string {
  return FEEDBACK[index] ?? "Great job!";
}

export function MomentumCompanion() {
  const styles = useFixedStyles(makeStyles);
  // LEFT-HAND MODE. Sparky hangs off the side of a CENTRED row, so which side he hangs off is a
  // placement like any other in the HUD and flips with the player's hand. Applied to the frame, the
  // confetti and the bubble — but never to `avatarImage`, which is a crop inside the circle rather
  // than a placement (see its note below).
  const m = useMirror();
  const profile = useGameStore((state) => state.profile);
  const mapOpen = useGameStore((state) => state.mapOpen);
  const presentation = tutorialPresentationForProfile(profile);
  const stepRewardReady = useTutorialStore((state) => state.stepRewardReady);
  const currentIndex = useTutorialStore((state) => state.currentIndex);
  const completed = useTutorialStore((state) => state.completed);
  const skipped = useTutorialStore((state) => state.skipped);
  const celebration = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!stepRewardReady) {
      celebration.setValue(0);
      return;
    }
    celebration.setValue(0);
    Animated.timing(celebration, {
      toValue: 1,
      duration: 720,
      useNativeDriver: true,
    }).start();
  }, [celebration, stepRewardReady]);

  if (!presentation.showMomentumCompanion || skipped || completed || mapOpen) return null;

  const avatarScale = celebration.interpolate({
    inputRange: [0, 0.32, 0.65, 1],
    outputRange: [1, 1.14, 1.04, 1],
  });
  const avatarLift = celebration.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, -8, 0],
  });
  const feedbackOpacity = celebration.interpolate({
    inputRange: [0, 0.15, 0.75, 1],
    outputRange: [0, 1, 1, 0],
  });
  const confettiScale = celebration.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.35, 1.12, 1.18],
  });
  const confettiRotate = celebration.interpolate({
    inputRange: [0, 1],
    outputRange: ["-8deg", "5deg"],
  });
  return (
    <View style={m(styles.root)} pointerEvents="box-none">
      {stepRewardReady ? (
        <Animated.Image
          source={confettiImage}
          resizeMode="contain"
          style={[
            m(styles.confettiArt),
            {
              opacity: feedbackOpacity,
              transform: [
                { scale: confettiScale },
                { rotate: confettiRotate },
              ],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.avatarFrame,
          {
            transform: [
              { translateY: avatarLift },
              { scale: avatarScale },
            ],
          },
        ]}
      >
        <Image
          source={stepRewardReady ? sparkyHappy : sparkySmile}
          style={styles.avatarImage}
          resizeMode="cover"
        />
      </Animated.View>

      {stepRewardReady ? (
        <Animated.View
          style={[m(styles.feedback), { opacity: feedbackOpacity }]}
        >
          <Text style={styles.feedbackText}>
            {momentumFeedbackForStep(currentIndex)}
          </Text>
        </Animated.View>
      ) : null}

    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      position: "absolute",
      // Level with the objective bar and one avatar-width to its left, which is where he belongs:
      // he reads as part of that row rather than as a loose token floating under it.
      //
      // The row's own top is 8, so with HUD_VERTICAL_MARGIN's floor of 15 this frame starts at y 21,
      // and that is the whole budget above him — the constraint confettiArt below is sized against.
      left: -82,
      top: -2,
      width: 74,
      height: 74,
      zIndex: 3,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarFrame: {
      width: 68,
      height: 68,
      overflow: "hidden",
      borderRadius: 34,
      borderWidth: 3,
      borderColor: theme.surface,
      backgroundColor: theme.surface,
      zIndex: 2,
      ...ELEVATION.card,
    },
    // The head art inside its circular frame. NOT a placement — it is a crop, so it is the one
    // offset in this file that must never be mirrored for a left-handed HUD: flipping it would slide
    // the face off-centre inside the circle.
    avatarImage: {
      position: "absolute",
      width: 140,
      height: 140,
      left: -36,
      top: -13,
    },
    // SIZED TO THE HEADROOM, and centred on Sparky rather than nudged.
    //
    // The frame's top sits at y 21 — HUD_VERTICAL_MARGIN's floor of 15, plus the row's top of 8,
    // plus this frame's -2. That is the whole budget above him, and the burst scales while it plays:
    // `confettiScale` reaches 1.12 at t=0.7, while it is still fully opaque. Centred on the 74pt
    // frame, a burst of size S therefore needs 21 - (S - 74)/2 - S*0.06 >= 0 to survive that peak.
    //
    // 160 needed 43 above and lost 32 of it — that is the band with its top sliced off. 128 still
    // loses 14, 112 loses 5. 100 is the largest round size that clears it with room to spare (+2),
    // so the burst is smaller than it was and, for the first time, WHOLE.
    //
    // Centred on both axes: (74 - 100) / 2 = -13. It was -47 vertically, four points worse than even
    // a correct centring of the old size.
    confettiArt: {
      position: "absolute",
      left: -13,
      top: -13,
      width: 100,
      height: 100,
      zIndex: 1,
    },
    // BELOW SPARKY. It used to sit above him (`bottom: 72`), which the old comment blamed on the
    // Pause button and the progress card — and Pause has since been removed from this row entirely.
    // Above was also the clipped direction: the bubble's own height put its top edge off-screen.
    //
    // `top: 78` clears the 68pt avatar inside the 74pt frame with a small gap. Horizontally it is
    // centred on the frame the same way the confetti is: (74 - 118) / 2 = -22.
    feedback: {
      position: "absolute",
      left: -22,
      top: 78,
      width: 118,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: theme.surface,
      alignItems: "center",
      zIndex: 4,
      ...ELEVATION.card,
    },
    feedbackText: {
      color: theme.text,
      fontSize: 10,
      fontWeight: "900",
    },
  });