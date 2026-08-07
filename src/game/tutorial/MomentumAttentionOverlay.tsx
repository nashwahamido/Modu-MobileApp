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
import { ACCENT_LIGHT, ELEVATION, Theme, useStyles } from "@/src/game/ui/system/theme";
import { tutorialPresentationForProfile } from "./presentation";
import { useTutorialStore } from "./store";

export function MomentumAttentionOverlay() {
  const styles = useStyles(makeStyles);
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
            {resumeVisible ? "Welcome back!" : "Ready when you are!"}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {resumeVisible ? "Continue" : "Next"}: {stepLabel}
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
      width: 310,
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      borderWidth: 3,
      borderColor: theme.gold,
      backgroundColor: theme.surface,
      ...ELEVATION.card,
    },
    attentionDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.gold,
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "900",
    },
    message: {
      marginTop: 2,
      color: theme.textDim,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "800",
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
