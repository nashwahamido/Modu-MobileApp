import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useGameStore } from "@/src/game/core/store";
import { ACCENT_LIGHT, ELEVATION, Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import { tutorialPresentationForProfile } from "./presentation";
import { useTutorialStore } from "./store";

export function MomentumAttentionOverlay() {
  const styles = useFixedStyles(makeStyles);
  const profile = useGameStore((state) => state.profile);
  const presentation = tutorialPresentationForProfile(profile);
  const currentIndex = useTutorialStore((state) => state.currentIndex);
  const steps = useTutorialStore((state) => state.steps);
  const completed = useTutorialStore((state) => state.completed);
  const skipped = useTutorialStore((state) => state.skipped);
  const stepRewardReady = useTutorialStore((state) => state.stepRewardReady);
  const setAttentionOverlayActive = useTutorialStore(
    (state) => state.setAttentionOverlayActive,
  );
  const heldActionId = useGameStore((state) => state.heldActionId);
  const mapOpen = useGameStore((state) => state.mapOpen);
  const completedActionCount = useGameStore((state) => state.completed.length);
  const activeToolAction = useGameStore(
    (state) => state.driveActionId ?? state.orientationActionId,
  );
  const [reminderVisible, setReminderVisible] = useState(false);
  const [resumeVisible, setResumeVisible] = useState(false);
  const appState = useRef(AppState.currentState);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setReminderVisible(false);
    if (
      !presentation.showMomentumCompanion ||
      skipped ||
      completed ||
      mapOpen ||
      stepRewardReady ||
      resumeVisible
    ) {
      return;
    }
    const timeout = setTimeout(() => setReminderVisible(true), 12000);
    return () => clearTimeout(timeout);
  }, [
    activeToolAction,
    completed,
    completedActionCount,
    currentIndex,
    heldActionId,
    mapOpen,
    presentation.showMomentumCompanion,
    resumeVisible,
    skipped,
    stepRewardReady,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;
      if (
        presentation.showMomentumCompanion &&
        previousState !== "active" &&
        nextState === "active"
      ) {
        setReminderVisible(false);
        setResumeVisible(true);
      }
    });
    return () => subscription.remove();
  }, [presentation.showMomentumCompanion]);

  useEffect(() => {
    if (!reminderVisible && !resumeVisible) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.035,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reminderVisible, resumeVisible]);

  useEffect(() => {
    setAttentionOverlayActive(reminderVisible || resumeVisible);
  }, [reminderVisible, resumeVisible, setAttentionOverlayActive]);

  useEffect(
    () => () => {
      useTutorialStore.getState().setAttentionOverlayActive(false);
    },
    [],
  );

  if (
    !presentation.showMomentumCompanion ||
    skipped ||
    completed ||
    mapOpen ||
    (!reminderVisible && !resumeVisible)
  ) {
    return null;
  }

  const stepLabel =
    steps[currentIndex]?.shortLabel ??
    steps[currentIndex]?.message ??
    "Continue the current step";

  const dismissReminder = () => {
    if (!reminderVisible || resumeVisible) return;
    setReminderVisible(false);
    useTutorialStore.getState().setAttentionOverlayActive(false);
  };

  return (
    <View
      style={styles.layer}
      pointerEvents="auto"
      onPointerMove={dismissReminder}
      onPointerDown={dismissReminder}
      onTouchStart={dismissReminder}
    >
      <View style={styles.scrim} pointerEvents="none" />
      <Animated.View
        style={[styles.card, { transform: [{ scale: pulse }] }]}
        pointerEvents={resumeVisible ? "auto" : "none"}
      >
        <View style={styles.attentionDot} />
        <View style={styles.copy}>
          <Text style={styles.title}>
            {resumeVisible
              ? "Welcome back!"
              : "Looks like you've stepped away from the tutorial."}
          </Text>
          <Text style={styles.message}>
            {resumeVisible
              ? "Sparky is ready to keep building with you."
              : "Sparky will be right here when you're ready to continue."}
          </Text>
          <Text style={styles.nextStep}>
            Next, you can continue with: {stepLabel}
          </Text>
        </View>
        {resumeVisible ? (
          <Pressable
            accessibilityRole="button"
            style={styles.resumeButton}
            onPress={() => {
              setResumeVisible(false);
              setReminderVisible(false);
              useGameStore.getState().suggestNext();
            }}
          >
            <Text style={styles.resumeButtonText}>Resume</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 80,
      alignItems: "center",
      paddingTop: 92,
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.58)",
    },
    card: {
      width: 470,
      minHeight: 116,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderRadius: 20,
      borderWidth: 3,
      borderColor: theme.gold,
      backgroundColor: theme.surface,
      ...ELEVATION.card,
    },
    attentionDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.gold,
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: theme.text,
      fontSize: 18,
      lineHeight: 23,
      fontWeight: "900",
    },
    message: {
      marginTop: 5,
      color: theme.textDim,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "700",
    },
    nextStep: {
      marginTop: 7,
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "900",
    },
    resumeButton: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 11,
      backgroundColor: ACCENT_LIGHT,
    },
    resumeButtonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },
  });
