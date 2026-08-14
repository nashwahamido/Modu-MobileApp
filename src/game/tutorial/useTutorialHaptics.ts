import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";

import { useGameStore } from "@/src/game/core/store";
import {
  hapticCueForTutorialCompletion,
  hapticCueForTutorialStep,
  type TutorialHapticCue,
} from "@/src/game/tutorial/haptics";
import { useTutorialStore } from "@/src/game/tutorial/store";

function playCue(cue: TutorialHapticCue) {
  if (cue === "selection") {
    void Haptics.selectionAsync();
  } else if (cue === "light") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } else if (cue === "success") {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

/**
 * Adds only the tutorial feedback that the physical assembly controls do not
 * already provide. This stays outside the Zustand stores so their state
 * transitions remain deterministic and testable.
 */
export function useTutorialHaptics() {
  const profile = useGameStore((state) => state.profile);
  const stepRewardsClaimed = useTutorialStore(
    (state) => state.stepRewardsClaimed,
  );
  const pendingAdvanceStepId = useTutorialStore(
    (state) => state.pendingAdvanceStepId,
  );
  const currentStepEvent = useTutorialStore(
    (state) => state.steps[state.currentIndex]?.event,
  );
  const settingsReady = useTutorialStore((state) => state.settingsReady);

  const previousRewards = useRef(stepRewardsClaimed);
  const previousSettingsReady = useRef(settingsReady);

  useEffect(() => {
    if (stepRewardsClaimed < previousRewards.current) {
      previousRewards.current = stepRewardsClaimed;
      return;
    }
    if (
      stepRewardsClaimed > previousRewards.current &&
      pendingAdvanceStepId
    ) {
      playCue(hapticCueForTutorialStep(currentStepEvent, profile));
    }
    previousRewards.current = stepRewardsClaimed;
  }, [currentStepEvent, pendingAdvanceStepId, profile, stepRewardsClaimed]);

  useEffect(() => {
    if (settingsReady && !previousSettingsReady.current) {
      playCue(hapticCueForTutorialCompletion());
    }
    previousSettingsReady.current = settingsReady;
  }, [settingsReady]);
}
