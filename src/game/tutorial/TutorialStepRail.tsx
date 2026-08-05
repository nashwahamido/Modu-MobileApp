import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useGameStore } from "@/src/game/core/store";
import { ACCENT_LIGHT, Theme, useStyles } from "@/src/game/ui/system/theme";
import { tutorialPresentationForProfile } from "./presentation";
import { useTutorialStore } from "./store";

const ROW_HEIGHT = 24;

export function TutorialStepRail() {
  const styles = useStyles(makeStyles);
  const profile = useGameStore((state) => state.profile);
  const presentation = tutorialPresentationForProfile(profile);
  const steps = useTutorialStore((state) => state.steps);
  const currentIndex = useTutorialStore((state) => state.currentIndex);
  const completed = useTutorialStore((state) => state.completed);
  const skipped = useTutorialStore((state) => state.skipped);
  const phase = useTutorialStore((state) => state.phase);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    translateY.setValue(ROW_HEIGHT * 0.55);
    opacity.setValue(0.35);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 18,
        stiffness: 190,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentIndex, opacity, translateY]);

  const visibleSteps = useMemo(() => {
    const first = Math.max(0, currentIndex - 1);
    const last = Math.min(steps.length, currentIndex + 1);
    return steps.slice(first, last).map((step, offset) => ({
      step,
      index: first + offset,
    }));
  }, [currentIndex, steps]);

  if (
    !presentation.showChecklist ||
    completed ||
    skipped ||
    phase !== "core" ||
    !steps[currentIndex]
  ) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.rail,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {visibleSteps.map(({ step, index }) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <View
            key={step.id}
            style={[styles.row, isCurrent && styles.currentRow]}
          >
            <Text
              style={[
                styles.marker,
                isDone && styles.doneText,
                !isCurrent && styles.fadedText,
              ]}
            >
              {isDone ? "✓" : isCurrent ? "●" : "○"}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                isCurrent && styles.currentText,
                isDone && styles.doneText,
                !isCurrent && styles.fadedText,
              ]}
            >
              {step.shortLabel ?? step.message}
            </Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    rail: {
      width: "100%",
      gap: 2,
    },
    row: {
      height: ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      borderRadius: 9,
    },
    currentRow: {
      backgroundColor: "rgba(141,123,168,0.18)",
      borderLeftWidth: 3,
      borderLeftColor: ACCENT_LIGHT,
      paddingLeft: 7,
    },
    marker: {
      width: 14,
      color: ACCENT_LIGHT,
      fontSize: 11,
      fontWeight: "900",
      textAlign: "center",
    },
    label: {
      flex: 1,
      color: theme.text,
      fontSize: 10,
      fontWeight: "700",
    },
    currentText: {
      fontSize: 11,
      fontWeight: "900",
    },
    doneText: {
      color: theme.success,
    },
    fadedText: {
      opacity: 0.42,
    },
  });
