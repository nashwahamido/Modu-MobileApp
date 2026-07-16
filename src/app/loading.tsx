import { router } from "expo-router";
import type { Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { getCurrentSession } from "@/src/services/auth";
import { createProfileIfMissing } from "@/src/services/profile";
import { getLatestOnboardingMode } from "@/src/services/onboarding";
import { useGameStore } from "@/src/game/core/store";
import type { ProfileId } from "@/src/game/core/profile";

const mascot = require("../assets/mascot/mascot.png");
const questionnaireRoute = "/onboarding-questionnaire" as Href;
const mainRoute = "/play" as Href;
const profileIds = new Set<ProfileId>(["visual", "momentum", "clearPath", "control"]);

export default function LoadingScreen() {
  const progress = useRef(new Animated.Value(0)).current;
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const progressListener = progress.addListener(({ value }) => {
      setPercent(Math.round(value * 100));
    });

    Animated.timing(progress, {
      toValue: 1,
      duration: 1800,
      useNativeDriver: false,
    }).start(async ({ finished }) => {
      if (!finished) {
        return;
      }

      try {
        const session = await getCurrentSession();
        const user = session?.user;

        if (!user) {
          router.replace(questionnaireRoute);
          return;
        }

        const profile = await createProfileIfMissing(user.id, user.email);
        if (!profile.onboarding_completed) {
          router.replace(questionnaireRoute);
          return;
        }

        const latestMode = await getLatestOnboardingMode(user.id);
        if (latestMode && profileIds.has(latestMode as ProfileId)) {
          useGameStore.getState().applyProfile(latestMode as ProfileId);
        }
        router.replace(mainRoute);
      } catch (error) {
        router.replace(questionnaireRoute);
      }
    });

    return () => {
      progress.removeListener(progressListener);
    };
  }, [progress]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.mascotCircle}>
          <Image source={mascot} style={styles.mascot} />
        </View>
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.percentText}>{percent}%</Text>
        </View>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3ECE0",
    paddingHorizontal: 42,
    paddingVertical: 22,
  },
  content: {
    width: "100%",
    maxWidth: 430,
    alignItems: "center",
    gap: 18,
  },
  mascotCircle: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#E8D48C",
    borderRadius: 46,
    borderWidth: 1,
    backgroundColor: "#FBF8F3",
  },
  mascot: {
    width: 70,
    height: 70,
    borderRadius: 18,
  },
  progressWrap: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 12,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#d8cdbb",
  },
  progressFill: {
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#8FA876",
  },
  percentText: {
    width: 40,
    color: "#665f55",
    fontSize: 11,
    fontWeight: "900",
  },
  loadingText: {
    color: "#665f55",
    fontSize: 13,
    fontWeight: "800",
  },
});
