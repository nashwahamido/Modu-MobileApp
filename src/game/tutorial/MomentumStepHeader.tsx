import { StyleSheet, Text, View } from "react-native";

import { Theme, useStyles } from "@/src/game/ui/system/theme";
import { momentumFeedbackForStep } from "./MomentumCompanion";
import { useTutorialStore } from "./store";

export function MomentumStepHeader() {
  const styles = useStyles(makeStyles);
  const currentIndex = useTutorialStore((state) => state.currentIndex);
  const steps = useTutorialStore((state) => state.steps);
  const stepRewardReady = useTutorialStore((state) => state.stepRewardReady);

  const currentStep = steps[currentIndex];
  if (!currentStep) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>
        {stepRewardReady ? "SMALL WIN" : "NEXT STEP"}
      </Text>
      <Text style={styles.action} numberOfLines={1}>
        {stepRewardReady
          ? `✓ ${momentumFeedbackForStep(currentIndex)}  +10 XP`
          : currentStep.shortLabel ?? currentStep.message}
      </Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      gap: 2,
      paddingHorizontal: 4,
    },
    eyebrow: {
      color: theme.gold,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    action: {
      color: theme.text,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "900",
    },
  });
