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
import { ELEVATION, Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import { tutorialPresentationForProfile } from "./presentation";
import { useTutorialStore } from "./store";

const sparkySmile = avatarForProfile("momentum");
const sparkyHappy = require("../../assets/images/avatars/sparky-happy.png");
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
    <View style={styles.root} pointerEvents="box-none">
      {stepRewardReady ? (
        <Animated.Image
          source={confettiImage}
          resizeMode="contain"
          style={[
            styles.confettiArt,
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
          style={[styles.feedback, { opacity: feedbackOpacity }]}
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
      // The top row begins with Pause. Keep Sparky one full chip-gap to its
      // left so the avatar never covers the Pause hit target.
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
    avatarImage: {
      position: "absolute",
      width: 140,
      height: 140,
      left: -36,
      top: -13,
    },
    confettiArt: {
      position: "absolute",
      left: -43,
      top: -47,
      width: 160,
      height: 160,
      zIndex: 1,
    },
    feedback: {
      position: "absolute",
      // Keep the encouragement above Sparky: below/right was covered by the
      // Pause button and progress card during the next-step transition.
      left: -22,
      bottom: 72,
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
